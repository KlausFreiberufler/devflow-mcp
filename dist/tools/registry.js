/**
 * Tool Registry with Guard Middleware
 *
 * All tool calls pass through guards and post-processing:
 * 1. Context-Guard: blocks tools without active devflow_init session
 * 2. State-Guard: blocks tools not allowed in the current flow state
 * 3. Auto-Logger: logs every tool call to the agent session
 * 4. Auto-Status: derives agentStatus from tool calls
 */
import { sessionContext } from '../context/session.js';
import { devFlowClient } from '../api/client.js';
import { DISCOVERY_TOOLS, buildNoContextMessage, buildStateBlockMessage, } from '../context/permissions.js';
import { logToolCall } from '../context/auto-logger.js';
import { applyDerivedStatus } from '../context/auto-status.js';
class ToolRegistry {
    tools = new Map();
    register(module) {
        for (const [name, registration] of Object.entries(module)) {
            if (this.tools.has(name)) {
                throw new Error(`Duplicate tool registration: ${name}`);
            }
            this.tools.set(name, registration);
        }
    }
    listTools() {
        return Array.from(this.tools.values()).map(t => t.definition);
    }
    /**
     * Dispatch a tool call with Context-Guard, State-Guard, Auto-Logging, and Auto-Status.
     */
    async handle(name, args) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
        }
        // Guard 1: Context-Guard - discovery tools bypass
        if (!DISCOVERY_TOOLS.has(name)) {
            if (!sessionContext.isActive()) {
                logToolCall({ toolName: name, args, blocked: true, blockReason: 'Kein aktiver Context' });
                return buildNoContextMessage(name);
            }
            // Guard 2: State-Guard — backend allowedActions is the sole source of truth
            const ctx = sessionContext.get();
            if (!ctx || !ctx.allowedActions) {
                logToolCall({ toolName: name, args, blocked: true, blockReason: 'No allowedActions — call devflow_init first' });
                return buildNoContextMessage(name);
            }
            if (!ctx.allowedActions.includes(name)) {
                // Context might be stale if user changed state in UI — refresh before blocking
                const stateChanged = await sessionContext.refreshFromBackend();
                if (stateChanged && sessionContext.isToolAllowed(name)) {
                    // State changed and tool is now allowed — proceed
                }
                else {
                    const freshCtx = sessionContext.get();
                    const reason = freshCtx.pipelineStep
                        ? `Pipeline step '${freshCtx.pipelineStep}'`
                        : `State '${freshCtx.flow.currentState}'`;
                    logToolCall({ toolName: name, args, blocked: true, blockReason: reason });
                    return buildStateBlockMessage(name, freshCtx.flow.summary, freshCtx.flow.id, freshCtx.flow.currentState, freshCtx.allowedActions);
                }
            }
        }
        // Execute tool
        const start = Date.now();
        const result = await tool.handler(args);
        const durationMs = Date.now() - start;
        // Auto-Log (fire-and-forget)
        logToolCall({ toolName: name, args, blocked: false, durationMs });
        // Auto-Status (fire-and-forget, skip devflow_init - it sets its own status)
        if (name !== 'devflow_init') {
            applyDerivedStatus(name, args);
        }
        // Auto-Activity: update last_activity_at on every tool call
        if (name !== 'devflow_init' && sessionContext.isActive()) {
            const ctx = sessionContext.get();
            if (ctx?.sessionId) {
                devFlowClient.touchSessionActivity(ctx.sessionId).catch(() => { });
            }
        }
        return result;
    }
    has(name) {
        return this.tools.has(name);
    }
    get size() {
        return this.tools.size;
    }
}
export const registry = new ToolRegistry();
