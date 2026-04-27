/**
 * MCP Resources (DF-240)
 *
 * URI-Schema: `devflow://project/{projectId}/...`
 *  - /adr/{number}          → ADR content as text/markdown
 *  - /flow/{displayId}      → flow + plan + agent_summary
 *  - /graph                 → graph summary (nodes/edges counts, top-connected)
 *  - /search?q=...          → full-text search results
 */
export interface ResourceDescriptor {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}
export declare function listResources(): Promise<ResourceDescriptor[]>;
export interface ResourceContent {
    uri: string;
    mimeType: string;
    text: string;
}
export declare function readResource(uri: string): Promise<ResourceContent>;
