/**
 * Centralized working directory resolution.
 * Uses DEVFLOW_WORKING_DIR env var as override, falls back to process.cwd().
 */
export declare function getWorkingDir(): string;
