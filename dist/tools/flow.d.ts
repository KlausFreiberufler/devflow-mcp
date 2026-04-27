/**
 * Flow MCP Tools
 * Tools for listing, getting, creating, and updating flows in DevFlow
 */
import type { ToolModule } from '../tools/registry.js';
export declare function handleFlowUpdate(args: Record<string, unknown>): Promise<string>;
export declare const tools: ToolModule;
