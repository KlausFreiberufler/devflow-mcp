/**
 * Knowledge Drafts MCP Tools (DF-245)
 *
 * MCP-first path: Claude reads project context, classifies flows itself, and writes
 * drafts back via these tools. No server-side LLM, no API-key management. The backend
 * is a pure data-and-instruction provider; the thinking happens in Claude.
 */
import type { ToolModule } from '../tools/registry.js';
export declare const tools: ToolModule;
