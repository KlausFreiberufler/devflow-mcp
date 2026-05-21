#!/usr/bin/env node
/**
 * DF-323 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a state-transition to `approval` or `done` AND
 * the project has self-approval enabled, this hook:
 *   1. Looks up the required discipline-skills via GET /api/flows/:id/required-skills
 *   2. Bulk-emits all tokens via POST /api/flows/:id/discipline-tokens/auto-emit
 *   3. Surfaces a 1-line stdout summary so the user sees what happened
 *
 * The agent never reasons about tokens — they're served by the platform.
 * But: this hook only operates in informational mode (prints status). The
 * actual `selfApproved: true + disciplineTokens: [...]` injection into the
 * tool call is not possible from a hook (Claude Code's hook protocol does
 * not allow modifying the tool input). What this hook achieves is making
 * the audit trail visible to the user; the agent should still pass the
 * tokens explicitly. This is a UX/visibility improvement; the structural
 * Self-Approval automation needs a server-side proxy (deferred).
 *
 * Pattern: [[auto-self-approval-via-pre-tool-use-hook]]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    if (!payload.tool || !payload.tool.endsWith('__flow_update')) return;
    const args = payload.tool_input || payload.input || {};
    const targetState = args.currentState;
    if (targetState !== 'approval' && targetState !== 'ready' && targetState !== 'done') return;

    // If the agent already passed selfApproved (true or false), respect that.
    if (args.selfApproved !== undefined) return;

    const session = readDevFlowActive();
    const flowId = args.flowId || session?.flowId;
    const projectId = session?.projectId;
    const apiBase = session?.apiBase || process.env.DEVFLOW_API_BASE || 'https://api.app.dev-flow.tech';
    const token = session?.token || process.env.DEVFLOW_API_TOKEN;
    if (!flowId || !projectId || !token) return;

    // 1) Check project self-approval flag
    const cfgRes = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!cfgRes.ok) return;
    const cfgJson = await cfgRes.json().catch(() => null);
    const allowSelf = cfgJson?.data?.allowAgentSelfApproval ?? cfgJson?.data?.allow_agent_self_approval;
    if (!allowSelf) return;

    // 2) Look up required skills
    const reqRes = await fetch(
      `${apiBase}/api/flows/${encodeURIComponent(flowId)}/required-skills?targetState=${encodeURIComponent(targetState)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!reqRes.ok) return;
    const reqJson = await reqRes.json().catch(() => null);
    const skills = reqJson?.data?.skills || [];
    if (skills.length === 0) return;

    // 3) Surface stdout summary so the user sees what the agent SHOULD do.
    // DF-422 — auch die Skill-File-Pfade ausgeben, damit der Agent die Iron
    // Laws direkt nachlesen kann statt nur die Namen zu kennen.
    const skillPaths = skills.map(s => `packages/skills/skills/${s}/SKILL.md`).join(', ');
    process.stdout.write(
      `🛈 Self-Approval ON · transition needs ${skills.length} discipline-token(s): ${skills.join(', ')}.\n` +
      `   Pass selfApproved=true + disciplineTokens=[...] to flow_update or use POST /api/flows/${flowId}/discipline-tokens/auto-emit.\n` +
      `   💡 Read Iron Laws: ${skillPaths}\n`
    );
  } catch {
    // Never block flow_update on hook errors
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
