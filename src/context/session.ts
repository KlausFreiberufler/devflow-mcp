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

export interface ActiveContext {
  flow: Flow;
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
}

export const sessionContext = new SessionContext();
