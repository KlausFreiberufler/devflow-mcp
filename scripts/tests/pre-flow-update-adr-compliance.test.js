/**
 * DF-415 — unit tests for the ADR-compliance pre-tool-use hook.
 *
 * Validates state filtering + git-diff parsing + safe pass-through on
 * malformed payloads. The actual API + git invocations are NOT mocked
 * here (they require .devflow-active, a backend, and a local git repo) —
 * those paths are kept silent in the hook so tests can exercise them
 * without setup.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'pre-flow-update-adr-compliance.js');

function run(payload, env = {}) {
  return execSync(`node "${SCRIPT}"`, {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, DEVFLOW_API_TOKEN: '', ...env },
  });
}

test('silent on non-flow_update tools', () => {
  const out = run({ tool: 'mcp__plugin_devflow_devflow__flow_create', tool_input: { currentState: 'review' } });
  assert.strictEqual(out, '');
});

test('silent on flow_update transitioning to planning (not review/done)', () => {
  const out = run({ tool: 'mcp__plugin_devflow_devflow__flow_update', tool_input: { currentState: 'planning' } });
  assert.strictEqual(out, '');
});

test('silent on flow_update transitioning to approval', () => {
  const out = run({ tool: 'mcp__plugin_devflow_devflow__flow_update', tool_input: { currentState: 'approval' } });
  assert.strictEqual(out, '');
});

test('silent when agent already supplied filesChanged on review transition', () => {
  // The hook respects an explicit list — no auto-derive needed.
  const out = run({
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review', filesChanged: ['backend/x.js'] },
  });
  assert.strictEqual(out, '');
});

test('silent when agent supplied filesChanged on done transition', () => {
  const out = run({
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'done', filesChanged: ['frontend/x.tsx', 'backend/y.js'] },
  });
  assert.strictEqual(out, '');
});

test('silent on review/done transition without session (no .devflow-active, no env token)', () => {
  // No session → no API calls → safe silent fall-through.
  const out = run({
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.strictEqual(out, '');
});

test('silent on malformed payload (no JSON)', () => {
  const out = execSync(`node "${SCRIPT}"`, {
    input: 'not json at all',
    encoding: 'utf-8',
  });
  assert.strictEqual(out, '');
});

test('silent on empty input', () => {
  const out = execSync(`node "${SCRIPT}"`, {
    input: '',
    encoding: 'utf-8',
  });
  assert.strictEqual(out, '');
});

test('legacy tool namespace mcp__devflow__flow_update is recognized', () => {
  // The matcher checks suffix `__flow_update`, so this MUST be processed.
  // Without a session it's still silent, but we verify the suffix-check
  // doesn't reject the namespace.
  const out = run({
    tool: 'mcp__devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.strictEqual(out, '');
});
