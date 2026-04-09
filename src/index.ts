#!/usr/bin/env node
/**
 * DevFlow MCP Server — version defined in config/version.ts
 *
 * Enforced flow development with Init-Gate.
 * Tools are gated: devflow_init must be called first.
 *
 * Subcommands:
 *   devflow-mcp         → Start MCP server (default)
 *   devflow-mcp setup   → Run setup wizard
 */

import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { devFlowClient } from './api/client.js';
import { registry } from './tools/registry.js';
import { sessionContext } from './context/session.js';
import { syncConfig } from './config/sync.js';
import { MCP_VERSION } from './config/version.js';

// Register tool modules
import { tools as initTools } from './tools/init.js';
import { tools as flowTools } from './tools/flow.js';
import { tools as taskTools } from './tools/task.js';
import { tools as agentSessionTools } from './tools/agent-session.js';
import { tools as docsTools } from './tools/docs.js';
import { tools as releaseTools } from './tools/release.js';
import { tools as searchTools } from './tools/search.js';
import { tools as guidelinesTools } from './tools/guidelines.js';
import { tools as statusTools } from './tools/status.js';
import { tools as connectTools } from './tools/connect.js';
import { tools as disconnectTools } from './tools/disconnect.js';
import { tools as attachmentTools } from './tools/attachment.js';

// Subcommand routing: `devflow-mcp setup [--url ...]` delegates to setup script
if (process.argv[2] === 'setup') {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const setupScript = join(__dirname, 'setup', 'setup.js');
  execFileSync('node', [setupScript, ...process.argv.slice(3)], { stdio: 'inherit' });
  process.exit(0);
}

// Subcommand: `devflow-mcp uninstall --client <type>`
if (process.argv[2] === 'uninstall') {
  const { uninstall } = await import('./setup/uninstall.js');
  await uninstall(process.argv.slice(3));
  process.exit(0);
}

// NOTE: project_list removed from runtime (only used during setup)
registry.register(initTools);
registry.register(flowTools);
registry.register(taskTools);
registry.register(agentSessionTools);
registry.register(docsTools);
registry.register(releaseTools);
registry.register(searchTools);
registry.register(guidelinesTools);
registry.register(statusTools);
registry.register(connectTools);
registry.register(disconnectTools);
registry.register(attachmentTools);

const server = new Server(
  { name: 'devflow', version: MCP_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await registry.handle(name, (args || {}) as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Graceful shutdown: complete session + reset flow status
function cleanup() {
  devFlowClient.stopHeartbeat();
  if (sessionContext.isActive()) {
    const ctx = sessionContext.get();
    try {
      if (ctx?.sessionId) {
        devFlowClient.completeAgentSession(ctx.sessionId).catch(() => {});
      }
      if (ctx?.flow.id) {
        devFlowClient.updateFlow(ctx.flow.id, {
          agentStatus: 'idle',
        }).catch(() => {});
      }
    } catch {
      // Best-effort
    }
    sessionContext.release();
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

async function main() {
  await devFlowClient.init();

  // Only sync config if authenticated (skip in passive mode)
  if (devFlowClient.isAuthenticated()) {
    await syncConfig();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const projectName = devFlowClient.getLinkedProjectName();
  const mode = devFlowClient.isAuthenticated() ? 'enforcement active' : 'passive mode';
  console.error(`DevFlow MCP Server v${MCP_VERSION} (${registry.size} tools, ${mode})`);
  if (projectName) {
    console.error(`Linked to project: ${projectName}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
