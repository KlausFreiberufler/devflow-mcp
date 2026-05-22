/**
 * DF-338 — Cursor Bundle Scaffold Tests
 * Mirror von codex-plugin.test.js / gemini-extension.test.js.
 */

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BUNDLE_DIR = join(ROOT, '.cursor')

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')) }

test('mcp.json references devflow-flows + devflow-wiki', () => {
  const m = readJson(join(BUNDLE_DIR, 'mcp.json'))
  assert.ok(m.mcpServers['devflow-flows'])
  assert.ok(m.mcpServers['devflow-wiki'])
})

test('hooks.json valid + has PreToolUse array', () => {
  const h = readJson(join(BUNDLE_DIR, 'hooks.json'))
  assert.ok(h.hooks, 'hooks.json must have hooks object')
  assert.ok(Array.isArray(h.hooks.PreToolUse), 'must have PreToolUse array')
  assert.ok(h.hooks.PreToolUse.length >= 1)
})

test('rules/devflow.mdc has YAML frontmatter', () => {
  const mdcPath = join(BUNDLE_DIR, 'rules', 'devflow.mdc')
  assert.ok(existsSync(mdcPath))
  const content = readFileSync(mdcPath, 'utf8')
  assert.ok(content.startsWith('---\n'), 'MDC must start with frontmatter delimiter')
  assert.ok(/^description:/m.test(content), 'frontmatter must have description')
})

test('hook bash scripts pass syntax-check', () => {
  const hooksDir = join(BUNDLE_DIR, 'hooks')
  const sh = readdirSync(hooksDir).filter(f => f.endsWith('.sh'))
  assert.ok(sh.length >= 2)
  for (const s of sh) {
    const r = spawnSync('bash', ['-n', join(hooksDir, s)])
    assert.equal(r.status, 0, `${s} bash syntax invalid`)
  }
})

test('skills/ populated (24 dirs)', () => {
  const skillsDir = join(BUNDLE_DIR, 'skills')
  if (!existsSync(skillsDir)) {
    assert.fail('Run `node scripts/build-cursor-bundle.js` first')
  }
  const dirs = readdirSync(skillsDir).filter(n => {
    try { return statSync(join(skillsDir, n)).isDirectory() } catch { return false }
  })
  assert.equal(dirs.length, 24)
  assert.ok(dirs.includes('devflow-tdd'))
})

test('setup-cursor.sh exists and has valid syntax', () => {
  const setupScript = join(ROOT, 'scripts', 'setup-cursor.sh')
  assert.ok(existsSync(setupScript))
  const r = spawnSync('bash', ['-n', setupScript])
  assert.equal(r.status, 0, `setup-cursor.sh bash syntax invalid`)
})
