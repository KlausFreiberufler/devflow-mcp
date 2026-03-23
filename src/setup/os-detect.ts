import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';

export type OsType = 'macos' | 'windows' | 'linux';

export function detectOs(): OsType {
  const p = platform();
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return 'linux';
}

export function resolveNodePath(): string {
  const os = detectOs();

  try {
    const cmd = os === 'windows' ? 'where node' : 'which node';
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    // 'where' on Windows can return multiple lines — take first
    return result.split('\n')[0].trim();
  } catch {
    // Fallback: check common locations
    const fallbacks = os === 'macos'
      ? ['/opt/homebrew/bin/node', '/usr/local/bin/node']
      : os === 'linux'
        ? ['/usr/local/bin/node', '/usr/bin/node']
        : ['C:\\Program Files\\nodejs\\node.exe'];

    for (const candidate of fallbacks) {
      if (existsSync(candidate)) return candidate;
    }

    throw new Error(
      'Could not find node binary. Please install Node.js first.\n' +
      'Download: https://nodejs.org/'
    );
  }
}
