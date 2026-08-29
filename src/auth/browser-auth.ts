/**
 * Browser-based Authentication for MCP Server
 *
 * Opens browser for user to log in, receives token via callback
 */

import { createServer } from 'http';
import { exec } from 'child_process';
import { writeFile, readFile, mkdir, chmod, stat, unlink } from 'fs/promises';
import { homedir } from 'os';
import { getWorkingDir } from '../utils/working-dir.js';
import { join } from 'path';
interface AuthResult {
  token: string;
  projectId?: string;
  projectName?: string;
  /** DF-543 — the server's real expiry for this token (ISO). Older backends omit it. */
  tokenExpiresAt?: string | null;
}

interface ProjectConfig {
  projectId: string;
  projectName: string;
  linkedAt: string;
}

const CREDENTIALS_PATH = join(homedir(), '.devflow', 'credentials.json');

/**
 * Find an available port
 */
async function findAvailablePort(startPort: number = 9876): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}

/**
 * Open URL in default browser
 */
function openBrowser(url: string): void {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.error('Failed to open browser:', error.message);
      console.error('Please open this URL manually:', url);
    }
  });
}

/**
 * Poll for token after user authorizes
 */
async function pollForToken(
  baseUrl: string,
  code: string,
  maxAttempts: number = 150,
  intervalMs: number = 2000
): Promise<AuthResult | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/cli/token?code=${code}`);
      const data = await response.json();

      if (data.success && data.data) {
        if (data.data.status === 'authorized' && data.data.token) {
          return {
            token: data.data.token,
            projectId: data.data.projectId,
            projectName: data.data.projectName,
            tokenExpiresAt: data.data.tokenExpiresAt ?? null
          };
        }
        // Still pending, continue polling
      }
    } catch (error) {
      // Network error, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return null;
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
export const DEFAULT_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

export type StoredTokenAction =
  /** The server accepted it. */
  | 'use'
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
export function decideStoredTokenAction(
  probe: { ok: boolean; status: number | null } | null | undefined
): StoredTokenAction {
  if (!probe) return 'keep-despite-error';
  if (probe.ok) return 'use';
  if (probe.status === 401 || probe.status === 403) return 'discard-and-relogin';
  return 'keep-despite-error';
}

/**
 * Save credentials to file.
 *
 * DF-543: `expiresAtIso` is the real expiry the server reports when handing
 * out the token. Without it we assume the server's own 90-day cap rather than
 * inventing a year.
 */
async function saveCredentials(token: string, expiresAtIso?: string | null): Promise<void> {
  const dir = join(homedir(), '.devflow');
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const parsed = expiresAtIso ? Date.parse(expiresAtIso) : NaN;
  const expiresAt = Number.isFinite(parsed)
    ? parsed
    : Date.now() + DEFAULT_TOKEN_LIFETIME_MS;

  const credentials = {
    accessToken: token,
    refreshToken: '',
    expiresAt
  };

  await writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  await chmod(CREDENTIALS_PATH, 0o600);
}

/**
 * Save project configuration to working directory
 */
export async function saveProjectConfig(workingDir: string, projectId: string, projectName: string): Promise<void> {
  const configPath = join(workingDir, '.devflow.json');
  const config: ProjectConfig = {
    projectId,
    projectName,
    linkedAt: new Date().toISOString()
  };

  await writeFile(configPath, JSON.stringify(config, null, 2));
  console.error(`Project linked: ${projectName} (${projectId})`);
  console.error(`Config saved to: ${configPath}`);
}

/**
 * Load project configuration from working directory
 */
export async function loadProjectConfig(workingDir?: string): Promise<ProjectConfig | null> {
  const dir = workingDir || getWorkingDir();
  const configPath = join(dir, '.devflow.json');

  try {
    const data = await readFile(configPath, 'utf-8');
    return JSON.parse(data) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Load credentials from file
 */
export async function loadCredentials(): Promise<string | null> {
  try {
    const data = await readFile(CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(data);

    // Migrate world-readable creds to 0o600 — runs unconditionally so
    // expired-but-still-on-disk tokens don't sit at 0644 forever.
    try {
      const info = await stat(CREDENTIALS_PATH);
      if ((info.mode & 0o077) !== 0) {
        await chmod(CREDENTIALS_PATH, 0o600);
      }
    } catch {
      // chmod failures are non-fatal
    }

    if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
      return null; // Expired
    }

    return credentials.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * DF-543 — drop the stored credentials so the next getToken falls through to
 * the browser login. Missing file is success, not an error.
 */
export async function clearCredentials(): Promise<void> {
  try {
    await unlink(CREDENTIALS_PATH);
  } catch {
    // Already gone, or unreadable — either way there is nothing to keep.
  }
}

/**
 * DF-543 — ask the server whether a stored token is still good.
 *
 * `/api/projects` is reachable for both the `api` and the `mcp` token scope
 * (DF-459 made the bare path match), so this works whichever kind is on disk.
 * A thrown fetch means "no answer", which is deliberately not a refusal.
 */
async function probeStoredToken(
  baseUrl: string,
  token: string
): Promise<{ ok: boolean; status: number | null }> {
  try {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * Perform browser-based authentication
 *
 * 1. Request auth code from server
 * 2. Open browser to auth URL
 * 3. Poll for token
 * 4. Save credentials and project config
 */
export async function authenticateViaBrowser(baseUrl: string, workingDir?: string): Promise<string> {
  console.error('Starting browser authentication...');

  // Find available port for callback
  const port = await findAvailablePort();
  const dir = workingDir || getWorkingDir();

  // Request auth code from server
  const requestResponse = await fetch(`${baseUrl}/api/auth/cli/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPort: port, workingDir: dir })
  });

  const requestData = await requestResponse.json();

  if (!requestData.success || !requestData.data) {
    throw new Error(`Failed to request auth: ${requestData.error || 'Unknown error'}`);
  }

  const { code, authUrl } = requestData.data;

  console.error('Opening browser for authentication...');
  console.error(`If browser doesn't open, visit: ${authUrl}`);

  // Open browser
  openBrowser(authUrl);

  // Poll for token
  console.error('Waiting for authorization...');
  const result = await pollForToken(baseUrl, code);

  if (!result) {
    throw new Error('Authentication timed out. Please try again.');
  }

  // Save credentials — with the server's own expiry (DF-543), not a guess.
  await saveCredentials(result.token, result.tokenExpiresAt);

  // Save project configuration if project was selected
  // DF-326: No longer writes CLAUDE.md — the plugin covers rules.
  if (result.projectId && result.projectName) {
    await saveProjectConfig(dir, result.projectId, result.projectName);
  }

  console.error('Authentication successful! Token saved.');
  return result.token;
}

/**
 * Get token - from env, file, or browser auth
 */
export async function getToken(baseUrl: string, workingDir?: string): Promise<string> {
  // 1. Check environment variable. Explicitly supplied by the user, so we
  // neither probe nor discard it — that is their call, not ours.
  const envToken = process.env.DEVFLOW_TOKEN;
  if (envToken) {
    return envToken;
  }

  // 2. Check saved credentials — and verify them.
  // DF-543: a stored token used to be handed back unchecked, so an expired or
  // revoked one made every later call fail with 401 while the browser login
  // was never offered. The file's own expiry cannot be trusted: it is written
  // by this client, not by the server.
  const savedToken = await loadCredentials();
  if (savedToken) {
    const action = decideStoredTokenAction(await probeStoredToken(baseUrl, savedToken));

    if (action === 'use') {
      return savedToken;
    }

    if (action === 'keep-despite-error') {
      // Server unreachable or erroring. Keep going with what we have rather
      // than demanding a browser login during an outage.
      console.error('Could not verify saved credentials — continuing with them.');
      return savedToken;
    }

    console.error('Saved credentials were rejected by the server — signing in again.');
    await clearCredentials();
  }

  // 3. Perform browser authentication
  return authenticateViaBrowser(baseUrl, workingDir);
}
