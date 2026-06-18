/**
 * Flow MCP Tools
 * Tools for listing, getting, creating, and updating flows in DevFlow
 */
import type { ToolModule } from '../tools/registry.js';
/**
 * DF-432 — Pure renderer for backend 409 gate.failures[] responses (DF-374 shape).
 * Exported for unit-tests.
 *
 * Pre-DF-432 the plugin only handled the DF-292 / 403 self-approval shape and
 * the modern unified-gate 409 fell through to a generic `Error: ${msg}` — the
 * per-failure reason + hint were silently dropped. This renderer keeps them
 * front-and-center.
 *
 * Input shape (DF-374):
 *   {
 *     transition?: 'in_progress→review',
 *     failures: [{
 *       conditionId: string,
 *       label?: string,
 *       reason: string,
 *       hint?: string | null,
 *       openTasks?: [{id, text}],
 *       pendingDrafts?: any[],
 *       validationErrors?: any[],
 *     }],
 *     autoFixed?: string[],
 *   }
 */
export declare function renderGateFailures(gate: {
    transition?: string;
    failures?: Array<{
        conditionId: string;
        label?: string;
        reason: string;
        hint?: string | null;
        openTasks?: Array<{
            id: string;
            text: string;
        }>;
        pendingDrafts?: unknown[];
        validationErrors?: unknown[];
    }>;
    autoFixed?: string[];
}, topLevelError?: string): string;
export declare function handleFlowUpdate(args: Record<string, unknown>): Promise<string>;
export declare const tools: ToolModule;
