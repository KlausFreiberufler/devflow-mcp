import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { MCP_VERSION } from './version.js';
const CACHE_PATH = join(homedir(), '.devflow', 'mcp-version-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
function isNewer(remote, local) {
    const r = remote.split('.').map(Number);
    const l = local.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((r[i] || 0) > (l[i] || 0))
            return true;
        if ((r[i] || 0) < (l[i] || 0))
            return false;
    }
    return false;
}
function readCache() {
    try {
        const data = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
        if (data.version && data.checkedAt)
            return data;
    }
    catch { /* cache missing or corrupt */ }
    return null;
}
function writeCache(cache) {
    try {
        mkdirSync(join(homedir(), '.devflow'), { recursive: true });
        writeFileSync(CACHE_PATH, JSON.stringify(cache));
    }
    catch { /* non-critical */ }
}
export async function checkForUpdate(baseUrl) {
    try {
        // Check cache first
        const cache = readCache();
        if (cache) {
            const age = Date.now() - new Date(cache.checkedAt).getTime();
            if (age < CACHE_TTL_MS) {
                if (!isNewer(cache.version, MCP_VERSION))
                    return null;
                return {
                    updateAvailable: true,
                    currentVersion: MCP_VERSION,
                    latestVersion: cache.version,
                };
            }
        }
        // Fetch from backend
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${baseUrl}/api/mcp/version`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok)
            return null;
        const json = await res.json();
        if (!json.success || !json.data?.version)
            return null;
        const latestVersion = json.data.version;
        // Update cache
        writeCache({ version: latestVersion, checkedAt: new Date().toISOString() });
        if (!isNewer(latestVersion, MCP_VERSION))
            return null;
        return {
            updateAvailable: true,
            currentVersion: MCP_VERSION,
            latestVersion,
        };
    }
    catch {
        // Network error, timeout, etc. — silently skip
        return null;
    }
}
// DF-216: downloadUpdate() removed. The MCP server is installed and updated
// via the Claude Code plugin (`/plugin install devflow`) or `npx github:...setup`
// in other clients — there is no backend-side tarball to fetch anymore.
