// DF-358 — Pure-function lib backing the session-start plugin update check.
//
// All side-effects (fs reads/writes) are funneled through these helpers so
// the entry script (`scripts/check-plugin-update.js`) stays a thin shell and
// the behavior is unit-testable via plain inputs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export const DEFAULT_CACHE_PATH = path.join(
  os.homedir(),
  '.cache',
  'devflow-mcp',
  'version-check.json'
);

const PLUGIN_NAME = '@dev-flow-tech/mcp-server';
export const DEFAULT_REGISTRY_URL = `https://registry.npmjs.org/${PLUGIN_NAME}/latest`;

/**
 * compareVersions — minimal semver compare.
 * Handles MAJOR.MINOR.PATCH plus an optional `-pre` suffix.
 *
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 * Per semver §11: a pre-release version sorts lower than the matching release.
 */
export function compareVersions(a, b) {
  if (a === b) return 0;
  const [aBase, aPre] = String(a).split('-', 2);
  const [bBase, bPre] = String(b).split('-', 2);
  const aParts = aBase.split('.').map(n => parseInt(n, 10));
  const bParts = bBase.split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const an = aParts[i] || 0;
    const bn = bParts[i] || 0;
    if (an > bn) return 1;
    if (an < bn) return -1;
  }
  // Bases equal — compare pre-release suffix
  if (!aPre && !bPre) return 0;
  if (!aPre && bPre) return 1; // release > pre-release
  if (aPre && !bPre) return -1;
  if (aPre < bPre) return -1;
  if (aPre > bPre) return 1;
  return 0;
}

/**
 * decideBanner — given current and latest version, returns the user-facing
 * banner string when an update is available, otherwise null.
 *
 * Returns null when:
 *   - inputs are missing
 *   - latest is equal to or older than current (local dev version)
 */
export function decideBanner({ current, latest } = {}) {
  if (!current || !latest) return null;
  if (compareVersions(latest, current) !== 1) return null;
  return `⬆️  DevFlow plugin v${latest} available (current: v${current}) — restart Claude Code to update.\n`;
}

/**
 * isCacheFresh — true when the cache entry was checked within `ttlMs`.
 */
export function isCacheFresh(cache, ttlMs = CACHE_TTL_MS) {
  if (!cache || !cache.checkedAt) return false;
  const checked = Date.parse(cache.checkedAt);
  if (Number.isNaN(checked)) return false;
  return Date.now() - checked < ttlMs;
}

/**
 * readCurrentVersion — extracts the version string from
 * `${pluginRoot}/.claude-plugin/plugin.json`. Returns null on any read error.
 */
export function readCurrentVersion(pluginRoot) {
  if (!pluginRoot) return null;
  try {
    const file = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

/**
 * readCache — returns the parsed cache file or null on missing/corrupt.
 */
export function readCache(cachePath = DEFAULT_CACHE_PATH) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf8');
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object') return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * writeCache — writes `{checkedAt, latest}` to disk. Creates parent dirs.
 * Errors are swallowed (cache is best-effort).
 */
export function writeCache(cachePath, data) {
  try {
    const dir = path.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch {
    // best-effort
  }
}

/**
 * fetchLatestVersion — single GET against the npm registry with a timeout.
 * Returns the latest version string on success, null on any error.
 *
 * `url` allows tests to point at a local mock server.
 */
export async function fetchLatestVersion({ url = DEFAULT_REGISTRY_URL, timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}
