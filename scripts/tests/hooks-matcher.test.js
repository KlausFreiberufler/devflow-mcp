import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.join(__dirname, '..', '..', 'hooks');

const EXPECTED_MATCHER = '.*__flow_update$';

const TOOL_NAMES_THAT_MUST_MATCH = [
  'mcp__devflow__flow_update',
  'mcp__plugin_devflow_devflow__flow_update',
  'mcp__cursor_devflow__flow_update',
  'mcp__some_future_host_devflow__flow_update',
];

// Tool names that must NOT match the flow_update matcher.
// Note: since DF-378 there's a separate flow_create matcher (`.*__flow_create$`),
// so we check exclusively against the flow_update entry, not "any non-Edit entry".
const TOOL_NAMES_THAT_MUST_NOT_MATCH = [
  'mcp__devflow__flow_get',
  'mcp__plugin_devflow_devflow__flow_create',
  'flow_update',
  'flow_update_extra',
  '',
];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(hooksDir, file), 'utf8'));
}

function findMatcherForTool(config, toolName) {
  for (const entry of config.hooks || []) {
    if (!entry.matcher) continue;
    if (entry.matcher === 'Edit|Write|NotebookEdit') continue;
    const re = new RegExp(entry.matcher);
    if (re.test(toolName)) return entry.matcher;
  }
  return null;
}

// Locate the specific flow_update hook entry (skips Edit and other tool matchers).
function findFlowUpdateEntry(cfg) {
  return (cfg.hooks || []).find(h => h.matcher === EXPECTED_MATCHER);
}

test('pre-tool-use matcher pins the namespace-immune pattern', () => {
  const cfg = readJSON('pre-tool-use.json');
  const flowUpdateEntry = findFlowUpdateEntry(cfg);
  assert.ok(
    flowUpdateEntry,
    `flow_update hook entry must exist with matcher "${EXPECTED_MATCHER}". ` +
      `Bug: hooks fire in 0 of N flows when matcher does not match plugin-namespaced tool names.`
  );
});

test('post-tool-use matcher pins the namespace-immune pattern', () => {
  const cfg = readJSON('post-tool-use.json');
  const entry = (cfg.hooks || [])[0];
  assert.ok(entry, 'post-tool-use hook entry must exist');
  assert.strictEqual(entry.matcher, EXPECTED_MATCHER);
});

test('matcher accepts all known flow_update tool name variants', () => {
  const cfg = readJSON('pre-tool-use.json');
  for (const tool of TOOL_NAMES_THAT_MUST_MATCH) {
    const matched = findMatcherForTool(cfg, tool);
    assert.ok(
      matched,
      `Tool "${tool}" must match a hook entry. Currently does not — hooks would not fire.`
    );
  }
});

test('flow_update matcher rejects unrelated tool names', () => {
  const cfg = readJSON('pre-tool-use.json');
  const flowUpdateEntry = findFlowUpdateEntry(cfg);
  assert.ok(flowUpdateEntry, 'flow_update entry must exist');
  const re = new RegExp(flowUpdateEntry.matcher);
  for (const tool of TOOL_NAMES_THAT_MUST_NOT_MATCH) {
    assert.strictEqual(
      re.test(tool),
      false,
      `Tool "${tool}" must NOT match the flow_update matcher "${flowUpdateEntry.matcher}".`
    );
  }
});

test('all 4 pre-flow-update scripts are wired', () => {
  const cfg = readJSON('pre-tool-use.json');
  const flowUpdateEntry = findFlowUpdateEntry(cfg);
  assert.ok(flowUpdateEntry, 'flow_update entry must exist');
  const cmds = (flowUpdateEntry.hooks || []).map(h => h.command);
  for (const expected of [
    'pre-flow-update-knowledge-auto-resolve.js',
    'pre-flow-update-plan-critic.js',
    'pre-flow-update-code-critic.js',
    'pre-flow-update-self-approval.js',
  ]) {
    assert.ok(
      cmds.some(c => c.includes(expected)),
      `Script ${expected} must be wired into pre-tool-use.json`
    );
  }
});
