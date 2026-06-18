#!/usr/bin/env node
/**
 * DF-415 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * Auto-derive `filesChanged` from the local git checkout for transitions
 * to `review` or `done`, so the backend ADR-Compliance gate (DF-376 +
 * DF-415 tightening) doesn't need the agent to manually compose the list.
 *
 * Pattern: sister to `pre-flow-update-knowledge-auto-resolve.js` (DF-320)
 * — both implement [[mcp-pre-tool-use-hook-for-state-transition-gates]].
 *
 * Behavior:
 *   - Reads the tool input from stdin (payload.input).
 *   - Only acts when input.currentState ∈ {'review','done'}.
 *   - Resolves session (flowId, projectId, token) from .devflow-active.
 *   - Fetches flow.branch_name + project.git-settings via API to learn the
 *     base branch + enabled flag.
 *   - Runs `git diff --name-only <base>...<branch>` in the current cwd.
 *   - Prints a 1-line audit notice with the count + the files (newline-
 *     separated, easy to copy) so the agent can include them in the next
 *     flow_update call if it hits the gate.
 *   - Claude-Code's hook protocol does NOT allow modifiedToolInput
 *     (see DF-413 Drift #2), so we cannot mutate the body directly — the
 *     stdout is the channel for surfacing the data to the agent.
 *   - Never blocks: any error → silent pass-through.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { readDevflowToken } from './lib/hook-auth.js';

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-434 — Claude Code's PreToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_update')) return;
    const args = payload.tool_input || payload.input || {};
    const targetState = args.currentState;
    if (targetState !== 'review' && targetState !== 'done') return;

    // If the agent already passed filesChanged, respect it — don't re-derive.
    if (Array.isArray(args.filesChanged) && args.filesChanged.length > 0) return;

    const session = readDevFlowActive();
    const flowId = args.flowId || session?.flowId;
    const projectId = session?.projectId;
    const apiBase = session?.apiBase || process.env.DEVFLOW_API_BASE || 'https://api.app.dev-flow.tech';
    const token = session?.token || readDevflowToken();
    if (!flowId || !projectId || !token) return;

    const flow = await apiGet(`${apiBase}/api/flows/${encodeURIComponent(flowId)}`, token);
    if (!flow?.data) return;
    const branch = flow.data.branch_name || flow.data.branchName;
    if (!branch) return;

    const git = await apiGet(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/git-settings`, token);
    const gitEnabled = git?.data?.enabled === true || git?.data?.enabled === 1;
    if (!gitEnabled) return;
    const base = git.data.defaultBranch || git.data.default_branch || 'main';

    const files = runGitDiff(base, branch);
    if (!files || files.length === 0) {
      process.stdout.write(`🛈 DF-415 ADR-Compliance: 0 files in diff ${base}...${branch} — pass filesChanged: [] if the gate trips.\n`);
      return;
    }

    process.stdout.write(`🛈 DF-415 ADR-Compliance: ${files.length} files in diff ${base}...${branch}. If the ADR-compliance gate fires, re-run flow_update with:\n`);
    process.stdout.write(`   filesChanged: ${JSON.stringify(files)}\n`);
  } catch {
    // Never block flow_update on hook errors.
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

async function apiGet(url, token) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Runs `git diff --name-only <base>...<branch>` safely. Returns string[]
 * of changed files (one per line, blanks filtered), or null on error.
 *
 * Branch + base are sourced from API (project git-settings + flow row)
 * but still pass through execFileSync's arg-vector path — no shell, no
 * injection surface.
 */
function runGitDiff(base, branch) {
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', `${base}...${branch}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
    );
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

// Exported helpers for unit tests (loaded via dynamic import — `node --test`
// or vitest can pull them via createRequire / `await import()`).
export const _internals = { readDevFlowActive, runGitDiff };
