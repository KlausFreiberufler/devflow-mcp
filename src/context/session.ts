/**
 * Session Context - Singleton that holds the active flow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */

import { devFlowClient, type Flow, type Task } from '../api/client.js';
import { getAllowedTools } from './permissions.js';

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
  skill?: { slug: string; name: string; description?: string } | null;
  gateBlocked?: boolean;
  retryCount?: number;
  previousFeedback?: string | null;
}

class SessionContext {
  private context: ActiveContext | null = null;

  init(ctx: ActiveContext): void {
    this.context = ctx;
  }

  release(): void {
    this.context = null;
  }

  isActive(): boolean {
    return this.context !== null;
  }

  get(): ActiveContext | null {
    return this.context;
  }

  getFlowId(): string | null {
    return this.context?.flow.id ?? null;
  }

  getState(): string | null {
    return this.context?.flow.currentState ?? null;
  }

  isToolAllowed(toolName: string): boolean {
    if (!this.context) return false;
    return this.context.allowedActions.includes(toolName);
  }

  update(partial: Partial<ActiveContext>): void {
    if (this.context) {
      Object.assign(this.context, partial);
    }
  }

  updateFlow(flow: Flow): void {
    if (this.context) {
      this.context.flow = flow;
    }
  }

  updateAllowedActions(actions: string[]): void {
    if (this.context) {
      this.context.allowedActions = actions;
    }
  }

  /**
   * Refresh flow state from backend when context might be stale.
   * Called when a tool is about to be blocked - checks if the user
   * changed the state in the UI since the last check.
   * Returns true if the state changed (permissions were updated).
   */
  async refreshFromBackend(): Promise<boolean> {
    if (!this.context) return false;

    try {
      const result = await devFlowClient.getFlow(this.context.flow.id);
      if (!result.success || !result.data) return false;

      const freshState = result.data.currentState;
      const cachedState = this.context.flow.currentState;

      if (freshState !== cachedState) {
        this.context.flow = result.data;
        // Re-init session to get pipeline-aware allowedActions from backend
        try {
          const initResult = await devFlowClient.initSession(this.context.flow.id);
          if (initResult.success && initResult.data?.allowedActions) {
            this.context.allowedActions = initResult.data.allowedActions as string[];
          } else {
            this.context.allowedActions = getAllowedTools(freshState);
          }
        } catch {
          this.context.allowedActions = getAllowedTools(freshState);
        }
        return true;
      }
    } catch {
      // Network error - keep cached state
    }

    return false;
  }
}

export const sessionContext = new SessionContext();
