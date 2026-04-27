/**
 * Browser-based Authentication for MCP Server
 *
 * Opens browser for user to log in, receives token via callback
 */
interface ProjectConfig {
    projectId: string;
    projectName: string;
    linkedAt: string;
}
/**
 * Save project configuration to working directory
 */
export declare function saveProjectConfig(workingDir: string, projectId: string, projectName: string): Promise<void>;
/**
 * Load project configuration from working directory
 */
export declare function loadProjectConfig(workingDir?: string): Promise<ProjectConfig | null>;
/**
 * Load credentials from file
 */
export declare function loadCredentials(): Promise<string | null>;
/**
 * Perform browser-based authentication
 *
 * 1. Request auth code from server
 * 2. Open browser to auth URL
 * 3. Poll for token
 * 4. Save credentials and project config
 */
export declare function authenticateViaBrowser(baseUrl: string, workingDir?: string): Promise<string>;
/**
 * Get token - from env, file, or browser auth
 */
export declare function getToken(baseUrl: string, workingDir?: string): Promise<string>;
export {};
