/**
 * DF-378 — Pre-tool-use hook tests for flow_create.
 *
 * The hook reads the tool-input from stdin and prints actionable
 * 1-line hints to stdout when the metadata triple is incomplete or
 * malformed. It never blocks (exit 0 always) — its purpose is to
 * surface the right correction to the agent before the backend
 * returns a 400.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'pre-flow-create-validate.js');

function runHook(payload) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    child.stdin.end();
  });
}

const VALID_TRIPLE = {
  summary: 'A meaningful flow title',
  description: 'Long enough description that explains the goal of this flow in detail.',
  acceptanceCriteria: ['Backend rejects the bad payload with 400 plus structured error.'],
};

test('valid triple → exit 0, no hint on stdout', async () => {
  const res = await runHook({ tool: 'mcp__plugin_devflow_devflow__flow_create', tool_input: VALID_TRIPLE });
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

test('missing description → hint mentions "description"', async () => {
  const res = await runHook({
    tool: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { summary: VALID_TRIPLE.summary, acceptanceCriteria: VALID_TRIPLE.acceptanceCriteria },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /description/i);
});

test('missing acceptanceCriteria → hint mentions "acceptance"', async () => {
  const res = await runHook({
    tool: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { summary: VALID_TRIPLE.summary, description: VALID_TRIPLE.description },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /acceptance|AC/i);
});

test('summary 81 chars → hint mentions split / shorten / description', async () => {
  const res = await runHook({
    tool: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { ...VALID_TRIPLE, summary: 'a'.repeat(81) },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /split|short|description|80/i);
});

test('all three fields invalid → hint aggregates all problems', async () => {
  const res = await runHook({
    tool: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { summary: 'a'.repeat(81), description: null, acceptanceCriteria: [] },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /summary/i);
  assert.match(res.stdout, /description/i);
  assert.match(res.stdout, /acceptance|AC/i);
});

test('malformed JSON stdin → exit 0 (graceful, never blocks)', async () => {
  const res = await runHook('not-valid-json{{{');
  assert.strictEqual(res.code, 0);
});

test('non-flow_create tool → exit 0, no hint (skip)', async () => {
  const res = await runHook({
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { flowId: 'abc', currentState: 'approval' },
  });
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout.trim(), '');
});
