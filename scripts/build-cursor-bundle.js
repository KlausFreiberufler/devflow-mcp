#!/usr/bin/env node
/**
 * DF-338 — Build the Cursor bundle.
 * Mirror of build-codex-plugin.js / build-gemini-extension.js.
 */

import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SKILLS_SRC = join(ROOT, 'packages', 'skills', 'skills')
const SKILLS_DST = join(ROOT, '.cursor', 'skills')
const COMMANDS_SRC = join(ROOT, 'commands')
const COMMANDS_DST = join(ROOT, '.cursor', 'commands')
const MCP_JSON = join(ROOT, '.cursor', 'mcp.json')
const HOOKS_JSON = join(ROOT, '.cursor', 'hooks.json')
const RULES_MDC = join(ROOT, '.cursor', 'rules', 'devflow.mdc')

function copyDir(src, dst, name) {
  if (!existsSync(src)) throw new Error(`Source missing: ${src}`)
  if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
  cpSync(src, dst, { recursive: true })
  console.log(`✓ Copied ${name}: ${src} → ${dst}`)
}

function checkExists(p, label) {
  if (!existsSync(p)) throw new Error(`${label} missing at ${p}`)
  console.log(`✓ ${label} exists`)
}

console.log('Building Cursor bundle...\n')
copyDir(SKILLS_SRC, SKILLS_DST, 'skills')
copyDir(COMMANDS_SRC, COMMANDS_DST, 'commands')
checkExists(MCP_JSON, 'mcp.json')
checkExists(HOOKS_JSON, 'hooks.json')
checkExists(RULES_MDC, 'rules/devflow.mdc')
console.log('\n✅ Cursor bundle ready at .cursor/')
