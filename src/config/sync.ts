/**
 * Config Sync - Loads project configuration from the DevFlow backend.
 *
 * Sync flow:
 * 1. Try to load from backend (GET /api/projects/{id}/config)
 * 2. If successful, cache locally and use
 * 3. If failed (404, network error), use cached version or defaults
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { devFlowClient } from '../api/client.js';
import { type RemoteConfig, DEFAULT_CONFIG } from './types.js';
import { setupClaudeMd } from '../setup/claude-md-generator.js';

const CACHE_PATH = join(homedir(), '.devflow', 'config.cache.json');

let activeConfig: RemoteConfig = DEFAULT_CONFIG;

/**
 * Get the currently active config.
 */
export function getConfig(): RemoteConfig {
  return activeConfig;
}

/**
 * Load cached config from disk.
 */
async function loadCache(): Promise<RemoteConfig | null> {
  try {
    const data = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data) as RemoteConfig;
  } catch {
    return null;
  }
}

/**
 * Save config to disk cache.
 */
async function saveCache(config: RemoteConfig): Promise<void> {
  try {
    const dir = join(homedir(), '.devflow');
    await mkdir(dir, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(config, null, 2));
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Transform raw API response to RemoteConfig.
 * Merges with defaults for missing fields.
 */
function parseRemoteConfig(raw: Record<string, unknown>): RemoteConfig {
  const config = { ...DEFAULT_CONFIG };

  if (raw.version && typeof raw.version === 'string') {
    config.version = raw.version;
  }
  if (raw.statePermissions && typeof raw.statePermissions === 'object') {
    config.statePermissions = raw.statePermissions as Record<string, string[]>;
  }
  if (raw.nextStepGuidance && typeof raw.nextStepGuidance === 'object') {
    config.nextStepGuidance = raw.nextStepGuidance as Record<string, string>;
  }
  if (raw.requiredFields && typeof raw.requiredFields === 'object') {
    config.requiredFields = raw.requiredFields as RemoteConfig['requiredFields'];
  }
  if (raw.blockedTransitions && typeof raw.blockedTransitions === 'object') {
    config.blockedTransitions = raw.blockedTransitions as RemoteConfig['blockedTransitions'];
  }

  return config;
}

/**
 * Sync config from backend.
 * Called once at server startup from index.ts.
 *
 * Precedence: Backend > Cache > Defaults
 * Also auto-updates CLAUDE.md if config changed.
 */
export async function syncConfig(): Promise<void> {
  const previousVersion = activeConfig.version;

  // Try backend first
  try {
    const result = await devFlowClient.getProjectConfig();
    if (result.success && result.data) {
      activeConfig = parseRemoteConfig(result.data);
      await saveCache(activeConfig);
      console.error(`Config synced from backend (version: ${activeConfig.version})`);

      // Auto-update CLAUDE.md if config changed
      if (activeConfig.version !== previousVersion) {
        await updateClaudeMd();
      }
      return;
    }
  } catch {
    // Backend not available or endpoint doesn't exist
  }

  // Try cache
  const cached = await loadCache();
  if (cached) {
    activeConfig = cached;
    console.error(`Config loaded from cache (version: ${activeConfig.version})`);
    return;
  }

  // Use defaults
  activeConfig = DEFAULT_CONFIG;
  console.error('Config: using hardcoded defaults');
}

/**
 * Auto-update CLAUDE.md in the working directory.
 * Uses the project name from the linked project config.
 */
async function updateClaudeMd(): Promise<void> {
  const projectName = devFlowClient.getLinkedProjectName();
  if (!projectName) return;

  try {
    await setupClaudeMd(process.cwd(), projectName);
    console.error('CLAUDE.md auto-updated from config');
  } catch {
    // Non-critical: CLAUDE.md update failure doesn't block startup
  }
}
