/**
 * Auto-Logger - Automatic tool call logging to agent sessions.
 *
 * Fires-and-forgets: logging never blocks tool responses.
 * Uses the existing agent_session_log API endpoint.
 * Includes a retry buffer for offline resilience.
 */
import { devFlowClient } from '../api/client.js';
import { sessionContext } from './session.js';
/**
 * Summarize tool args for logging (avoid huge payloads).
 */
function summarizeArgs(args) {
    const parts = [];
    for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string') {
            const short = value.length > 60 ? value.slice(0, 57) + '...' : value;
            parts.push(`${key}: "${short}"`);
        }
        else if (typeof value === 'boolean' || typeof value === 'number') {
            parts.push(`${key}: ${value}`);
        }
        else if (Array.isArray(value)) {
            parts.push(`${key}: [${value.length} items]`);
        }
    }
    return parts.length > 0 ? `(${parts.join(', ')})` : '';
}
// Buffer for failed log entries (max 50, oldest dropped on overflow)
const pendingLogs = [];
const MAX_PENDING = 50;
let flushTimer = null;
/**
 * Try to flush pending logs to the backend.
 */
async function flushPendingLogs() {
    if (pendingLogs.length === 0)
        return;
    const toFlush = pendingLogs.splice(0, 10); // Flush in batches of 10
    for (const entry of toFlush) {
        try {
            await devFlowClient.logAgentSession(entry.sessionId, {
                message: entry.message,
                level: entry.level,
            });
        }
        catch {
            // Still failing, put back at front (will retry next time)
            pendingLogs.unshift(entry);
            return; // Stop trying, backend is still down
        }
    }
    // If more pending, schedule another flush
    if (pendingLogs.length > 0) {
        scheduleFlush();
    }
}
function scheduleFlush() {
    if (flushTimer)
        return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPendingLogs().catch(() => { });
    }, 10_000); // Retry after 10 seconds
}
/**
 * Log a tool call to the active agent session.
 * Non-blocking: errors are buffered and retried.
 */
export function logToolCall(log) {
    const ctx = sessionContext.get();
    if (!ctx || ctx.sessionId === 'local-session')
        return;
    const argSummary = summarizeArgs(log.args);
    const duration = log.durationMs ? ` (${log.durationMs}ms)` : '';
    let message;
    let level;
    if (log.blocked) {
        message = `BLOCKED: ${log.toolName}${argSummary} - ${log.blockReason || 'nicht erlaubt'}`;
        level = 'warn';
    }
    else {
        message = `${log.toolName}${argSummary} - Erfolg${duration}`;
        level = 'info';
    }
    const sessionId = ctx.sessionId;
    // Fire-and-forget with retry buffer
    devFlowClient.logAgentSession(sessionId, { message, level }).catch(() => {
        // Backend unavailable - buffer for retry
        if (pendingLogs.length >= MAX_PENDING) {
            pendingLogs.shift(); // Drop oldest
        }
        pendingLogs.push({ sessionId, message, level });
        scheduleFlush();
    });
}
