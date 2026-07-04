/**
 * State-Permission Map
 *
 * Defines which tools work without init (discovery) and block messages.
 *
 * Permissions are now solely determined by the backend via `allowedActions`
 * returned during session init and next-step resolution.
 */
/** Tools that work WITHOUT devflow_init (discovery mode) */
export declare const DISCOVERY_TOOLS: ReadonlySet<string>;
/**
 * NEXT_STEP_GUIDANCE - Proxy that reads from active config.
 * Existing code (init.ts, flow.ts) can use NEXT_STEP_GUIDANCE[state] as before,
 * but the values come from the remote config when available.
 */
export declare const NEXT_STEP_GUIDANCE: Record<string, string>;
/**
 * Resolve the next-step guidance for a state, taking the step's
 * transitionPolicy into account (DF-437). Falls back to the configured
 * per-state guidance for every non-self-approval case.
 */
export declare function getGuidanceFor(state: string, transitionPolicy?: string | null): string;
export declare function buildNoContextMessage(toolName: string): string;
export declare function buildStateBlockMessage(toolName: string, flowSummary: string, flowId: string, currentState: string, allowedActions?: string[]): string;
