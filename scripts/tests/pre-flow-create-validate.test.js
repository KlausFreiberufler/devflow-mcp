/**
 * DF-378 — Pre-tool-use hook tests for flow_create.
 * DF-412 Paket C — additional cases for the wiki-similarity hint.
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
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'pre-flow-create-validate.js');

function runHook(payload, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    child.stdin.end();
  });
}

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r(undefined))) });
    });
  });
}

const VALID_TRIPLE = {
  summary: 'A meaningful flow title',
  description: 'Long enough description that explains the goal of this flow in detail.',
  acceptanceCriteria: ['Backend rejects the bad payload with 400 plus structured error.'],
};

test('valid triple → exit 0, no hint on stdout', async () => {
  const res = await runHook({ tool_name: 'mcp__plugin_devflow_devflow__flow_create', tool_input: VALID_TRIPLE });
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

test('missing description → hint mentions "description"', async () => {
  const res = await runHook({
    tool_name: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { summary: VALID_TRIPLE.summary, acceptanceCriteria: VALID_TRIPLE.acceptanceCriteria },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /description/i);
});

test('missing acceptanceCriteria → hint mentions "acceptance"', async () => {
  const res = await runHook({
    tool_name: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { summary: VALID_TRIPLE.summary, description: VALID_TRIPLE.description },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /acceptance|AC/i);
});

test('summary 81 chars → hint mentions split / shorten / description', async () => {
  const res = await runHook({
    tool_name: 'mcp__plugin_devflow_devflow__flow_create',
    tool_input: { ...VALID_TRIPLE, summary: 'a'.repeat(81) },
  });
  assert.strictEqual(res.code, 0);
  assert.match(res.stdout, /split|short|description|80/i);
});

test('all three fields invalid → hint aggregates all problems', async () => {
  const res = await runHook({
    tool_name: 'mcp__plugin_devflow_devflow__flow_create',
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
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { flowId: 'abc', currentState: 'approval' },
  });
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

// ─── DF-412 Paket C — wiki similarity hint ────────────────────────────────

test('Paket C: wiki match → stdout contains "extend > create" / nearby entry', async () => {
  const mock = await startMockServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: [
        { type: 'adr', title: 'Wiki-Coverage Gate', displayId: 'ADR-099' },
        { type: 'doc_page', documentType: 'pattern', title: 'extend-over-dismiss', slug: 'extend-over-dismiss' },
      ],
    }));
  });
  try {
    const res = await runHook(
      {
        tool_name: 'mcp__plugin_devflow_devflow__flow_create',
        tool_input: { ...VALID_TRIPLE, projectId: 'proj-1', summary: 'Wiki Coverage Gate enforcement' },
      },
      { DEVFLOW_API_BASE: mock.url, DEVFLOW_API_TOKEN: 'test' }
    );
    assert.strictEqual(res.code, 0);
    assert.match(res.stdout, /extend\s*>\s*create/i);
    assert.match(res.stdout, /ADR-099|extend-over-dismiss/);
  } finally {
    await mock.close();
  }
});

test('Paket C: empty wiki results → silent (no hint added)', async () => {
  const mock = await startMockServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true, data: [] }));
  });
  try {
    const res = await runHook(
      {
        tool_name: 'mcp__plugin_devflow_devflow__flow_create',
        tool_input: { ...VALID_TRIPLE, projectId: 'proj-1' },
      },
      { DEVFLOW_API_BASE: mock.url, DEVFLOW_API_TOKEN: 'test' }
    );
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.stdout.trim(), '');
  } finally {
    await mock.close();
  }
});

test('Paket C: API error (500) → silent, never blocks', async () => {
  const mock = await startMockServer((req, res) => {
    res.statusCode = 500;
    res.end('boom');
  });
  try {
    const res = await runHook(
      {
        tool_name: 'mcp__plugin_devflow_devflow__flow_create',
        tool_input: { ...VALID_TRIPLE, projectId: 'proj-1' },
      },
      { DEVFLOW_API_BASE: mock.url, DEVFLOW_API_TOKEN: 'test' }
    );
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.stdout.trim(), '');
  } finally {
    await mock.close();
  }
});

test('Paket C: missing env vars → silent', async () => {
  // Mock server intentionally never set up — env unset means hook can't reach it.
  const res = await runHook(
    {
      tool_name: 'mcp__plugin_devflow_devflow__flow_create',
      tool_input: { ...VALID_TRIPLE, projectId: 'proj-1' },
    },
    { DEVFLOW_API_BASE: '', DEVFLOW_API_TOKEN: '' }
  );
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout.trim(), '');
});

test('Paket C: missing projectId → no wiki lookup (silent)', async () => {
  const mock = await startMockServer(() => {
    // Should never be called — fail the test if it is.
    assert.fail('wiki lookup attempted without projectId');
  });
  try {
    const res = await runHook(
      {
        tool_name: 'mcp__plugin_devflow_devflow__flow_create',
        tool_input: { ...VALID_TRIPLE }, // no projectId
      },
      { DEVFLOW_API_BASE: mock.url, DEVFLOW_API_TOKEN: 'test' }
    );
    assert.strictEqual(res.code, 0);
    assert.strictEqual(res.stdout.trim(), '');
  } finally {
    await mock.close();
  }
});

test('Paket C: validation hint takes precedence — no wiki call when input invalid', async () => {
  let called = false;
  const mock = await startMockServer((req, res) => {
    called = true;
    res.end(JSON.stringify({ success: true, data: [] }));
  });
  try {
    const res = await runHook(
      {
        tool_name: 'mcp__plugin_devflow_devflow__flow_create',
        tool_input: { summary: 'a'.repeat(81), projectId: 'proj-1' }, // too long
      },
      { DEVFLOW_API_BASE: mock.url, DEVFLOW_API_TOKEN: 'test' }
    );
    assert.strictEqual(res.code, 0);
    assert.match(res.stdout, /summary/i);
    assert.strictEqual(called, false, 'wiki lookup should be skipped when validation fails');
  } finally {
    await mock.close();
  }
});
