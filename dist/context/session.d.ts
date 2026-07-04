/**
 * Session Context - Singleton that holds the active flow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */
import { type Flow, type Task } from '../api/client.js';
export interface SessionFeedback {
    type: 'plan_rejected' | 'code_rejected' | 'testing_failed';
    from?: string;
    message: string;
    at?: string;
}
export interface GitContext {
    enabled: boolean;
    defaultBranch: string;
    flowBranchPrompt?: string;
    releaseBranchPrompt?: string;
    commitMessagePrompt?: string;
    prTemplatePrompt?: string;
    autoPrOnFlowDone: boolean;
    autoPrOnRelease: boolean;
    autoAssignToActiveRelease: boolean;
    flowBranchName?: string;
    flowBranchCreated: boolean;
    releaseBranchName?: string;
    releaseBranchCreated: boolean;
}
export interface ActiveContext {
    flow: Flow;
    sessionId: string;
    startedAt: string;
    previousState?: string;
    feedback?: SessionFeedback | null;
    tasks: Task[];
    allowedActions: string[];
    nextStep: string;
    git?: GitContext;
    pipelineStep?: string | null;
    stepKind?: string | null;
    transitionPolicy?: string | null;
    skill?: {
        slug: string;
        name: string;
        description?: string;
    } | null;
    gateBlocked?: boolean;
    retryCount?: number;
    previousFeedback?: string | null;
}
declare class SessionContext {
    private context;
    init(ctx: ActiveContext): void;
    release(): void;
    isActive(): boolean;
    get(): ActiveContext | null;
    getFlowId(): string | null;
    getState(): string | null;
    isToolAllowed(toolName: string): boolean;
    update(partial: Partial<ActiveContext>): void;
    updateFlow(flow: Flow): void;
    updateAllowedActions(actions: string[]): void;
    private writeActiveFile;
    private deleteActiveFile;
    /**
     * Refresh flow state from backend when context might be stale.
     * Called when a tool is about to be blocked - checks if the user
     * changed the state OR the permissions in the UI since the last check.
     *
     * DF-437 — the allowedActions refetch runs UNCONDITIONALLY, not only on a
     * state change: a mid-session Self-Approval-toggle flips allowedActions /
     * transitionPolicy without moving the flow state, and the old guard kept
     * blocking flow_update client-side before the backend was ever asked.
     *
     * Returns true if the state or the allowedActions changed.
     */
    refreshFromBackend(): Promise<boolean>;
}
export declare const sessionContext: SessionContext;
export {};
