// DF-434 — shared auth-token resolver for the API-calling pre-tool-use hooks.
//
// The MCP server writes a fresh access-token to ~/.devflow/credentials.json on
// login / reconnect. `.devflow-active` deliberately does NOT carry the token —
// never persist a secret into a repo-local file that could be committed. So the
// hooks read the token from the user's home config instead.
//
// Returns null when no token can be found; callers must treat that as "no-op"
// (fail-safe: a hook must never block a tool call on a missing token).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function readDevflowToken() {
  // Explicit env override first (CI / scripted runs).
  if (process.env.DEVFLOW_API_TOKEN) return process.env.DEVFLOW_API_TOKEN;
  if (process.env.DEVFLOW_TOKEN) return process.env.DEVFLOW_TOKEN;
  // Then the MCP's home credential store (credentials.json is the one the
  // reconnect/login flow refreshes; .live.json is an older fallback).
  for (const name of ['credentials.json', 'credentials.live.json']) {
    try {
      const p = path.join(os.homedir(), '.devflow', name);
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed && typeof parsed.accessToken === 'string' && parsed.accessToken) {
        return parsed.accessToken;
      }
    } catch {
      // ignore malformed file, try next candidate
    }
  }
  return null;
}
