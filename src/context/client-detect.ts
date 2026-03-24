// src/context/client-detect.ts

export type ClientType = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'windsurf' | 'unknown';

export function detectClientType(): ClientType {
  // Primary: DEVFLOW_CLIENT env var (set by setup command, always reliable)
  const envClient = process.env.DEVFLOW_CLIENT?.toLowerCase();
  if (envClient && isValidClientType(envClient)) {
    return envClient as ClientType;
  }

  // Secondary: auto-detection via client-specific env vars
  if (process.env.CLAUDE_CODE === '1') return 'claude-code';
  if (process.env.CURSOR_SESSION_ID) return 'cursor';
  // Add more auto-detection as client env vars are verified

  return 'unknown';
}

function isValidClientType(value: string): boolean {
  return ['claude-code', 'cursor', 'codex', 'gemini', 'windsurf'].includes(value);
}
