/**
 * Tool Registry with Guard Middleware
 *
 * All tool calls pass through guards and post-processing:
 * 1. Context-Guard: blocks tools without active devflow_init session
 * 2. State-Guard: blocks tools not allowed in the current workflow state
 * 3. Auto-Logger: logs every tool call to the agent session
 * 4. Auto-Status: derives agentStatus from tool calls
 */

import { sessionContext } from '../context/session.js';
import {
  DISCOVERY_TOOLS,
  buildNoContextMessage,
  buildStateBlockMessage,
} from '../context/permissions.js';
import { logToolCall } from '../context/auto-logger.js';
import { applyDerivedStatus } from '../context/auto-status.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ToolRegistration {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export type ToolModule = Record<string, ToolRegistration>;

class ToolRegistry {
  private tools = new Map<string, ToolRegistration>();

  register(module: ToolModule): void {
    for (const [name, registration] of Object.entries(module)) {
      if (this.tools.has(name)) {
        throw new Error(`Duplicate tool registration: ${name}`);
      }
      this.tools.set(name, registration);
    }
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Dispatch a tool call with Context-Guard, State-Guard, Auto-Logging, and Auto-Status.
   */
  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Guard 1: Context-Guard - discovery tools bypass
    if (!DISCOVERY_TOOLS.has(name)) {
      if (!sessionContext.isActive()) {
        logToolCall({ toolName: name, args, blocked: true, blockReason: 'Kein aktiver Context' });
        return buildNoContextMessage(name);
      }

      // Guard 2: State-Guard
      if (!sessionContext.isToolAllowed(name)) {
        const ctx = sessionContext.get()!;
        logToolCall({ toolName: name, args, blocked: true, blockReason: `State '${ctx.workflow.currentState}'` });
        return buildStateBlockMessage(
          name,
          ctx.workflow.summary,
          ctx.workflow.id,
          ctx.workflow.currentState,
        );
      }
    }

    // Execute tool
    const start = Date.now();
    const result = await tool.handler(args);
    const durationMs = Date.now() - start;

    // Auto-Log (fire-and-forget)
    logToolCall({ toolName: name, args, blocked: false, durationMs });

    // Auto-Status (fire-and-forget, skip devflow_init - it sets its own status)
    if (name !== 'devflow_init') {
      applyDerivedStatus(name, args);
    }

    return result;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }
}

export const registry = new ToolRegistry();
