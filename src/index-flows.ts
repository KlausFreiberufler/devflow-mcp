#!/usr/bin/env node
/**
 * DevFlow MCP Server — Flows entry-point (DF-334).
 *
 * Workflow-Domain only: ~25 tools (under Cursor's 40-tool/server cap).
 *
 * Companion: index-wiki.ts (knowledge-domain).
 * Combined entry-point with all tools: index.ts.
 *
 * Subcommands (`setup`, `uninstall`) delegate to the combined index — these
 * configure the user's mcp.json regardless of which bin runs them.
 */

import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { registry } from './tools/registry.js'

// Flows-domain tool modules
import { tools as initTools } from './tools/init.js'
import { tools as flowTools } from './tools/flow.js'
import { tools as taskTools } from './tools/task.js'
import { tools as agentSessionTools } from './tools/agent-session.js'
import { tools as releaseTools } from './tools/release.js'
import { tools as statusTools } from './tools/status.js'
import { tools as connectTools } from './tools/connect.js'
import { tools as disconnectTools } from './tools/disconnect.js'
import { tools as attachmentTools } from './tools/attachment.js'
import { tools as stateAwareTools } from './tools/stateAware.js'
import { tools as disciplineTokenTools } from './tools/disciplineTokens.js'

import { startMcpServer } from './server/start-server.js'

// Subcommand routing — delegate to combined index for setup/uninstall
if (process.argv[2] === 'setup' || process.argv[2] === 'uninstall') {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const combinedScript = join(__dirname, 'index.js')
  execFileSync('node', [combinedScript, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(0)
}

registry.register(initTools)
registry.register(flowTools)
registry.register(taskTools)
registry.register(agentSessionTools)
registry.register(releaseTools)
registry.register(statusTools)
registry.register(connectTools)
registry.register(disconnectTools)
registry.register(attachmentTools)
registry.register(stateAwareTools)
registry.register(disciplineTokenTools)

startMcpServer({ name: 'devflow-flows', banner: 'Flows MCP Server' }).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
