/**
 * Knowledge Drafts MCP Tools (DF-245)
 *
 * MCP-first path: Claude reads project context, classifies flows itself, and writes
 * drafts back via these tools. No server-side LLM, no API-key management. The backend
 * is a pure data-and-instruction provider; the thinking happens in Claude.
 */
import type { ToolModule } from '../tools/registry.js';
/**
 * DF-477 — the schema says `id`, but the MCP layer does not enforce it and
 * LLMs plausibly guess `draftId`. Accept both, and fail loud BEFORE any
 * backend call — an undefined id used to travel into the URL and come back
 * as a misleading "Draft not found".
 */
export declare function resolveDraftId(args: Record<string, unknown>): string | null;
export declare const tools: ToolModule;
