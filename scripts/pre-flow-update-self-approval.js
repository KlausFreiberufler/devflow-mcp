#!/usr/bin/env node
/**
 * DF-323 / DF-437 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a state-transition to `approval`, `ready` or `done`
 * AND the project has self-approval enabled, this hook:
 *   1. Looks up the required discipline-skills via GET /api/flows/:id/required-skills
 *   2. Injects the requirements into the AGENT's context via
 *      hookSpecificOutput.additionalContext (DF-437 — plain stdout never
 *      reaches the model on PreToolUse; it only lands in the debug log).
 *
 * The message teaches the two token paths, preferred first:
 *   a) DF-435 body fields on flow_update itself (testStrategy /
 *      acVerification / planReconciliation / filesChanged) — the backend
 *      auto-emits the tokens from that evidence, AND
 *   b) the `discipline_tokens_auto_emit` MCP tool as a bulk fallback.
 *
 * This hook cannot modify the tool input (Claude Code's hook protocol has no
 * input-rewrite for PreToolUse) — it informs, the backend enforces.
 *
 * Fail-loud (DF-437 AC-3): every silent-return now leaves a `[devflow-hook]`
 * line on stderr. exit code stays 0 — hooks never block the tool call.
 *
 * Pattern: [[auto-self-approval-via-pre-tool-use-hook]]
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
    // DF-434 — Claude Code's PreToolUse payload uses `tool_name` (not `tool`); the old
    // `payload.tool` guard always read undefined → this hook silently no-opped in every
    // real session. Read tool_name first, keep `tool` as a fallback for synthetic tests.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_update')) return;
    const args = payload.tool_input || payload.input || {};
    const targetState = args.currentState;
    if (targetState !== 'approval' && targetState !== 'ready' && targetState !== 'done') return;

    // If the agent already passed selfApproved (true or false), respect that.
    if (args.selfApproved !== undefined) return;

    const session = readDevFlowActive();
    const flowId = args.flowId || session?.flowId;
    const projectId = session?.projectId;
    const apiBase = session?.apiBase || process.env.DEVFLOW_API_BASE || 'https://api.app.dev-flow.tech';
    const token = session?.token || readDevflowToken();
    if (!flowId || !projectId || !token) {
      const missing = [
        !flowId ? 'flowId' : null,
        !projectId ? 'projectId (.devflow-active fehlt/unvollständig?)' : null,
        !token ? 'auth token (~/.devflow/credentials.json abgelaufen/fehlt?)' : null,
      ].filter(Boolean).join(', ');
      warn(`self-approval hook skipped — missing: ${missing}`);
      return;
    }

    // 1) Check project self-approval flag
    const cfgRes = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!cfgRes.ok) {
      warn(`self-approval hook: project-config lookup failed with HTTP ${cfgRes.status}`);
      return;
    }
    const cfgJson = await cfgRes.json().catch(() => null);
    const allowSelf = cfgJson?.data?.allowAgentSelfApproval ?? cfgJson?.data?.allow_agent_self_approval;
    if (!allowSelf) return;

    // 2) Look up required skills
    const reqRes = await fetch(
      `${apiBase}/api/flows/${encodeURIComponent(flowId)}/required-skills?targetState=${encodeURIComponent(targetState)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!reqRes.ok) {
      warn(`self-approval hook: required-skills lookup failed with HTTP ${reqRes.status}`);
      return;
    }
    const reqJson = await reqRes.json().catch(() => null);
    const skills = reqJson?.data?.skills || [];
    if (skills.length === 0) return;

    // 3) Inject into the agent's context (DF-437). DF-422 — include the
    // skill-file paths so the agent can read the Iron Laws directly.
    const skillPaths = skills.map(s => `packages/skills/skills/${s}/SKILL.md`).join(', ');
    const evidenceHint = targetState === 'done'
      ? 'acVerification: [{acId, command, output}], planReconciliation: { perAcStatus: [{acId, status}] }, filesChanged: [<paths>]'
      : 'testStrategy: "<Red→Green-Strategie ≥30 Zeichen>"';
    emitContext(
      `Self-Approval ON — transition '${targetState}' needs ${skills.length} discipline-token(s): ${skills.join(', ')}.\n` +
      `Preferred: include the evidence in THIS flow_update call — ${evidenceHint} — the backend auto-emits the tokens from it (DF-435).\n` +
      `Fallback: discipline_tokens_auto_emit({ flowId: "${flowId}", targetState: "${targetState}" }) bulk-emits via the platform.\n` +
      `Iron Laws: ${skillPaths}`
    );
  } catch (e) {
    // Never block flow_update on hook errors — but never fail silently either.
    warn(`self-approval hook error: ${e?.message || e}`);
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
