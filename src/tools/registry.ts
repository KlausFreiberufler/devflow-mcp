/**
 * Tool Registry with Guard Middleware
 *
 * All tool calls pass through two guards:
 * 1. Context-Guard: blocks tools without active devflow_init session
 * 2. State-Guard: blocks tools not allowed in the current workflow state
 */

import { sessionContext } from '../context/session.js';
import {
  DISCOVERY_TOOLS,
  buildNoContextMessage,
  buildStateBlockMessage,
} from '../context/permissions.js';

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
   * Dispatch a tool call with Context-Guard and State-Guard.
   */
  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Guard 1: Context-Guard - discovery tools bypass
    if (!DISCOVERY_TOOLS.has(name)) {
      if (!sessionContext.isActive()) {
        return buildNoContextMessage(name);
      }

      // Guard 2: State-Guard
      if (!sessionContext.isToolAllowed(name)) {
        const ctx = sessionContext.get()!;
        return buildStateBlockMessage(
          name,
          ctx.workflow.summary,
          ctx.workflow.id,
          ctx.workflow.currentState,
        );
      }
    }

    return tool.handler(args);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }
}

export const registry = new ToolRegistry();
