/**
 * Auto-Status - Derives agentStatus from tool calls.
 *
 * The agent no longer needs to manually set agentStatus/agentMessage.
 * The server infers the status from which tools are called.
 */
interface DerivedStatus {
    agentStatus: string;
    agentMessage: string;
}
/**
 * Derive agentStatus from a successful tool call.
 * Returns null if no status change is needed.
 */
export declare function deriveStatus(toolName: string, args: Record<string, unknown>): DerivedStatus | null;
/**
 * Apply derived status to the backend.
 * Non-blocking: errors are silently ignored.
 */
export declare function applyDerivedStatus(toolName: string, args: Record<string, unknown>): void;
export {};
