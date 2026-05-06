/**
 * Shared MCP server boilerplate for all DevFlow entry-points.
 *
 * Used by:
 * - src/index.ts        — combined mode (all tools, BC)
 * - src/index-flows.ts  — workflow-domain only (DF-334)
 * - src/index-wiki.ts   — knowledge-domain only (DF-334)
 *
 * Each entry-point imports + registers its tool modules into the singleton
 * `registry` BEFORE calling `startMcpServer()`. The registry singleton is
 * scoped per Node process, so each spawned bin gets its own subset.
 */
export interface StartServerOptions {
    /** Name reported to MCP-client (and printed at startup). */
    name: string;
    /** Optional friendly tag for the startup banner. */
    banner?: string;
}
export declare function startMcpServer(opts: StartServerOptions): Promise<void>;
