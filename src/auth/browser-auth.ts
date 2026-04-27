/**
 * Browser-based Authentication for MCP Server
 *
 * Opens browser for user to log in, receives token via callback
 */

import { createServer } from 'http';
import { exec } from 'child_process';
import { writeFile, readFile, mkdir, chmod, stat } from 'fs/promises';
import { homedir } from 'os';
import { getWorkingDir } from '../utils/working-dir.js';
import { join } from 'path';
import { setupClaudeMd, fetchProjectTechStack } from '../setup/claude-md-generator.js';

interface AuthResult {
  token: string;
  projectId?: string;
  projectName?: string;
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
            projectName: data.data.projectName
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
 * Save credentials to file
 */
async function saveCredentials(token: string): Promise<void> {
  const dir = join(homedir(), '.devflow');
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const credentials = {
    accessToken: token,
    refreshToken: '',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
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

  // Save credentials
  await saveCredentials(result.token);

  // Save project configuration if project was selected
  if (result.projectId && result.projectName) {
    await saveProjectConfig(dir, result.projectId, result.projectName);

    // Setup CLAUDE.md with flow rules
    try {
      const techStack = await fetchProjectTechStack(baseUrl, result.token, result.projectId);
      await setupClaudeMd(dir, result.projectName, techStack);
    } catch (error) {
      console.error('Warning: Could not setup CLAUDE.md:', error instanceof Error ? error.message : error);
    }
  }

  console.error('Authentication successful! Token saved.');
  return result.token;
}

/**
 * Get token - from env, file, or browser auth
 */
export async function getToken(baseUrl: string, workingDir?: string): Promise<string> {
  // 1. Check environment variable
  const envToken = process.env.DEVFLOW_TOKEN;
  if (envToken) {
    return envToken;
  }

  // 2. Check saved credentials
  const savedToken = await loadCredentials();
  if (savedToken) {
    return savedToken;
  }

  // 3. Perform browser authentication
  return authenticateViaBrowser(baseUrl, workingDir);
}
