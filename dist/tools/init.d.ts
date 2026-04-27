/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, creates session via backend init endpoint, sets context.
 */
import type { ToolModule } from './registry.js';
export declare const tools: ToolModule;
