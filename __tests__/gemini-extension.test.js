/**
 * DF-337 — Gemini Extension Scaffold Tests
 * Mirror von codex-plugin.test.js (DF-336).
 */

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const EXT_DIR = join(ROOT, '.gemini-extension')

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')) }

test('gemini-extension.json has required fields', () => {
  const m = readJson(join(EXT_DIR, 'gemini-extension.json'))
  for (const key of ['name', 'version', 'description', 'contextFileName', 'mcpServers', 'skills', 'hooks', 'commands']) {
    assert.ok(m[key], `gemini-extension.json missing required field '${key}'`)
  }
  assert.equal(m.name, 'devflow')
  assert.equal(m.contextFileName, 'GEMINI.md', 'contextFileName must be GEMINI.md')
})

test('gemini-extension.json mcpServers references devflow-flows + devflow-wiki', () => {
  const m = readJson(join(EXT_DIR, 'gemini-extension.json'))
  assert.ok(m.mcpServers['devflow-flows'])
  assert.ok(m.mcpServers['devflow-wiki'])
})

test('GEMINI.md context-file exists', () => {
  assert.ok(existsSync(join(EXT_DIR, 'GEMINI.md')), 'GEMINI.md must exist')
})

test('hooks/hooks.json valid + bash scripts pass syntax-check', () => {
  const hooks = readJson(join(EXT_DIR, 'hooks', 'hooks.json'))
  assert.ok(Array.isArray(hooks.hooks))
  assert.ok(hooks.hooks.length > 0)
  const hooksDir = join(EXT_DIR, 'hooks')
  const sh = readdirSync(hooksDir).filter(f => f.endsWith('.sh'))
  assert.ok(sh.length >= 2, 'expect at least pre-tool-use.sh + pre-flow-update.sh')
  for (const s of sh) {
    const r = spawnSync('bash', ['-n', join(hooksDir, s)])
    assert.equal(r.status, 0, `${s} bash syntax invalid: ${r.stderr.toString()}`)
  }
})

test('skills/ populated by build (19 dirs)', () => {
  const skillsDir = join(EXT_DIR, 'skills')
  if (!existsSync(skillsDir)) {
    assert.fail('Run `node scripts/build-gemini-extension.js` first')
  }
  const dirs = readdirSync(skillsDir).filter(n => {
    try { return statSync(join(skillsDir, n)).isDirectory() } catch { return false }
  })
  assert.equal(dirs.length, 21, `expected 21 skills, found ${dirs.length}`)
  assert.ok(dirs.includes('devflow-tdd'))
})

test('commands/ populated by build (≥ 4 md files)', () => {
  const commandsDir = join(EXT_DIR, 'commands')
  if (!existsSync(commandsDir)) {
    assert.fail('Run `node scripts/build-gemini-extension.js` first')
  }
  const mds = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
  assert.ok(mds.length >= 4, `expected ≥ 4 commands, found ${mds.length}`)
})
