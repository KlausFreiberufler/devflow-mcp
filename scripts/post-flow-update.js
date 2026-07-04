#!/usr/bin/env node
// DF-437 — PostToolUse hook for flow_update: reminds the agent to refresh
// its context after a successful state transition.
//
// Payload reality (fixed here, was the DF-434 TODO): `tool_response` is the
// tool's TEXT output (a string, or an MCP content-object) — NOT a
// `{currentState, previousState}` object. The requested transition lives in
// `tool_input.currentState`; success is detected from the response text.
// Output goes through hookSpecificOutput.additionalContext so the AGENT
// sees it (plain stdout only reaches the debug log).

import { emitContext, warn } from './lib/hook-output.js';

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    // DF-434 — Claude Code's PostToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_update')) return;

    const args = payload.tool_input || payload.input || {};
    const targetState = args.currentState;
    if (!targetState) return; // field-only update, no transition requested

    const responseText = extractText(payload.tool_response ?? payload.response);
    if (!/Flow updated successfully/i.test(responseText)) return; // blocked or failed

    emitContext(
      `State transition to '${targetState}' landed. Call devflow_init({ flowId: "${args.flowId || ''}" }) ` +
      `to refresh allowedActions and the next pipeline step before continuing.`,
      'PostToolUse'
    );
  } catch (e) {
    // Never block on parse errors — but leave a trace (DF-437 AC-3).
    warn(`post-flow-update hook error: ${e?.message || e}`);
  }
});

/** tool_response may be a plain string or an MCP content object. */
function extractText(resp) {
  if (typeof resp === 'string') return resp;
  if (resp && Array.isArray(resp.content)) {
    return resp.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
  }
  if (resp && typeof resp === 'object') return JSON.stringify(resp);
  return '';
}
