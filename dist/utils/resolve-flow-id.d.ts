/**
 * Resolve a partial flow ID to a full ID.
 * Supports display IDs (e.g., "WF-21", "DF-5", "5A2-24"), internal IDs, and prefix matching.
 */
export declare function resolveFlowId(partialId: string): Promise<string | null>;
