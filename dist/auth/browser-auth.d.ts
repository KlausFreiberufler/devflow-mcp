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
 * DF-543 — how long a CLI token really lives when the server does not say.
 *
 * The backend caps API tokens at 90 days (DF-162). This file used to write
 * "one year" regardless, so from day 91 onward it vouched for a token the
 * server had already retired — and because loadCredentials only ever checked
 * that self-invented date, getToken never fell through to the browser login.
 * The CLI reported itself as connected while every call failed with 401.
 */
export declare const DEFAULT_TOKEN_LIFETIME_MS: number;
export type StoredTokenAction = 
/** The server accepted it. */
'use'
/** The server refused it — drop the file and sign in again. */
 | 'discard-and-relogin'
/** We could not tell (offline, 5xx). Keep it; do not lock the user out. */
 | 'keep-despite-error';
/**
 * DF-543 — decide what to do with a token found on disk.
 *
 * Only an explicit refusal discards it. A network error or a 5xx means the
 * server could not answer, not that the token is bad — discarding then would
 * force a browser login during an outage, which is exactly when the user can
 * least afford one.
 */
export declare function decideStoredTokenAction(probe: {
    ok: boolean;
    status: number | null;
} | null | undefined): StoredTokenAction;
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
 * DF-543 — drop the stored credentials so the next getToken falls through to
 * the browser login. Missing file is success, not an error.
 */
export declare function clearCredentials(): Promise<void>;
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
