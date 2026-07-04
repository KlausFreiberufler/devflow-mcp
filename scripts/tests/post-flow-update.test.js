// DF-437 — post-flow-update hook against the REAL PostToolUse payload shape:
// tool_input carries the requested transition, tool_response is the tool's
// TEXT output (a string), and agent-visible output must be the
// hookSpecificOutput.additionalContext envelope.
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'post-flow-update.js');

function run(payload) {
  return execSync(`node "${script}"`, {
    input: JSON.stringify(payload),
    encoding: 'utf-8'
  });
}

test('silent when tool is not flow_update', () => {
  const out = run({ tool_name: 'mcp__devflow__flow_get', tool_response: 'whatever' });
  assert.strictEqual(out, '');
});

test('emits PostToolUse additionalContext on successful state transition', () => {
  const out = run({
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { flowId: 'f-1', currentState: 'ready' },
    tool_response: 'Flow updated successfully.\n\n# Flow: X\n**State:** ready\n'
  });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(parsed.hookSpecificOutput.additionalContext, /ready/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /devflow_init/);
});

test('silent when no state transition was requested', () => {
  const out = run({
    tool_name: 'mcp__devflow__flow_update',
    tool_input: { flowId: 'f-1', agentSummary: 'nur Felder, kein Transition' },
    tool_response: 'Flow updated successfully.'
  });
  assert.strictEqual(out, '');
});

test('silent when the update failed', () => {
  const out = run({
    tool_name: 'mcp__devflow__flow_update',
    tool_input: { flowId: 'f-1', currentState: 'done' },
    tool_response: 'Error: Gate blocked: 1 condition failed'
  });
  assert.strictEqual(out, '');
});

test('handles object-shaped tool_response defensively', () => {
  const out = run({
    tool_name: 'mcp__devflow__flow_update',
    tool_input: { flowId: 'f-1', currentState: 'review' },
    tool_response: { content: [{ type: 'text', text: 'Flow updated successfully.' }] }
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /review/);
});
