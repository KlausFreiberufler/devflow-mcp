#!/usr/bin/env node
/**
 * Auto-generate index.json from each skill's SKILL.md frontmatter.
 *
 * Usage: node scripts/build-index.js
 *
 * Reads packages/skills/skills/<name>/SKILL.md, parses YAML frontmatter,
 * writes index.json with [{ name, description, flow_state, hooks, discipline_token, iron_laws }].
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = join(__dirname, '..', 'skills')
const INDEX_PATH = join(__dirname, '..', 'index.json')

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const block = match[1]
  const out = {}
  let currentKey = null
  let collectingArray = false
  for (const line of block.split('\n')) {
    if (collectingArray) {
      const item = line.match(/^\s*-\s*(.*)$/)
      if (item) { out[currentKey].push(item[1].trim()); continue }
      collectingArray = false
    }
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    const val = raw.trim()
    currentKey = key
    if (val === '') {
      out[key] = []
      collectingArray = true
    } else if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    } else {
      out[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return out
}

const skills = readdirSync(SKILLS_DIR)
  .filter(name => {
    try { return statSync(join(SKILLS_DIR, name)).isDirectory() } catch { return false }
  })
  .map(name => {
    const skillMd = join(SKILLS_DIR, name, 'SKILL.md')
    const md = readFileSync(skillMd, 'utf8')
    const fm = parseFrontmatter(md)
    if (!fm) throw new Error(`Skill ${name} has no frontmatter`)
    return {
      name: fm.name || name,
      slug: name,
      description: fm.description || '',
      flow_state: fm.flow_state || null,
      hooks: Array.isArray(fm.hooks) ? fm.hooks.map(Number) : [],
      discipline_token: fm.discipline_token || null,
      iron_laws_count: Array.isArray(fm.iron_laws) ? fm.iron_laws.length : 0,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const index = {
  version: 1,
  generated_at: new Date().toISOString(),
  count: skills.length,
  skills,
}

writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')
console.log(`Wrote ${INDEX_PATH} with ${skills.length} skills.`)
