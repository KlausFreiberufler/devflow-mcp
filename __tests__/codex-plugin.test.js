/**
 * DF-336 — Codex Plugin Scaffold Tests
 *
 * Pinnt:
 * - plugin.json schema-valid (required fields)
 * - .mcp.json referenziert beide DevFlow-Server (flows + wiki)
 * - hooks/hooks.json existiert und ist valid JSON
 * - skills/ wurde build-time gefüllt (19 dirs)
 * - commands/ wurde build-time gefüllt (mind. 4 .md files)
 * - hook-shell-scripts haben gültige Bash-Syntax
 */

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PLUGIN_DIR = join(ROOT, '.codex-plugin')

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

test('plugin.json has required fields', () => {
  const manifest = readJson(join(PLUGIN_DIR, 'plugin.json'))
  for (const key of ['name', 'version', 'description', 'skills', 'mcp', 'hooks', 'commands']) {
    assert.ok(manifest[key], `plugin.json missing required field '${key}'`)
  }
  assert.equal(manifest.name, 'devflow', 'plugin.json name must be "devflow"')
})

test('.mcp.json references devflow-flows and devflow-wiki', () => {
  const mcp = readJson(join(PLUGIN_DIR, '.mcp.json'))
  assert.ok(mcp.mcpServers, '.mcp.json must have mcpServers')
  assert.ok(mcp.mcpServers['devflow-flows'], '.mcp.json must reference devflow-flows')
  assert.ok(mcp.mcpServers['devflow-wiki'], '.mcp.json must reference devflow-wiki')
})

test('hooks/hooks.json is valid JSON with hooks array', () => {
  const hooks = readJson(join(PLUGIN_DIR, 'hooks', 'hooks.json'))
  assert.ok(Array.isArray(hooks.hooks), 'hooks.json must have hooks array')
  assert.ok(hooks.hooks.length > 0, 'must have at least one hook configured')
})

test('hook-shell scripts have valid bash syntax', () => {
  const hooksDir = join(PLUGIN_DIR, 'hooks')
  const shScripts = readdirSync(hooksDir).filter(f => f.endsWith('.sh'))
  assert.ok(shScripts.length >= 2, 'expect at least pre-tool-use.sh + pre-flow-update.sh')
  for (const script of shScripts) {
    const result = spawnSync('bash', ['-n', join(hooksDir, script)])
    assert.equal(result.status, 0, `${script} bash syntax invalid: ${result.stderr.toString()}`)
  }
})

test('skills/ folder populated by build (19 dirs)', () => {
  const skillsDir = join(PLUGIN_DIR, 'skills')
  if (!existsSync(skillsDir)) {
    // Build wasn't run yet — fail with helpful hint
    assert.fail('Run `node scripts/build-codex-plugin.js` first to populate skills/')
  }
  const dirs = readdirSync(skillsDir).filter(n => {
    try { return statSync(join(skillsDir, n)).isDirectory() } catch { return false }
  })
  assert.equal(dirs.length, 19, `expected 19 skill folders, found ${dirs.length}`)
  // canonical reference
  assert.ok(dirs.includes('devflow-tdd'), 'devflow-tdd skill must be present')
})

test('commands/ folder populated by build (≥ 4 md files)', () => {
  const commandsDir = join(PLUGIN_DIR, 'commands')
  if (!existsSync(commandsDir)) {
    assert.fail('Run `node scripts/build-codex-plugin.js` first to populate commands/')
  }
  const mds = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
  assert.ok(mds.length >= 4, `expected ≥ 4 slash-command markdown files, found ${mds.length}`)
})
