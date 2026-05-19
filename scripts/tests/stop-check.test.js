import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'stop-check.js');

function run(cwd, env = {}) {
  const res = spawnSync('node', [script], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, DEVFLOW_STOP_HOOK_SOFT: '', ...env },
  });
  return { stdout: res.stdout, stderr: res.stderr, code: res.status };
}

function makeProject(state, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  writeFileSync(path.join(dir, 'CLAUDE.md'), '# devflow_init');
  writeFileSync(
    path.join(dir, '.devflow-active'),
    JSON.stringify({ flowId: 'flow-123', displayId: 'DF-1', state, title: 'test', ...extra })
  );
  return dir;
}

test('silent when .devflow-active is missing (no active session)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# devflow_init');
    const r = run(dir);
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.stderr, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('silent when CLAUDE.md lacks devflow_init marker (non-DevFlow project)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# Some other project');
    writeFileSync(
      path.join(dir, '.devflow-active'),
      JSON.stringify({ flowId: 'x', displayId: 'DF-1', state: 'in_progress' })
    );
    const r = run(dir);
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.stderr, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('tolerates corrupt .devflow-active (does not block)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# devflow_init');
    writeFileSync(path.join(dir, '.devflow-active'), 'not-json-at-all');
    const r = run(dir);
    assert.strictEqual(r.code, 0);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

for (const state of ['approval', 'review', 'done']) {
  test(`wait state '${state}' → exit 0, no reinject`, () => {
    const dir = makeProject(state);
    try {
      const r = run(dir);
      assert.strictEqual(r.code, 0, `expected exit 0 for wait state '${state}', got ${r.code}`);
      assert.strictEqual(r.stderr, '');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
}

for (const [state, target] of [
  ['idea', 'planning'],
  ['planning', 'approval'],
  ['ready', 'in_progress'],
  ['in_progress', 'review'],
]) {
  test(`active state '${state}' → exit 2 + reinject targeting '${target}'`, () => {
    const dir = makeProject(state);
    try {
      const r = run(dir);
      assert.strictEqual(r.code, 2, `expected exit 2 for active state '${state}', got ${r.code}`);
      assert.match(r.stderr, /Cannot end session/i);
      assert.match(r.stderr, /flow_update\(/);
      assert.match(r.stderr, new RegExp(`currentState:\\s*"${target}"`));
      assert.match(r.stderr, /flowId:\s*"flow-123"/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
}

test("in_progress reinject lists agentSummary + testingInstructions as required fields", () => {
  const dir = makeProject('in_progress');
  try {
    const r = run(dir);
    assert.strictEqual(r.code, 2);
    assert.match(r.stderr, /agentSummary/);
    assert.match(r.stderr, /testingInstructions/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('DEVFLOW_STOP_HOOK_SOFT=1 in active state → exit 0 + soft-mode warning', () => {
  const dir = makeProject('in_progress');
  try {
    const r = run(dir, { DEVFLOW_STOP_HOOK_SOFT: '1' });
    assert.strictEqual(r.code, 0, `expected exit 0 in soft mode, got ${r.code}`);
    assert.match(r.stderr, /[Ss]oft mode/);
    assert.match(r.stderr, /DEVFLOW_STOP_HOOK_SOFT/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('unknown state → fail open (exit 0) instead of trapping the agent', () => {
  const dir = makeProject('weird-state');
  try {
    const r = run(dir);
    assert.strictEqual(r.code, 0);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
