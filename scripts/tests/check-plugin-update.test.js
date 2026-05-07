import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, '..', 'check-plugin-update.js');

let server;
let serverUrl;
let serverResponse = { version: '4.28.0' };
let serverShouldFail = false;
let requestCount = 0;

before(async () => {
  server = http.createServer((req, res) => {
    requestCount += 1;
    if (serverShouldFail) {
      res.statusCode = 500;
      res.end('error');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(serverResponse));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  serverUrl = `http://127.0.0.1:${addr.port}/`;
});

after(() => server?.close());

function fakePluginRoot(version) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-358-plugin-'));
  fs.mkdirSync(path.join(tmpRoot, '.claude-plugin'));
  fs.writeFileSync(
    path.join(tmpRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'devflow', version })
  );
  return tmpRoot;
}

function tmpCachePath() {
  return path.join(os.tmpdir(), `df-358-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function run(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], {
      env: {
        ...process.env,
        DEVFLOW_VERSION_CHECK_URL: serverUrl,
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', () => resolve(stdout));
  });
}

test('prints banner when latest > current', async () => {
  serverResponse = { version: '4.28.0' };
  serverShouldFail = false;
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    const out = await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.match(out, /4\.28\.0/);
    assert.match(out, /4\.27\.0/);
    assert.match(out, /restart/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('silent when latest === current', async () => {
  serverResponse = { version: '4.27.0' };
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    const out = await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(out, '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('silent when latest < current (local dev)', async () => {
  serverResponse = { version: '4.26.0' };
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    const out = await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(out, '');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('silent when fetch fails', async () => {
  serverShouldFail = true;
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    const out = await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(out, '');
  } finally {
    serverShouldFail = false;
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('uses cache when fresh — no second fetch', async () => {
  serverResponse = { version: '4.28.0' };
  serverShouldFail = false;
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    requestCount = 0;
    await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    const firstCount = requestCount;
    await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(requestCount, firstCount, 'second invocation should not hit registry while cache is fresh');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('refetches when cache is older than TTL', async () => {
  serverResponse = { version: '4.28.0' };
  serverShouldFail = false;
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(cache, JSON.stringify({ checkedAt: stale, latest: '4.27.0' }));
    requestCount = 0;
    await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(requestCount, 1, 'stale cache must trigger a re-fetch');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('silent when CLAUDE_PLUGIN_ROOT missing plugin.json', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-358-bad-'));
  const cache = tmpCachePath();
  try {
    const out = await run({ CLAUDE_PLUGIN_ROOT: tmpRoot, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.strictEqual(out, '');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});

test('silent when corrupt cache — recovers via re-fetch', async () => {
  serverResponse = { version: '4.28.0' };
  serverShouldFail = false;
  const root = fakePluginRoot('4.27.0');
  const cache = tmpCachePath();
  try {
    fs.writeFileSync(cache, '{ broken json');
    const out = await run({ CLAUDE_PLUGIN_ROOT: root, DEVFLOW_VERSION_CACHE_PATH: cache });
    assert.match(out, /4\.28\.0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    try { fs.rmSync(cache); } catch {}
  }
});
