#!/usr/bin/env node
// Reads hook payload from stdin, prints reminder on flow_update state transition.

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    if (payload.tool !== 'mcp__devflow__flow_update') return;
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
