/**
 * DF-420 — Welle 1 Plugin pinning tests.
 *
 * Verifies the file-level promises made by the welle-1 changes:
 *   - Paket C: devflow-planning SKILL.md mentions knowledge_check_flow in
 *     the Submitting-for-Approval block (not just in the optional preflight)
 *   - Paket D: devflow-draft-triage skill exists with the required frontmatter
 *   - Paket E: pre-flow-update-knowledge-auto-resolve.js prints a topic
 *     snippet when resolved.length > 0
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

test('AC-3 (Paket C): devflow-planning SKILL.md contains explicit knowledge_check_flow happy-path step', () => {
  const skillPath = path.join(ROOT, 'packages', 'skills', 'skills', 'devflow-planning', 'SKILL.md');
  const content = fs.readFileSync(skillPath, 'utf8');
  // Submitting-for-Approval block (or above it) must mention knowledge_check_flow
  // with explicit call, not just as a pre-flight aside.
  assert.match(content, /knowledge_check_flow/i, 'knowledge_check_flow must appear in the planning skill');
  assert.match(content, /DF-420.*GAP #3/, 'DF-420 GAP #3 marker must be in the skill body for greppability');
});

test('AC-4 (Paket D): devflow-draft-triage SKILL.md exists with correct frontmatter', () => {
  const skillPath = path.join(ROOT, 'packages', 'skills', 'skills', 'devflow-draft-triage', 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), 'devflow-draft-triage SKILL.md must exist');
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /^---/, 'frontmatter delimiter');
  assert.match(content, /name:\s*devflow-draft-triage/);
  assert.match(content, /flow_state:\s*review/);
  assert.match(content, /optional:\s*false/);
  assert.match(content, /extend > dismiss/i, 'Iron Law extend > dismiss must be cited');
});

test('AC-5 (Paket E): auto-resolve hook prints topic snippet when resolved has items', () => {
  const hookPath = path.join(ROOT, 'scripts', 'pre-flow-update-knowledge-auto-resolve.js');
  const content = fs.readFileSync(hookPath, 'utf8');
  // The DF-420 enhancement: a topic-snippet section that pulls from resolved[].topic
  assert.match(content, /DF-420.*DRIFT #1/, 'DF-420 DRIFT #1 marker for greppability');
  assert.match(content, /resolved\.slice\(0,\s*3\)/, 'topic-preview limit of 3');
  assert.match(content, /topics:/, 'stdout line contains the "topics:" prefix');
});

test('DF-422 (Welle 2b): self-approval hook surfaces SKILL.md paths', () => {
  const hookPath = path.join(ROOT, 'scripts', 'pre-flow-update-self-approval.js');
  const content = fs.readFileSync(hookPath, 'utf8');
  // DF-422 enhancement: skill-file paths are listed so the agent can read
  // each Iron Law SKILL.md, not just the names.
  assert.match(content, /DF-422/, 'DF-422 marker for greppability');
  assert.match(content, /packages\/skills\/skills\/\$\{s\}\/SKILL\.md/, 'skill-path template present');
  assert.match(content, /Read Iron Laws/, 'stdout line "Read Iron Laws" prefix');
});
