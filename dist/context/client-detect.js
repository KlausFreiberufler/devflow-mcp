// src/context/client-detect.ts
export function detectClientType() {
    // Primary: DEVFLOW_CLIENT env var (set by setup command, always reliable)
    const envClient = process.env.DEVFLOW_CLIENT?.toLowerCase();
    if (envClient) {
        const normalized = normalizeClientType(envClient);
        if (normalized)
            return normalized;
    }
    // Secondary: auto-detection via client-specific env vars
    if (process.env.CLAUDE_CODE === '1')
        return 'claude-code';
    if (process.env.CURSOR_SESSION_ID)
        return 'cursor';
    // Add more auto-detection as client env vars are verified
    return 'unknown';
}
// Maps env var values to canonical client types
const CLIENT_ALIASES = {
    'claude': 'claude-code',
};
function normalizeClientType(value) {
    if (['claude-code', 'cursor', 'codex', 'gemini', 'windsurf', 'droid'].includes(value)) {
        return value;
    }
    return CLIENT_ALIASES[value] || null;
}
