/**
 * Shared MCP server boilerplate for all DevFlow entry-points.
 *
 * Used by:
 * - src/index.ts        — combined mode (all tools, BC)
 * - src/index-flows.ts  — workflow-domain only (DF-334)
 * - src/index-wiki.ts   — knowledge-domain only (DF-334)
 *
 * Each entry-point imports + registers its tool modules into the singleton
 * `registry` BEFORE calling `startMcpServer()`. The registry singleton is
 * scoped per Node process, so each spawned bin gets its own subset.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { listResources, readResource } from '../resources/devflowResources.js'
import { prompts as devflowPrompts, getPrompt } from '../prompts/devflowPrompts.js'
import { devFlowClient } from '../api/client.js'
import { registry } from '../tools/registry.js'
import { sessionContext } from '../context/session.js'
import { syncConfig } from '../config/sync.js'
import { MCP_VERSION } from '../config/version.js'

export interface StartServerOptions {
  /** Name reported to MCP-client (and printed at startup). */
  name: string
  /** Optional friendly tag for the startup banner. */
  banner?: string
}

export async function startMcpServer(opts: StartServerOptions): Promise<void> {
  const server = new Server(
    { name: opts.name, version: MCP_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.listTools(),
  }))

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: await listResources(),
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri
    const content = await readResource(uri)
    return { contents: [content] }
  })

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: devflowPrompts,
  }))

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const result = await getPrompt(name, (args || {}) as Record<string, string>)
    return result as any
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const result = await registry.handle(name, (args || {}) as Record<string, unknown>)
      const content = typeof result === 'string'
        ? [{ type: 'text', text: result }]
        : result
      return { content }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  })

  function cleanup() {
    devFlowClient.stopHeartbeat()
    if (sessionContext.isActive()) {
      const ctx = sessionContext.get()
      try {
        if (ctx?.sessionId) devFlowClient.completeAgentSession(ctx.sessionId).catch(() => {})
        if (ctx?.flow.id) devFlowClient.updateFlow(ctx.flow.id, { agentStatus: 'idle' }).catch(() => {})
      } catch {
        // Best-effort
      }
      sessionContext.release()
    }
  }

  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  await devFlowClient.init()

  if (devFlowClient.isAuthenticated()) {
    await syncConfig()
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const projectName = devFlowClient.getLinkedProjectName()
  const mode = devFlowClient.isAuthenticated() ? 'enforcement active' : 'passive mode'
  const tag = opts.banner ?? opts.name
  console.error(`DevFlow ${tag} v${MCP_VERSION} (${registry.size} tools, ${mode})`)
  if (projectName) {
    console.error(`Linked to project: ${projectName}`)
  }
}
