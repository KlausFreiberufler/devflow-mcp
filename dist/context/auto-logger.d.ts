/**
 * Auto-Logger - Automatic tool call logging to agent sessions.
 *
 * Fires-and-forgets: logging never blocks tool responses.
 * Uses the existing agent_session_log API endpoint.
 * Includes a retry buffer for offline resilience.
 */
export interface ToolCallLog {
    toolName: string;
    args: Record<string, unknown>;
    blocked: boolean;
    blockReason?: string;
    durationMs?: number;
}
/**
 * Log a tool call to the active agent session.
 * Non-blocking: errors are buffered and retried.
 */
export declare function logToolCall(log: ToolCallLog): void;
