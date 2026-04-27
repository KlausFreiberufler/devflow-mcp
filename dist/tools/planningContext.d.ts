/**
 * Planning Context MCP Tool (DF-253)
 *
 * One-call bundle for Claude at the start of flow planning:
 * related ADRs, parallel open flows, similar done flows, forward-intents,
 * architecture-module excerpts, drift warnings. Priority-scored and budgeted
 * to stay under ~5500 tokens.
 */
import type { ToolModule } from './registry.js';
export declare const tools: ToolModule;
