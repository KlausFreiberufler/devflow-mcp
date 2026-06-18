#!/usr/bin/env node
/**
 * DevFlow MCP Server — Wiki entry-point (DF-334).
 *
 * Knowledge-Domain only: ~28 tools (under Cursor's 40-tool/server cap).
 *
 * Companion: index-flows.ts (workflow-domain).
 * Combined entry-point with all tools: index.ts.
 *
 * Subcommands (`setup`, `uninstall`) delegate to the combined index.
 */

import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { registry } from './tools/registry.js'

// Wiki-domain tool modules
import { tools as docsTools } from './tools/docs.js'
import { tools as searchTools } from './tools/search.js'
import { tools as wikiTools } from './tools/wiki.js'
import { tools as adrsTools } from './tools/adrs.js'
import { tools as knowledgeDraftsTools } from './tools/knowledgeDrafts.js'
import { tools as planningContextTools } from './tools/planningContext.js'
import { tools as bootstrapAuditTools } from './tools/bootstrapAudit.js'

import { startMcpServer } from './server/start-server.js'

// Subcommand routing — delegate to combined index for setup/uninstall
if (process.argv[2] === 'setup' || process.argv[2] === 'uninstall') {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const combinedScript = join(__dirname, 'index.js')
  execFileSync('node', [combinedScript, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(0)
}

registry.register(docsTools)
registry.register(searchTools)
registry.register(wikiTools)
registry.register(adrsTools)
registry.register(knowledgeDraftsTools)
registry.register(planningContextTools)
registry.register(bootstrapAuditTools)

startMcpServer({ name: 'devflow-wiki', banner: 'Wiki MCP Server' }).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
