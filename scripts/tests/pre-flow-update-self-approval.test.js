// DF-437 — self-approval hook: additionalContext reaches the agent, silent
// fails become stderr diagnostics. Runs the hook as a child process against
// a local mock backend (same approach as the DF-434 payload-shape tests).
import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'pre-flow-update-self-approval.js');

function runHook(payload, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function startMockBackend({ allowSelf = true, skills = [] } = {}) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/config')) {
      res.end(JSON.stringify({ success: true, data: { allowAgentSelfApproval: allowSelf } }));
    } else if (req.url.includes('/required-skills')) {
      res.end(JSON.stringify({ success: true, data: { skills } }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, error: 'not found' }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function makeTmpSession(apiBase) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-hook-test-'));
  fs.writeFileSync(
    path.join(dir, '.devflow-active'),
    JSON.stringify({ flowId: 'flow-1', projectId: 'proj-1', apiBase })
  );
  return dir;
}

test('emits additionalContext with required skills when self-approval is ON', async () => {
  const server = await startMockBackend({ allowSelf: true, skills: ['devflow-tdd', 'devflow-knowledge-completer'] });
  const { port } = server.address();
  const cwd = makeTmpSession(`http://127.0.0.1:${port}`);
  try {
    const { stdout } = await runHook(
      { tool_name: 'mcp__plugin_devflow_devflow__flow_update', tool_input: { currentState: 'ready' } },
      { cwd, env: { DEVFLOW_API_TOKEN: 'test-token' } }
    );
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(ctx, /devflow-tdd/);
    assert.match(ctx, /devflow-knowledge-completer/);
    // DF-435 body-field guidance must be part of the message.
    assert.match(ctx, /testStrategy/);
  } finally {
    server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('stays silent on stdout for non-transition tool calls', async () => {
  const { stdout } = await runHook({ tool_name: 'mcp__devflow__flow_get', tool_input: {} });
  assert.strictEqual(stdout, '');
});

test('warns on stderr when no auth token can be found', async () => {
  const cwd = makeTmpSession('http://127.0.0.1:9');
  try {
    const { stdout, stderr, code } = await runHook(
      { tool_name: 'mcp__devflow__flow_update', tool_input: { currentState: 'done' } },
      {
        cwd,
        env: { DEVFLOW_API_TOKEN: '', DEVFLOW_TOKEN: '', HOME: cwd },
      }
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(stdout, '');
    assert.match(stderr, /\[devflow-hook\]/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('warns on stderr when the backend answers non-200', async () => {
  const server = http.createServer((_req, res) => { res.statusCode = 500; res.end('{}'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const cwd = makeTmpSession(`http://127.0.0.1:${port}`);
  try {
    const { stderr, code } = await runHook(
      { tool_name: 'mcp__devflow__flow_update', tool_input: { currentState: 'approval' } },
      { cwd, env: { DEVFLOW_API_TOKEN: 'test-token' } }
    );
    assert.strictEqual(code, 0);
    assert.match(stderr, /\[devflow-hook\].*500/);
  } finally {
    server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
