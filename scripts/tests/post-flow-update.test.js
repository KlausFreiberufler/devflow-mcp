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
  const out = run({ tool_name: 'mcp__devflow__flow_get', response: {} });
  assert.strictEqual(out, '');
});

test('reminds on state transition in response', () => {
  const out = run({
    tool_name: 'mcp__devflow__flow_update',
    response: { currentState: 'ready', previousState: 'approval' }
  });
  assert.match(out, /State changed/);
  assert.match(out, /ready/);
  assert.match(out, /devflow_init/);
});

test('silent when state unchanged', () => {
  const out = run({
    tool_name: 'mcp__devflow__flow_update',
    response: { currentState: 'planning', previousState: 'planning' }
  });
  assert.strictEqual(out, '');
});
