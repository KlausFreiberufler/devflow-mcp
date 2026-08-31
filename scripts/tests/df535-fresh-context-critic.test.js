/**
 * DF-535 (Block C) — Fresh-Context-Review pinning tests.
 *
 * Pins the file-level promises of the "Kritiker-Subagenten statt Selbst-Review"
 * rebuild. Same shape as scripts/tests/welle-1-skills-verify.test.js: pure
 * file-content assertions, no backend, no MCP, no network.
 *
 * What is pinned:
 *   (a) devflow-code-critic SKILL.md carries the 3 reviewer lenses
 *       correctness / security / does-it-reproduce
 *   (b) the dispatch contract states its context boundary — diff + ACs + plan
 *       go to the critic, the author's assumptions/rationale never do
 *   (c) a self-persona-fallback section for clients without a subagent tool
 *       (ADR-135)
 *   (d) the findings hand off into devflow-receiving-review for triage
 *   (e) scripts/pre-flow-update-code-critic.js mentions the fresh-context
 *       dispatch
 *   (f) devflow-receiving-review SKILL.md carries the counter-reference back
 *
 * These run RED until the Block-C rebuild lands.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const CODE_CRITIC = path.join(ROOT, 'packages', 'skills', 'skills', 'devflow-code-critic', 'SKILL.md');
const RECEIVING_REVIEW = path.join(ROOT, 'packages', 'skills', 'skills', 'devflow-receiving-review', 'SKILL.md');
const HOOK = path.join(ROOT, 'scripts', 'pre-flow-update-code-critic.js');

const read = (p) => fs.readFileSync(p, 'utf8');

/**
 * Slice a markdown section: from the first heading matching `headingPattern`
 * up to (excluding) the next heading of the same or a higher level.
 * Sub-headings stay inside the slice. Returns '' when no heading matches.
 */
function section(content, headingPattern) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^#{2,6}\s/.test(l) && headingPattern.test(l));
  if (start === -1) return '';
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// (a) — the 3 reviewer lenses
test('AC-a: devflow-code-critic SKILL.md defines the 3 fresh-context reviewer lenses', () => {
  const content = read(CODE_CRITIC);
  assert.match(content, /DF-535/, 'DF-535 marker must be in the skill body for greppability');

  const dispatch = section(content, /fresh[- ]context/i);
  assert.notStrictEqual(dispatch, '', 'a heading containing "Fresh-Context" must exist');

  assert.match(dispatch, /correctness/i, 'lens 1: correctness');
  assert.match(dispatch, /security/i, 'lens 2: security');
  assert.match(dispatch, /does-it-reproduce/i, 'lens 3: does-it-reproduce');
  assert.match(dispatch, /\bsub-?agents?\b/i, 'lenses are dispatched to critic subagents');
});

// (b) — dispatch contract + context boundary
test('AC-b: dispatch contract names its context boundary — diff + ACs + plan, no author rationale', () => {
  const content = read(CODE_CRITIC);
  const dispatch = section(content, /fresh[- ]context/i);
  assert.notStrictEqual(dispatch, '', 'a heading containing "Fresh-Context" must exist');

  assert.match(dispatch, /context boundary/i, 'the contract must be labelled as a context boundary');
  assert.match(dispatch, /\bdiff\b/i, 'the critic receives the diff');
  assert.match(dispatch, /acceptance criteri/i, 'the critic receives the acceptance criteria');
  assert.match(dispatch, /\bplan\b/i, 'the critic receives the plan');
  assert.match(
    dispatch,
    /(never|do not|don't|no)\b[^\n]{0,120}\b(assumption|rationale|justification|reasoning|self-assessment)/i,
    'the contract must forbid passing the author\'s assumptions/rationale into the critic context',
  );
});

// (c) — self-persona fallback for clients without a subagent tool
test('AC-c: self-persona-fallback section covers clients without a subagent tool (ADR-135)', () => {
  const content = read(CODE_CRITIC);
  assert.match(content, /self-persona-fallback/, 'the fallback must carry the greppable slug "self-persona-fallback"');

  const fallback = section(content, /fallback/i);
  assert.notStrictEqual(fallback, '', 'a heading containing "Fallback" must exist');
  assert.match(fallback, /ADR-135/, 'the fallback must cite ADR-135');
  assert.match(
    fallback,
    /(without|no|lack|missing)\b[^\n]{0,80}\bsub-?agent/i,
    'the fallback must state it applies to clients without a subagent tool',
  );
});

// (d) — triage handoff into devflow-receiving-review
test('AC-d: critic findings hand off into devflow-receiving-review for triage', () => {
  const content = read(CODE_CRITIC);
  const dispatch = section(content, /fresh[- ]context/i);
  assert.notStrictEqual(dispatch, '', 'a heading containing "Fresh-Context" must exist');

  assert.match(dispatch, /devflow-receiving-review/, 'the dispatch section must name the triage skill');
  assert.match(dispatch, /triag/i, 'the handoff must be described as triage');
});

// (e) — hook surfaces the fresh-context dispatch
test('AC-e: pre-flow-update-code-critic.js mentions the fresh-context dispatch', () => {
  const hook = read(HOOK);
  assert.match(hook, /DF-535/, 'DF-535 marker for greppability');
  assert.match(hook, /fresh[- ]context/i, 'hook stdout must mention the fresh-context dispatch');
  assert.match(hook, /\bsub-?agents?\b/i, 'hook must point at the critic subagents');
});

// (f) — counter-reference back from the triage skill
test('AC-f: devflow-receiving-review SKILL.md counter-references the fresh-context critic', () => {
  const content = read(RECEIVING_REVIEW);
  assert.match(content, /DF-535/, 'DF-535 marker for greppability');
  assert.match(content, /devflow-code-critic/, 'the triage skill must name its upstream critic skill');
  assert.match(content, /fresh[- ]context/i, 'the counter-reference must name the fresh-context dispatch');
});

// registration pin — the file must actually run in CI
test('AC-registration: this test file is wired into the npm test script', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.match(
    pkg.scripts.test,
    /scripts\/tests\/df535-fresh-context-critic\.test\.js/,
    'df535-fresh-context-critic.test.js must be listed in the npm test script',
  );
});
