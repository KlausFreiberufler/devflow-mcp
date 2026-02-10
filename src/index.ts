#!/usr/bin/env node
/**
 * DevFlow MCP Server v3.0.0
 *
 * Enforced workflow development with Init-Gate.
 * Tools are gated: devflow_init must be called first.
 */

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

// Register tool modules
import { tools as initTools } from './tools/init.js';
import { tools as flowTools } from './tools/flow.js';
import { tools as taskTools } from './tools/task.js';
import { tools as agentSessionTools } from './tools/agent-session.js';
import { tools as knowledgeTools } from './tools/knowledge.js';
import { tools as releaseTools } from './tools/release.js';
import { tools as searchTools } from './tools/search.js';

// NOTE: project_list removed from runtime (only used during setup)
registry.register(initTools);
registry.register(flowTools);
registry.register(taskTools);
registry.register(agentSessionTools);
registry.register(knowledgeTools);
registry.register(releaseTools);
registry.register(searchTools);

const server = new Server(
  { name: 'devflow', version: '3.0.0' },
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

// Graceful shutdown: release workflow lock
function cleanup() {
  if (sessionContext.isActive()) {
    const flowId = sessionContext.getFlowId();
    if (flowId) {
      devFlowClient.updateWorkflow(flowId, {
        agentStatus: 'idle',
      }).catch(() => {});
    }
    sessionContext.release();
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

async function main() {
  await devFlowClient.init();

  // Sync config from backend (falls back to cache or defaults)
  await syncConfig();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const projectName = devFlowClient.getLinkedProjectName();
  console.error(`DevFlow MCP Server v3.0.0 (${registry.size} tools, enforcement active)`);
  if (projectName) {
    console.error(`Linked to project: ${projectName}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
