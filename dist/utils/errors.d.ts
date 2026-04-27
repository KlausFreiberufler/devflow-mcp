/**
 * Error handling utilities for MCP tools
 */
import type { ToolHandlerResult } from '../tools/registry.js';
/**
 * Wrap a tool handler with user-friendly error messages
 */
export declare function withErrorHandling(toolName: string, handler: (args: Record<string, unknown>) => Promise<ToolHandlerResult>): (args: Record<string, unknown>) => Promise<ToolHandlerResult>;
