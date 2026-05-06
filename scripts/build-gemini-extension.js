#!/usr/bin/env node
/**
 * DF-337 — Build the Gemini CLI extension bundle.
 * Mirror of build-codex-plugin.js (DF-336) with different paths.
 */

import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SKILLS_SRC = join(ROOT, 'packages', 'skills', 'skills')
const SKILLS_DST = join(ROOT, '.gemini-extension', 'skills')
const COMMANDS_SRC = join(ROOT, 'commands')
const COMMANDS_DST = join(ROOT, '.gemini-extension', 'commands')
const MANIFEST = join(ROOT, '.gemini-extension', 'gemini-extension.json')

function copyDir(src, dst, name) {
  if (!existsSync(src)) throw new Error(`Source missing: ${src}`)
  if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
  cpSync(src, dst, { recursive: true })
  console.log(`✓ Copied ${name}: ${src} → ${dst}`)
}

function validateManifest() {
  if (!existsSync(MANIFEST)) throw new Error(`Manifest missing at ${MANIFEST}`)
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  for (const key of ['name', 'version', 'description', 'contextFileName', 'mcpServers', 'skills', 'hooks', 'commands']) {
    if (!m[key]) throw new Error(`gemini-extension.json missing required field '${key}'`)
  }
  console.log(`✓ gemini-extension.json valid (name=${m.name}, version=${m.version})`)
}

console.log('Building Gemini extension bundle...\n')
copyDir(SKILLS_SRC, SKILLS_DST, 'skills')
copyDir(COMMANDS_SRC, COMMANDS_DST, 'commands')
validateManifest()
console.log('\n✅ Gemini extension bundle ready at .gemini-extension/')
