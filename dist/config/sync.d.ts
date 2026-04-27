/**
 * Config Sync - Loads project configuration from the DevFlow backend.
 *
 * Sync flow:
 * 1. Try to load from backend (GET /api/projects/{id}/config)
 * 2. If successful, cache locally and use
 * 3. If failed (404, network error), use cached version or defaults
 */
import { type RemoteConfig } from './types.js';
/**
 * Get the currently active config.
 */
export declare function getConfig(): RemoteConfig;
/**
 * Sync config from backend.
 * Called once at server startup from index.ts.
 *
 * Precedence: Backend > Cache > Defaults
 * Also auto-updates CLAUDE.md if config changed.
 */
export declare function syncConfig(): Promise<void>;
