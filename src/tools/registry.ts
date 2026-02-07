/**
 * Tool Registry
 * Automatically collects and dispatches MCP tools from all modules.
 */

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

  /**
   * Register all tools from a module
   */
  register(module: ToolModule): void {
    for (const [name, registration] of Object.entries(module)) {
      if (this.tools.has(name)) {
        throw new Error(`Duplicate tool registration: ${name}`);
      }
      this.tools.set(name, registration);
    }
  }

  /**
   * Get all tool definitions for ListToolsRequest
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Dispatch a tool call to the right handler
   */
  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(args);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }
}

export const registry = new ToolRegistry();
