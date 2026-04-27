/**
 * devflow-mcp uninstall — Remove DevFlow MCP from a client
 *
 * Reverse of `devflow-mcp setup`:
 * 1. Remove devflow entry from client config file
 * 2. Remove instruction file markers (.cursorrules, AGENTS.md, etc.)
 * 3. Remove .devflow.json
 * 4. Deregister from backend
 */
export declare function uninstall(args: string[]): Promise<void>;
