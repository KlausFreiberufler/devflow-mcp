/**
 * Detect the git remote origin URL for a given directory.
 * Returns null if not a git repo or no remote configured.
 */
export declare function detectGitRemoteUrl(cwd: string): Promise<string | null>;
