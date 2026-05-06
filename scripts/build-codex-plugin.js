#!/usr/bin/env node
/**
 * DF-336 — Build the Codex CLI plugin bundle.
 *
 * Copies skills + commands from canonical sources into .codex-plugin/.
 * Validates plugin.json minimal schema.
 *
 * Run: node scripts/build-codex-plugin.js
 */

import { cpSync, existsSync, readFileSync, statSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SKILLS_SRC = join(ROOT, 'packages', 'skills', 'skills')
const SKILLS_DST = join(ROOT, '.codex-plugin', 'skills')
const COMMANDS_SRC = join(ROOT, 'commands')
const COMMANDS_DST = join(ROOT, '.codex-plugin', 'commands')
const PLUGIN_MANIFEST = join(ROOT, '.codex-plugin', 'plugin.json')

function copyDir(src, dst, name) {
  if (!existsSync(src)) {
    throw new Error(`Source missing: ${src}`)
  }
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true, force: true })
  }
  cpSync(src, dst, { recursive: true })
  console.log(`✓ Copied ${name}: ${src} → ${dst}`)
}

function validatePluginJson() {
  if (!existsSync(PLUGIN_MANIFEST)) {
    throw new Error(`plugin.json missing at ${PLUGIN_MANIFEST}`)
  }
  const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, 'utf8'))
  const required = ['name', 'version', 'description', 'skills', 'mcp', 'hooks', 'commands']
  for (const key of required) {
    if (!manifest[key]) throw new Error(`plugin.json missing required field '${key}'`)
  }
  console.log(`✓ plugin.json valid (name=${manifest.name}, version=${manifest.version})`)
}

console.log('Building Codex plugin bundle...\n')
copyDir(SKILLS_SRC, SKILLS_DST, 'skills')
copyDir(COMMANDS_SRC, COMMANDS_DST, 'commands')
validatePluginJson()
console.log('\n✅ Codex plugin bundle ready at .codex-plugin/')
