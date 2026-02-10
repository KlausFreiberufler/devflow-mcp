/**
 * Session Context - Singleton that holds the active workflow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */

import type { Workflow, Task } from '../api/client.js';

export interface SessionFeedback {
  type: 'plan_rejected' | 'code_rejected' | 'testing_failed';
  from?: string;
  message: string;
  at?: string;
}

export interface ActiveContext {
  workflow: Workflow;
  sessionId: string;
  startedAt: string;
  previousState?: string;
  feedback?: SessionFeedback | null;
  tasks: Task[];
  allowedActions: string[];
  nextStep: string;
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
    return this.context?.workflow.id ?? null;
  }

  getState(): string | null {
    return this.context?.workflow.currentState ?? null;
  }

  isToolAllowed(toolName: string): boolean {
    if (!this.context) return false;
    return this.context.allowedActions.includes(toolName);
  }

  updateWorkflow(workflow: Workflow): void {
    if (this.context) {
      this.context.workflow = workflow;
    }
  }

  updateAllowedActions(actions: string[]): void {
    if (this.context) {
      this.context.allowedActions = actions;
    }
  }
}

export const sessionContext = new SessionContext();
