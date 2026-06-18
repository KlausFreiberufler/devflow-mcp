#!/usr/bin/env node
// Reads hook payload from stdin, prints reminder on flow_update state transition.

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    // DF-434 — Claude Code's PostToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_update')) return;
    // DF-434 TODO: PostToolUse exposes the tool output as `tool_response` (a string),
    // not a `{currentState, previousState}` object — this destructure stays stale and
    // the hook no-ops at the guard below. Left intact (informational only); a proper
    // fix needs a structured post-update signal. Tracked in DF-434 plan.
    const { currentState, previousState } = payload.response || payload.tool_response || {};
    if (!currentState || currentState === previousState) return;
    process.stdout.write(
      `📋 State changed: ${previousState || '?'} → ${currentState}. ` +
      `Call devflow_init again to refresh context.\n`
    );
  } catch {
    // Never block on parse errors
  }
});
