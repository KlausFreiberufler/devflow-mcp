/**
 * Session Context - Singleton that holds the active flow context.
 *
 * Core of the Init-Gate: no context = no tools.
 * Set via devflow_init, cleared on session end.
 */

import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { devFlowClient, type Flow, type Task } from '../api/client.js';

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
  skill?: { slug: string; name: string; description?: string } | null;
  gateBlocked?: boolean;
  retryCount?: number;
  previousFeedback?: string | null;
}

const ACTIVE_FILE = '.devflow-active';

function getActiveFilePath(): string {
  return join(process.cwd(), ACTIVE_FILE);
}

class SessionContext {
  private context: ActiveContext | null = null;

  init(ctx: ActiveContext): void {
    this.context = ctx;
    this.writeActiveFile();
  }

  release(): void {
    this.context = null;
    this.deleteActiveFile();
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
      this.writeActiveFile();

      // Delete active file when flow is done
      if (flow.currentState === 'done') {
        this.deleteActiveFile();
      }
    }
  }

  updateAllowedActions(actions: string[]): void {
    if (this.context) {
      this.context.allowedActions = actions;
    }
  }

  private writeActiveFile(): void {
    if (!this.context) return;
    try {
      const data = {
        flowId: this.context.flow.id,
        displayId: this.context.flow.displayId,
        state: this.context.flow.currentState,
        since: new Date().toISOString(),
      };
      writeFileSync(getActiveFilePath(), JSON.stringify(data, null, 2));
    } catch {
      // Non-critical: file write may fail in read-only environments
    }
  }

  private deleteActiveFile(): void {
    try {
      const filePath = getActiveFilePath();
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Non-critical
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
        // Re-fetch allowedActions from backend (sole source of truth)
        try {
          const nextStepResult = await devFlowClient.getNextStep(this.context.flow.id);
          if (nextStepResult.success && nextStepResult.data?.allowedActions) {
            this.context.allowedActions = nextStepResult.data.allowedActions as string[];
            if (nextStepResult.data.kind) {
              this.context.stepKind = nextStepResult.data.kind as string;
            }
            if (nextStepResult.data.transitionPolicy) {
              this.context.transitionPolicy = nextStepResult.data.transitionPolicy as string;
            }
          }
        } catch {
          // Network error during refresh - keep stale allowedActions
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
