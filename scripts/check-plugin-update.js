#!/usr/bin/env node
// DF-358 — Session-start hook: print a banner when a newer plugin version is on
// npm. Called from `hooks/session-start.json`. All errors are swallowed so a
// flaky network or missing cache directory never blocks the session.
//
// Env overrides for tests:
//   DEVFLOW_VERSION_CHECK_URL   — point at a mock registry
//   DEVFLOW_VERSION_CACHE_PATH  — point at an isolated cache file

import {
  CACHE_TTL_MS,
  DEFAULT_CACHE_PATH,
  DEFAULT_REGISTRY_URL,
  decideBanner,
  fetchLatestVersion,
  isCacheFresh,
  readCache,
  readCurrentVersion,
  writeCache,
} from './lib/version-check.js';

async function main() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const current = readCurrentVersion(pluginRoot);
  if (!current) return;

  const cachePath = process.env.DEVFLOW_VERSION_CACHE_PATH || DEFAULT_CACHE_PATH;
  const url = process.env.DEVFLOW_VERSION_CHECK_URL || DEFAULT_REGISTRY_URL;

  const cache = readCache(cachePath);
  let latest = null;
  if (isCacheFresh(cache, CACHE_TTL_MS)) {
    latest = cache.latest;
  } else {
    latest = await fetchLatestVersion({ url });
    if (latest) {
      writeCache(cachePath, { checkedAt: new Date().toISOString(), latest });
    }
  }

  const banner = decideBanner({ current, latest });
  if (banner) process.stdout.write(banner);
}

main().catch(() => { /* never block on errors */ });
