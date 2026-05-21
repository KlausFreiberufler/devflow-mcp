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
    const proc = execSync(`node "${script}" 2>&1`, {
      input: JSON.stringify(payload),
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
    return proc;
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

test('all scripts ignore non-flow_update tools (legacy and plugin namespace)', () => {
  for (const script of SCRIPTS) {
    const out = run(script, { tool: 'mcp__devflow__flow_get', response: {} });
    assert.strictEqual(
      out,
      '',
      `Script ${script} must be silent for non-flow_update tools. Got: ${JSON.stringify(out)}`
    );
  }
});

test('all scripts ignore tools without __flow_update suffix', () => {
  for (const script of SCRIPTS) {
    for (const tool of [
      'mcp__plugin_devflow_devflow__flow_create',
      'mcp__devflow__flow_list',
      '',
      'flow_update_extra',
    ]) {
      const out = run(script, { tool, response: {} });
      assert.strictEqual(out, '', `Script ${script} must ignore tool "${tool}"`);
    }
  }
});

test('post-flow-update fires on plugin-namespaced tool name', () => {
  const out = run('post-flow-update.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    response: { currentState: 'ready', previousState: 'approval' },
  });
  assert.match(out, /State changed/);
  assert.match(out, /devflow_init/);
});

test('post-flow-update fires on legacy tool name (backwards-compat)', () => {
  const out = run('post-flow-update.js', {
    tool: 'mcp__devflow__flow_update',
    response: { currentState: 'ready', previousState: 'approval' },
  });
  assert.match(out, /State changed/);
});

test('plan-critic fires only on transition to approval (plugin namespace)', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval' },
  });
  assert.match(out, /devflow-plan-critic/);
});

test('plan-critic silent for non-approval transitions', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.strictEqual(out, '');
});

test('code-critic fires only on transition to review (plugin namespace)', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review' },
  });
  assert.match(out, /devflow-code-critic/);
});

test('code-critic silent for non-review transitions', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval' },
  });
  assert.strictEqual(out, '');
});

test('knowledge-auto-resolve no-ops without session config (plugin namespace)', () => {
  // No .devflow-active in cwd, no DEVFLOW_API_TOKEN → returns silently
  const out = run('pre-flow-update-knowledge-auto-resolve.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow' },
  }, { DEVFLOW_API_TOKEN: '', HOME: '/tmp/df-357-no-home' });
  assert.strictEqual(out, '');
});

test('self-approval no-ops without session config (plugin namespace)', () => {
  const out = run('pre-flow-update-self-approval.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow' },
  }, { DEVFLOW_API_TOKEN: '', HOME: '/tmp/df-357-no-home' });
  assert.strictEqual(out, '');
});

test('self-approval respects explicit selfApproved arg from agent', () => {
  // If agent already set selfApproved, hook must back off (even on plugin namespace)
  const out = run('pre-flow-update-self-approval.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', flowId: 'test-flow', selfApproved: true },
  });
  assert.strictEqual(out, '');
});

test('plan-critic respects explicit planCriticVerdict arg', () => {
  const out = runCapturingStderr('pre-flow-update-plan-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'approval', planCriticVerdict: 'approved' },
  });
  assert.strictEqual(out, '');
});

test('code-critic respects explicit codeCriticVerdict arg', () => {
  const out = runCapturingStderr('pre-flow-update-code-critic.js', {
    tool: 'mcp__plugin_devflow_devflow__flow_update',
    tool_input: { currentState: 'review', codeCriticVerdict: 'approved' },
  });
  assert.strictEqual(out, '');
});
