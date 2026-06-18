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
import { type RemoteConfig, type StrictnessConfig, DEFAULT_CONFIG, DEFAULT_STRICTNESS, deriveEnforcementFromStrictness } from './types.js';

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
 * If strictness is present, derives enforcement from it.
 * Otherwise falls back to explicit config fields.
 */
function parseRemoteConfig(raw: Record<string, unknown>): RemoteConfig {
  const config = { ...DEFAULT_CONFIG };

  if (raw.version && typeof raw.version === 'string') {
    config.version = raw.version;
  }

  // Parse gitEnabled
  if (typeof raw.gitEnabled === 'boolean') {
    config.gitEnabled = raw.gitEnabled;
  }

  // Parse nextStepGuidance (statePermissions removed — backend is sole authority via allowedActions)
  if (raw.nextStepGuidance && typeof raw.nextStepGuidance === 'object') {
    config.nextStepGuidance = raw.nextStepGuidance as Record<string, string>;
  }

  // Parse strictness - if present, derive enforcement from it
  if (raw.strictness && typeof raw.strictness === 'object') {
    config.strictness = { ...DEFAULT_STRICTNESS, ...(raw.strictness as Partial<StrictnessConfig>) };
    const derived = deriveEnforcementFromStrictness(config.strictness);
    config.requiredFields = derived.requiredFields;
    console.error(`Strictness loaded: flow=${config.strictness.flowRequired} plan=${config.strictness.planRequired} tasks=${config.strictness.taskTracking} git=${config.strictness.gitDiscipline} review=${config.strictness.reviewRequired}`);
  } else {
    // Legacy: use explicit config fields
    if (raw.requiredFields && typeof raw.requiredFields === 'object') {
      config.requiredFields = raw.requiredFields as RemoteConfig['requiredFields'];
    }
  }

  return config;
}

/**
 * Sync config from backend.
 * Called once at server startup from index.ts.
 *
 * Precedence: Backend > Cache > Defaults
 *
 * DF-326: No longer touches CLAUDE.md — the Claude Code plugin (skills + hooks +
 * MCP tool responses) covers all rules.
 */
export async function syncConfig(): Promise<void> {
  // Try backend first
  try {
    const result = await devFlowClient.getProjectConfig();
    if (result.success && result.data) {
      activeConfig = parseRemoteConfig(result.data);
      await saveCache(activeConfig);
      console.error(`Config synced from backend (version: ${activeConfig.version})`);
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
