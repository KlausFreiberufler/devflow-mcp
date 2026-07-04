// DF-437 — hook-output helpers: additionalContext-envelope + stderr warn.
import { test } from 'node:test';
import assert from 'node:assert';
import { emitContext, warn } from '../lib/hook-output.js';

function captureStream(stream, fn) {
  const chunks = [];
  const orig = stream.write;
  stream.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try { fn(); } finally { stream.write = orig; }
  return chunks.join('');
}

test('emitContext prints a PreToolUse additionalContext JSON envelope', () => {
  const out = captureStream(process.stdout, () => emitContext('hello agent'));
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(parsed.hookSpecificOutput.additionalContext, 'hello agent');
});

test('emitContext supports PostToolUse event name', () => {
  const out = captureStream(process.stdout, () => emitContext('after', 'PostToolUse'));
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('emitContext is silent for empty text', () => {
  const out = captureStream(process.stdout, () => emitContext(''));
  assert.strictEqual(out, '');
});

test('warn writes prefixed diagnostics to stderr', () => {
  const err = captureStream(process.stderr, () => warn('token missing'));
  assert.match(err, /^\[devflow-hook\] token missing\n$/);
});
