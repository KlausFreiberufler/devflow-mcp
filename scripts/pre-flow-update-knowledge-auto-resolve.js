#!/usr/bin/env node
/**
 * DF-320 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a flow_update transition to `approval` or
 * `done` (review→done), call the backend's bulk auto-resolve endpoint
 * BEFORE the actual flow_update fires. This way the agent never sees
 * the knowledge-gate failure — gaps are extended (or drafts created)
 * automatically per the Iron Law.
 *
 * Pattern: [[mcp-pre-tool-use-hook-for-state-transition-gates]]
 *
 * Behavior:
 *   - Reads the tool input from stdin (payload.input).
 *   - Only acts when input.currentState ∈ {'approval','done'}.
 *   - Resolves the active flowId (input.flowId or from .devflow-active).
 *   - Resolves the linked projectId from .devflow-active.
 *   - POST /api/projects/:id/knowledge/auto-resolve { flowId }.
 *   - Prints a 1-line summary so the user sees what happened.
 *   - Never blocks: errors are logged silently and pass through.
 *
 * Token-merging into the next flow_update is handled by the agent: the
 * response surfaces `disciplineToken` which is also persisted in the DB
 * so flow_update reads it server-side.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readDevflowToken } from './lib/hook-auth.js';
import { emitContext, warn } from './lib/hook-output.js';

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    // DF-434 — Claude Code's PreToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_update')) return;
    const args = payload.tool_input || payload.input || {};
    const targetState = args.currentState;
    if (targetState !== 'approval' && targetState !== 'done') return;

    const session = readDevFlowActive();
    const flowId = args.flowId || session?.flowId;
    const projectId = session?.projectId;
    const apiBase = session?.apiBase || process.env.DEVFLOW_API_BASE || 'https://api.app.dev-flow.tech';
    const token = session?.token || readDevflowToken();
    if (!flowId || !projectId || !token) {
      warn('knowledge-auto-resolve hook skipped — missing flowId/projectId/token (.devflow-active oder ~/.devflow/credentials.json pruefen)');
      return;
    }

    const url = `${apiBase}/api/projects/${encodeURIComponent(projectId)}/knowledge/auto-resolve`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ flowId }),
    });
    if (!res.ok) {
      // 404 → backend doesn't have the endpoint yet (older version) → no-op
      if (res.status !== 404) warn(`knowledge-auto-resolve hook: HTTP ${res.status} from auto-resolve endpoint`);
      return;
    }
    const json = await res.json().catch(() => null);
    if (!json?.success) return;

    const { resolved = [], pendingDrafts = [], summary = {} } = json.data || {};
    const counts = [];
    if (summary.extend) counts.push(`${summary.extend} extend`);
    if (summary.create_draft) counts.push(`${summary.create_draft} draft`);
    if (summary.intent_defer) counts.push(`${summary.intent_defer} defer`);
    if (counts.length === 0) return;

    // DF-420 DRIFT #1 — Topic-Vorschau anhängen damit der Agent sieht WAS
    // genau extended/created/deferred wurde, nicht nur die Counts.
    const topics = Array.isArray(resolved)
      ? resolved.slice(0, 3).map(r => r?.topic).filter(Boolean)
      : [];
    const moreCount = Array.isArray(resolved) && resolved.length > 3 ? `, +${resolved.length - 3}` : '';
    const topicSnippet = topics.length > 0 ? ` — topics: ${topics.join(', ')}${moreCount}` : '';

    emitContext(`Wiki auto-resolved: ${counts.join(', ')}${topicSnippet}`);
  } catch (e) {
    // Never block flow_update on hook errors — but leave a trace (DF-437 AC-3).
    warn(`knowledge-auto-resolve hook error: ${e?.message || e}`);
  }
});

function readDevFlowActive() {
  try {
    const candidates = [
      path.join(process.cwd(), '.devflow-active'),
      path.join(os.homedir(), '.devflow-active'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
