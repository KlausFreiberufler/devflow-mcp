import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Detect the git remote origin URL for a given directory.
 * Returns null if not a git repo or no remote configured.
 */
export async function detectGitRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      timeout: 5000,
    });
    const url = stdout.trim();
    return url || null;
  } catch {
    return null;
  }
}
