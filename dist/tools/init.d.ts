/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, creates session via backend init endpoint, sets context.
 */
import type { ToolModule } from './registry.js';
/**
 * DF-439 — render the compact `## Wiki-Briefing` block for the init response
 * from GET /api/flows/:id/wiki-context. Exported for tests.
 */
export declare function buildInitWikiBriefing(flowId: string): Promise<string>;
export declare const tools: ToolModule;
