import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname, '..');

const SCRIPTS = [
  'pre-flow-update-knowledge-auto-resolve.js',
  'pre-flow-update-adr-compliance.js',
  'pre-flow-update-plan-critic.js',
  'pre-flow-update-code-critic.js',
  'pre-flow-update-self-approval.js',
  'post-flow-update.js',
];

function run(scriptName, payload, env = {}) {
  const script = path.join(scriptsDir, scriptName);
  return execSync(`node "${script}"`, {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

function runCapturingStderr(scriptName, payload, env = {}) {
  const script = path.join(scriptsDir, scriptName);
  try {
    return execSync(`node "${script}" 2>&1`, {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

// DF-434 — Claude Code's real PreToolUse/PostToolUse payload uses `tool_name`
// (+ `tool_input`), NOT `tool`. The previous suite synthesized `{ tool }`, which is
// exactly why the dead-hook bug (every hook silently no-opping in real sessions) went
// unnoticed for so long: the guard read `payload.tool`, which is always undefined under
// the real protocol, but the tests fed it `tool` so they passed anyway. These tests now
// assert the REAL shape; a dedicated block at the bottom covers the legacy `tool`
// fallback so backwards-compat (and synthetic callers) don't regress.

test('all scripts ignore non-flow_update tools (real tool_name shape)', () => {
  for (const script of SCRIPTS) {
    const out = run(script, { tool_name: 'mcp__devflow__flow_get', tool_response: {}, response: {} });
    assert.strictEqual(
      out,
      '',
      `Script ${script} must be silent for non-flow_update tools. Got: ${JSON.stringify(out)}`
    );
  }
});

test('all scripts ignore tools without __flow_update suffix (real tool_name shape)', () => {
  for (const script of SCRIPTS) {
    for (const toolName of [
      'mcp__plugin_devflow_devflow__flow_create',
      'mcp__devflow__flow_list',
      '',
      'flow_update_extra',
    ]) {
      const out = run(script, { tool_name: toolName, tool_response: {}, response: {} });
      assert.strictEqual(out, '', `Script ${script} must ignore tool "${toolName}"`);
    }
  }
});

test('post-flow-update fires on plugin-namespaced tool_name (real shape)', () => {
  // DF-437 — real PostToolUse shape: tool_input carries the transition,
  // tool_response is the tool's text output; agent-visible output is the
  // additionalContext envelope.
  const out = run('post-flow-update.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { flowId: 'f-1', currentState: 'ready' },
    tool_response: 'Flow updated successfully.',
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ready/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /devflow_init/);
});

test('plan-critic fires on transition to approval (real tool_name shape)', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval' },
  });
  assert.match(out, /devflow-plan-critic/);
});

test('plan-critic silent for non-approval transitions (real shape)', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.strictEqual(out, '');
});

test('code-critic fires on transition to review (real tool_name shape)', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.match(out, /devflow-code-critic/);
});

test('code-critic silent for non-review transitions (real shape)', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval' },
  });
  assert.strictEqual(out, '');
});

test('knowledge-auto-resolve no-ops without session config (real shape)', () => {
  // No .devflow-active, no token → returns silently even though the guard now passes.
  const out = run('pre-flow-update-knowledge-auto-resolve.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow' },
  }, { DEVFLOW_API_TOKEN: '', DEVFLOW_TOKEN: '', HOME: '/tmp/df-434-no-home' });
  assert.strictEqual(out, '');
});

test('self-approval no-ops without session config (real shape)', () => {
  const out = run('pre-flow-update-self-approval.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow' },
  }, { DEVFLOW_API_TOKEN: '', DEVFLOW_TOKEN: '', HOME: '/tmp/df-434-no-home' });
  assert.strictEqual(out, '');
});

test('self-approval respects explicit selfApproved arg from agent (real shape)', () => {
  // If the agent already set selfApproved, the hook must back off.
  const out = run('pre-flow-update-self-approval.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow', selfApproved: true },
  });
  assert.strictEqual(out, '');
});

test('plan-critic respects explicit planCriticVerdict arg (real shape)', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', planCriticVerdict: 'approved' },
  });
  assert.strictEqual(out, '');
});

test('code-critic respects explicit codeCriticVerdict arg (real shape)', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool_name: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review', codeCriticVerdict: 'approved' },
  });
  assert.strictEqual(out, '');
});

// --- DF-434: legacy `tool` field still accepted (backwards-compat fallback) ---
// Synthetic callers / older hosts that emit `tool` instead of `tool_name` must keep
// working — the guard reads `payload.tool_name || payload.tool`.
test('plan-critic still fires on legacy `tool` field (fallback)', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval' },
  });
  assert.match(out, /devflow-plan-critic/);
});

test('post-flow-update still fires on legacy `tool` field (fallback)', () => {
  const out = run('post-flow-update.js', {
    tool: 'mcp__devflow__flow_update',
    tool_input: { flowId: 'f-1', currentState: 'ready' },
    tool_response: 'Flow updated successfully.',
  });
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /ready/);
});
