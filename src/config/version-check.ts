import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { MCP_VERSION } from './version.js'

const CACHE_PATH = join(homedir(), '.devflow', 'mcp-version-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface VersionCache {
  version: string
  checkedAt: string
}

interface VersionCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number)
  const l = local.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true
    if ((r[i] || 0) < (l[i] || 0)) return false
  }
  return false
}

function readCache(): VersionCache | null {
  try {
    const data = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
    if (data.version && data.checkedAt) return data as VersionCache
  } catch { /* cache missing or corrupt */ }
  return null
}

function writeCache(cache: VersionCache): void {
  try {
    mkdirSync(join(homedir(), '.devflow'), { recursive: true })
    writeFileSync(CACHE_PATH, JSON.stringify(cache))
  } catch { /* non-critical */ }
}

export async function checkForUpdate(baseUrl: string): Promise<VersionCheckResult | null> {
  try {
    // Check cache first
    const cache = readCache()
    if (cache) {
      const age = Date.now() - new Date(cache.checkedAt).getTime()
      if (age < CACHE_TTL_MS) {
        if (!isNewer(cache.version, MCP_VERSION)) return null
        return {
          updateAvailable: true,
          currentVersion: MCP_VERSION,
          latestVersion: cache.version,
        }
      }
    }

    // Fetch from backend
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${baseUrl}/api/mcp/version`, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) return null

    const json = await res.json() as { success: boolean; data?: { version: string } }
    if (!json.success || !json.data?.version) return null

    const latestVersion = json.data.version

    // Update cache
    writeCache({ version: latestVersion, checkedAt: new Date().toISOString() })

    if (!isNewer(latestVersion, MCP_VERSION)) return null

    return {
      updateAvailable: true,
      currentVersion: MCP_VERSION,
      latestVersion,
    }
  } catch {
    // Network error, timeout, etc. — silently skip
    return null
  }
}

/**
 * Download update tgz to ~/.devflow/updates/ (async, non-blocking).
 * The wrapper script will pick it up on next start.
 */
export async function downloadUpdate(baseUrl: string, version: string): Promise<boolean> {
  try {
    const updatesDir = join(homedir(), '.devflow', 'updates')
    mkdirSync(updatesDir, { recursive: true })

    const targetPath = join(updatesDir, `devflow-mcp-${version}.tgz`)

    // Skip if already downloaded
    if (existsSync(targetPath)) return true

    const url = `${baseUrl}/api/downloads/devflow-mcp-latest.tgz`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout for download
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) return false

    const buffer = await response.arrayBuffer()
    writeFileSync(targetPath, Buffer.from(buffer))
    return true
  } catch {
    // Download failed — non-critical, will retry on next init
    return false
  }
}
