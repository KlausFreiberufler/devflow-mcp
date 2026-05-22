/**
 * Schema-Test für devflow-skills — pinnt das Frontmatter-Contract,
 * sodass Drift sofort den Build bricht.
 *
 * Run: node --test packages/skills/__tests__/skill-schema.test.js
 */

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = join(__dirname, '..', 'skills')

const REQUIRED_FRONTMATTER_KEYS = ['name', 'description']

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const block = match[1]
  const out = {}
  for (const line of block.split('\n')) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    if (!kv) continue
    const val = kv[2].trim()
    if (val !== '') out[kv[1]] = val
  }
  return out
}

const skillDirs = readdirSync(SKILLS_DIR).filter(n => {
  try { return statSync(join(SKILLS_DIR, n)).isDirectory() } catch { return false }
})

test('packages/skills/skills exists and contains 24 skills', () => {
  assert.equal(skillDirs.length, 24, `expected 24 skills, found ${skillDirs.length}`)
})

for (const slug of skillDirs) {
  test(`skill ${slug}: SKILL.md exists with required frontmatter`, () => {
    const skillMd = join(SKILLS_DIR, slug, 'SKILL.md')
    let md
    try { md = readFileSync(skillMd, 'utf8') } catch {
      assert.fail(`SKILL.md missing for ${slug}`)
    }
    const fm = parseFrontmatter(md)
    assert.ok(fm, `${slug}: SKILL.md has no frontmatter block`)
    for (const key of REQUIRED_FRONTMATTER_KEYS) {
      assert.ok(fm[key], `${slug}: missing frontmatter key '${key}'`)
    }
    // name should match the slug (devflow-tdd, etc)
    assert.equal(fm.name, slug, `${slug}: frontmatter name '${fm.name}' must match folder slug`)
  })
}

test('devflow-tdd is present (canonical reference skill)', () => {
  assert.ok(skillDirs.includes('devflow-tdd'), 'devflow-tdd skill must exist')
})

// DF-418 — `optional: true` convention for skills that emit a discipline_token
// but are NOT in HARDCODED_REQUIRED_SKILLS (DRIFT #9 from DF-413 lifecycle audit).
//
// Source-of-truth for required skills: backend/src/services/pipelineOrchestrator.js
//   HARDCODED_REQUIRED_SKILLS = {
//     approval: ['devflow-collision-acknowledged','devflow-pattern-reuse','devflow-tdd','devflow-knowledge-completer'],
//     testing:  ['devflow-verification-gate','devflow-adr-compliance','devflow-plan-reconciliation','devflow-knowledge-completer'],
//   }
// Mirror below is the deduped union (7 unique slugs). Keep in sync when the
// backend constant changes — the anti-drift assertion below guards against
// silent promotion of a required skill to optional.
const HARDCODED_REQUIRED_MIRROR = [
  'devflow-collision-acknowledged',
  'devflow-pattern-reuse',
  'devflow-tdd',
  'devflow-knowledge-completer',
  'devflow-verification-gate',
  'devflow-adr-compliance',
  'devflow-plan-reconciliation',
]

for (const slug of skillDirs) {
  test(`skill ${slug}: optional, if present, must equal literal 'true'`, () => {
    const md = readFileSync(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf8')
    const fm = parseFrontmatter(md)
    if (Object.prototype.hasOwnProperty.call(fm, 'optional')) {
      assert.equal(
        fm.optional,
        'true',
        `${slug}: optional must be literal 'true', got '${fm.optional}'`
      )
    }
  })
}

test('hardcoded-required skills (anti-drift pin) MUST NOT carry optional=true', () => {
  for (const slug of HARDCODED_REQUIRED_MIRROR) {
    const skillMd = join(SKILLS_DIR, slug, 'SKILL.md')
    let md
    try {
      md = readFileSync(skillMd, 'utf8')
    } catch {
      assert.fail(
        `HARDCODED_REQUIRED_MIRROR slug '${slug}' has no SKILL.md — ` +
        `update the mirror or restore the skill.`
      )
    }
    const fm = parseFrontmatter(md)
    assert.ok(fm, `${slug}: SKILL.md has no frontmatter block`)
    assert.notEqual(
      fm.optional,
      'true',
      `${slug} is hardcoded-required in pipelineOrchestrator.js but carries optional=true — drift detected.`
    )
  }
})
