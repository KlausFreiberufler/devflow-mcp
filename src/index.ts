#!/usr/bin/env node
/**
 * DevFlow MCP Server
 *
 * Provides Claude Code with tools to interact with DevFlow.
 * Tools are automatically registered via the Tool Registry.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { devFlowClient } from './api/client.js';
import { registry } from './tools/registry.js';

// Register all tool modules
import { tools as projectTools } from './tools/project.js';
import { tools as flowTools } from './tools/flow.js';
import { tools as taskTools } from './tools/task.js';
import { tools as agentSessionTools } from './tools/agent-session.js';
import { tools as knowledgeTools } from './tools/knowledge.js';
import { tools as releaseTools } from './tools/release.js';
import { tools as searchTools } from './tools/search.js';

registry.register(projectTools);
registry.register(flowTools);
registry.register(taskTools);
registry.register(agentSessionTools);
registry.register(knowledgeTools);
registry.register(releaseTools);
registry.register(searchTools);

// Initialize server
const server = new Server(
  { name: 'devflow', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.listTools(),
}));

// Handle tool calls
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

// Start server
async function main() {
  await devFlowClient.init();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const projectName = devFlowClient.getLinkedProjectName();
  console.error(`DevFlow MCP Server v2.0.0 (${registry.size} tools)`);
  if (projectName) {
    console.error(`Linked to project: ${projectName}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
