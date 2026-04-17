import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'stop-check.js');

function run(cwd) {
  return execSync(`node "${script}"`, { cwd, encoding: 'utf-8' });
}

test('silent when no .devflow-active', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    const out = run(dir);
    assert.strictEqual(out, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('warns when state is in_progress', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# devflow_init');
    writeFileSync(path.join(dir, '.devflow-active'),
      JSON.stringify({ flowId: 'x', displayId: 'DF-1', state: 'in_progress' }));
    const out = run(dir);
    assert.match(out, /in_progress/);
    assert.match(out, /not a wait state/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('silent when state is review (wait state)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'df-'));
  try {
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# devflow_init');
    writeFileSync(path.join(dir, '.devflow-active'),
      JSON.stringify({ flowId: 'x', displayId: 'DF-1', state: 'review' }));
    const out = run(dir);
    assert.strictEqual(out, '');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
