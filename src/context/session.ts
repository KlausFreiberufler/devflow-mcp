/**
 * Session Context - Singleton that holds the active flow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */

import type { Flow, Task } from '../api/client.js';

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
  leaseId?: string;
  leaseToken?: string;
  git?: GitContext;
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

  getLeaseId(): string | null {
    return this.context?.leaseId ?? null;
  }

  getLeaseToken(): string | null {
    return this.context?.leaseToken ?? null;
  }
}

export const sessionContext = new SessionContext();
