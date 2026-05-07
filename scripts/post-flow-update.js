#!/usr/bin/env node
// Reads hook payload from stdin, prints reminder on flow_update state transition.

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    if (!payload.tool || !payload.tool.endsWith('__flow_update')) return;
    const { currentState, previousState } = payload.response || {};
    if (!currentState || currentState === previousState) return;
    process.stdout.write(
      `📋 State changed: ${previousState || '?'} → ${currentState}. ` +
      `Call devflow_init again to refresh context.\n`
    );
  } catch {
    // Never block on parse errors
  }
});
