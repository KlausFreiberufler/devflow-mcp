/**
 * Auto-Logger - Automatic tool call logging to agent sessions.
 *
 * Fires-and-forgets: logging never blocks tool responses.
 * Uses the existing agent_session_log API endpoint.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext } from './session.js';

/**
 * Summarize tool args for logging (avoid huge payloads).
 */
function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const short = value.length > 60 ? value.slice(0, 57) + '...' : value;
      parts.push(`${key}: "${short}"`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      parts.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      parts.push(`${key}: [${value.length} items]`);
    }
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

export interface ToolCallLog {
  toolName: string;
  args: Record<string, unknown>;
  blocked: boolean;
  blockReason?: string;
  durationMs?: number;
}

/**
 * Log a tool call to the active agent session.
 * Non-blocking: errors are silently ignored.
 */
export function logToolCall(log: ToolCallLog): void {
  const ctx = sessionContext.get();
  if (!ctx || ctx.sessionId === 'local-session') return;

  const argSummary = summarizeArgs(log.args);
  const duration = log.durationMs ? ` (${log.durationMs}ms)` : '';

  let message: string;
  let level: string;

  if (log.blocked) {
    message = `BLOCKED: ${log.toolName}${argSummary} - ${log.blockReason || 'nicht erlaubt'}`;
    level = 'warn';
  } else {
    message = `${log.toolName}${argSummary} - Erfolg${duration}`;
    level = 'info';
  }

  // Fire-and-forget
  devFlowClient.logAgentSession(ctx.sessionId, { message, level }).catch(() => {});
}
