/**
 * Session Context - Singleton that holds the active flow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { devFlowClient } from '../api/client.js';
const ACTIVE_FILE = '.devflow-active';
function getActiveFilePath() {
    return join(process.cwd(), ACTIVE_FILE);
}
class SessionContext {
    context = null;
    init(ctx) {
        this.context = ctx;
        this.writeActiveFile();
    }
    release() {
        this.context = null;
        this.deleteActiveFile();
    }
    isActive() {
        return this.context !== null;
    }
    get() {
        return this.context;
    }
    getFlowId() {
        return this.context?.flow.id ?? null;
    }
    getState() {
        return this.context?.flow.currentState ?? null;
    }
    isToolAllowed(toolName) {
        if (!this.context)
            return false;
        return this.context.allowedActions.includes(toolName);
    }
    update(partial) {
        if (this.context) {
            Object.assign(this.context, partial);
        }
    }
    updateFlow(flow) {
        if (this.context) {
            this.context.flow = flow;
            this.writeActiveFile();
            // Delete active file when flow is done
            if (flow.currentState === 'done') {
                this.deleteActiveFile();
            }
        }
    }
    updateAllowedActions(actions) {
        if (this.context) {
            this.context.allowedActions = actions;
        }
    }
    writeActiveFile() {
        if (!this.context)
            return;
        try {
            const data = {
                flowId: this.context.flow.id,
                displayId: this.context.flow.displayId,
                state: this.context.flow.currentState,
                since: new Date().toISOString(),
            };
            writeFileSync(getActiveFilePath(), JSON.stringify(data, null, 2));
        }
        catch {
            // Non-critical: file write may fail in read-only environments
        }
    }
    deleteActiveFile() {
        try {
            const filePath = getActiveFilePath();
            if (existsSync(filePath)) {
                unlinkSync(filePath);
            }
        }
        catch {
            // Non-critical
        }
    }
    /**
     * Refresh flow state from backend when context might be stale.
     * Called when a tool is about to be blocked - checks if the user
     * changed the state in the UI since the last check.
     * Returns true if the state changed (permissions were updated).
     */
    async refreshFromBackend() {
        if (!this.context)
            return false;
        try {
            const result = await devFlowClient.getFlow(this.context.flow.id);
            if (!result.success || !result.data)
                return false;
            const freshState = result.data.currentState;
            const cachedState = this.context.flow.currentState;
            if (freshState !== cachedState) {
                this.context.flow = result.data;
                // Re-fetch allowedActions from backend (sole source of truth)
                try {
                    const nextStepResult = await devFlowClient.getNextStep(this.context.flow.id);
                    if (nextStepResult.success && nextStepResult.data?.allowedActions) {
                        this.context.allowedActions = nextStepResult.data.allowedActions;
                        if (nextStepResult.data.kind) {
                            this.context.stepKind = nextStepResult.data.kind;
                        }
                        if (nextStepResult.data.transitionPolicy) {
                            this.context.transitionPolicy = nextStepResult.data.transitionPolicy;
                        }
                    }
                }
                catch {
                    // Network error during refresh - keep stale allowedActions
                }
                return true;
            }
        }
        catch {
            // Network error - keep cached state
        }
        return false;
    }
}
export const sessionContext = new SessionContext();
