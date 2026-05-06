#!/usr/bin/env node
/**
 * DevFlow MCP Server — combined entry-point (BC default).
 *
 * Registers all 19 tool modules. For Cursor (40-tool/server cap) prefer
 * `devflow-mcp-flows` + `devflow-mcp-wiki` (DF-334).
 *
 * Subcommands:
 *   devflow-mcp           → Start combined MCP server (default)
 *   devflow-mcp setup     → Run setup wizard
 *   devflow-mcp uninstall → Remove DevFlow config from a client
 */

import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { registry } from './tools/registry.js'

// Register all tool modules
import { tools as initTools } from './tools/init.js'
import { tools as flowTools } from './tools/flow.js'
import { tools as taskTools } from './tools/task.js'
import { tools as agentSessionTools } from './tools/agent-session.js'
import { tools as docsTools } from './tools/docs.js'
import { tools as releaseTools } from './tools/release.js'
import { tools as searchTools } from './tools/search.js'
import { tools as guidelinesTools } from './tools/guidelines.js'
import { tools as statusTools } from './tools/status.js'
import { tools as connectTools } from './tools/connect.js'
import { tools as disconnectTools } from './tools/disconnect.js'
import { tools as attachmentTools } from './tools/attachment.js'
import { tools as wikiTools } from './tools/wiki.js'
import { tools as adrsTools } from './tools/adrs.js'
import { tools as knowledgeDraftsTools } from './tools/knowledgeDrafts.js'
import { tools as planningContextTools } from './tools/planningContext.js'
import { tools as bootstrapAuditTools } from './tools/bootstrapAudit.js'
import { tools as stateAwareTools } from './tools/stateAware.js'
import { tools as disciplineTokenTools } from './tools/disciplineTokens.js'

import { startMcpServer } from './server/start-server.js'

// Subcommand routing: `devflow-mcp setup [--url ...]` delegates to setup script
if (process.argv[2] === 'setup') {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const setupScript = join(__dirname, 'setup', 'setup.js')
  execFileSync('node', [setupScript, ...process.argv.slice(3)], { stdio: 'inherit' })
  process.exit(0)
}

// Subcommand: `devflow-mcp uninstall --client <type>`
if (process.argv[2] === 'uninstall') {
  const { uninstall } = await import('./setup/uninstall.js')
  await uninstall(process.argv.slice(3))
  process.exit(0)
}

// NOTE: project_list removed from runtime (only used during setup)
registry.register(initTools)
registry.register(flowTools)
registry.register(taskTools)
registry.register(agentSessionTools)
registry.register(docsTools)
registry.register(releaseTools)
registry.register(searchTools)
registry.register(guidelinesTools)
registry.register(statusTools)
registry.register(connectTools)
registry.register(disconnectTools)
registry.register(attachmentTools)
registry.register(wikiTools)
registry.register(adrsTools)
registry.register(knowledgeDraftsTools)
registry.register(planningContextTools)
registry.register(bootstrapAuditTools)
registry.register(stateAwareTools)
registry.register(disciplineTokenTools)

startMcpServer({ name: 'devflow', banner: 'MCP Server (combined)' }).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
