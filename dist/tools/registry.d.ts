/**
 * Tool Registry with Guard Middleware
 *
 * All tool calls pass through guards and post-processing:
 * 1. Context-Guard: blocks tools without active devflow_init session
 * 2. State-Guard: blocks tools not allowed in the current flow state
 * 3. Auto-Logger: logs every tool call to the agent session
 * 4. Auto-Status: derives agentStatus from tool calls
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: object;
}
export type ToolContentBlock = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    data: string;
    mimeType: string;
};
export type ToolHandlerResult = string | ToolContentBlock[];
export interface ToolRegistration {
    definition: ToolDefinition;
    handler: (args: Record<string, unknown>) => Promise<ToolHandlerResult>;
}
export type ToolModule = Record<string, ToolRegistration>;
declare class ToolRegistry {
    private tools;
    register(module: ToolModule): void;
    listTools(): ToolDefinition[];
    /**
     * Dispatch a tool call with Context-Guard, State-Guard, Auto-Logging, and Auto-Status.
     */
    handle(name: string, args: Record<string, unknown>): Promise<ToolHandlerResult>;
    has(name: string): boolean;
    get size(): number;
}
export declare const registry: ToolRegistry;
export {};
