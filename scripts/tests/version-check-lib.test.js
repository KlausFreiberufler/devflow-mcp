import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  compareVersions,
  decideBanner,
  readCurrentVersion,
  readCache,
  writeCache,
  isCacheFresh,
  CACHE_TTL_MS,
  DEFAULT_CACHE_PATH,
} from '../lib/version-check.js';

test('compareVersions: equal returns 0', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
  assert.strictEqual(compareVersions('4.27.0', '4.27.0'), 0);
});

test('compareVersions: greater returns 1', () => {
  assert.strictEqual(compareVersions('4.28.0', '4.27.0'), 1);
  assert.strictEqual(compareVersions('5.0.0', '4.99.99'), 1);
  assert.strictEqual(compareVersions('1.2.4', '1.2.3'), 1);
});

test('compareVersions: lesser returns -1', () => {
  assert.strictEqual(compareVersions('4.27.0', '4.28.0'), -1);
  assert.strictEqual(compareVersions('4.26.0', '4.27.0'), -1);
});

test('compareVersions: pre-release < release', () => {
  assert.strictEqual(compareVersions('4.28.0-rc.1', '4.28.0'), -1);
  assert.strictEqual(compareVersions('4.28.0', '4.28.0-rc.1'), 1);
});

test('compareVersions: two pre-releases compare lexically', () => {
  assert.strictEqual(compareVersions('4.28.0-rc.1', '4.28.0-rc.2'), -1);
  assert.strictEqual(compareVersions('4.28.0-rc.2', '4.28.0-rc.1'), 1);
  assert.strictEqual(compareVersions('4.28.0-rc.1', '4.28.0-rc.1'), 0);
});

test('decideBanner: returns null when latest equals current', () => {
  assert.strictEqual(decideBanner({ current: '4.27.0', latest: '4.27.0' }), null);
});

test('decideBanner: returns null when latest is older (local dev)', () => {
  assert.strictEqual(decideBanner({ current: '4.28.0', latest: '4.27.0' }), null);
});

test('decideBanner: returns banner string when latest is newer', () => {
  const banner = decideBanner({ current: '4.27.0', latest: '4.28.0' });
  assert.match(banner, /4\.28\.0/);
  assert.match(banner, /4\.27\.0/);
  assert.match(banner, /restart/i);
});

test('decideBanner: returns null on missing inputs', () => {
  assert.strictEqual(decideBanner({ current: null, latest: '4.28.0' }), null);
  assert.strictEqual(decideBanner({ current: '4.27.0', latest: null }), null);
  assert.strictEqual(decideBanner({}), null);
});

test('isCacheFresh: just-written cache is fresh', () => {
  assert.strictEqual(isCacheFresh({ checkedAt: new Date().toISOString() }, CACHE_TTL_MS), true);
});

test('isCacheFresh: old cache is stale', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.strictEqual(isCacheFresh({ checkedAt: twoHoursAgo }, CACHE_TTL_MS), false);
});

test('isCacheFresh: missing checkedAt returns false', () => {
  assert.strictEqual(isCacheFresh({}, CACHE_TTL_MS), false);
  assert.strictEqual(isCacheFresh(null, CACHE_TTL_MS), false);
});

test('readCache: returns null when file does not exist', () => {
  const tmpFile = path.join(os.tmpdir(), `df-358-noexist-${Date.now()}.json`);
  assert.strictEqual(readCache(tmpFile), null);
});

test('readCache + writeCache: roundtrip', () => {
  const tmpFile = path.join(os.tmpdir(), `df-358-cache-${Date.now()}.json`);
  try {
    writeCache(tmpFile, { checkedAt: '2026-05-07T15:00:00Z', latest: '4.28.0' });
    const read = readCache(tmpFile);
    assert.deepStrictEqual(read, { checkedAt: '2026-05-07T15:00:00Z', latest: '4.28.0' });
  } finally {
    try { fs.rmSync(tmpFile); } catch {}
  }
});

test('readCache: corrupted JSON returns null silently', () => {
  const tmpFile = path.join(os.tmpdir(), `df-358-corrupt-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, '{ not valid json');
  try {
    assert.strictEqual(readCache(tmpFile), null);
  } finally {
    try { fs.rmSync(tmpFile); } catch {}
  }
});

test('writeCache: creates parent directory if absent', () => {
  const tmpDir = path.join(os.tmpdir(), `df-358-deep-${Date.now()}`, 'a', 'b');
  const tmpFile = path.join(tmpDir, 'cache.json');
  try {
    writeCache(tmpFile, { checkedAt: '2026-05-07T15:00:00Z', latest: '4.28.0' });
    assert.ok(fs.existsSync(tmpFile));
  } finally {
    try { fs.rmSync(path.join(os.tmpdir(), `df-358-deep-${Date.now().toString().slice(0, -3)}*`), { recursive: true, force: true }); } catch {}
  }
});

test('readCurrentVersion: reads version from plugin.json', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-358-plugin-'));
  fs.mkdirSync(path.join(tmpRoot, '.claude-plugin'));
  fs.writeFileSync(
    path.join(tmpRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'devflow', version: '4.27.0' })
  );
  try {
    assert.strictEqual(readCurrentVersion(tmpRoot), '4.27.0');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('readCurrentVersion: returns null on missing plugin.json', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-358-noplugin-'));
  try {
    assert.strictEqual(readCurrentVersion(tmpRoot), null);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('DEFAULT_CACHE_PATH points under ~/.cache/devflow-mcp/', () => {
  assert.match(DEFAULT_CACHE_PATH, /\.cache\/devflow-mcp\/version-check\.json$/);
});
