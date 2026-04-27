/**
 * Centralized working directory resolution.
 * Uses DEVFLOW_WORKING_DIR env var as override, falls back to process.cwd().
 */
export function getWorkingDir() {
    return process.env.DEVFLOW_WORKING_DIR || process.cwd();
}
