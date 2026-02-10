# Phase 2: Auto-Logging, Auto-Status & Remote-Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every tool call is automatically logged and derives agent status. Config is synced from the DevFlow backend at startup.

**Architecture:** Three middleware layers added to the registry dispatch: (1) Auto-Logger fires-and-forgets a log entry to the agent session after every tool call, (2) Auto-Status derives agentStatus from tool name + args and updates the workflow, (3) Remote Config loaded at startup replaces hardcoded state-permissions with backend-provided config.

**Tech Stack:** TypeScript, MCP SDK, Node.js ESM, DevFlow REST API

**Phase 1 (already done):** devflow_init, Context-Guard, State-Guard, Flow-Locking, Slim CLAUDE.md

---

## Task 1: Auto-Logger Module

**Files:**
- Create: `src/context/auto-logger.ts`

**Step 1: Create the auto-logger module**

```typescript
// src/context/auto-logger.ts
/**
 * Auto-Logger - Fires-and-forgets log entries to the agent session.
 *
 * Called by the registry after every tool dispatch (success, error, or blocked).
 * Non-blocking: errors are silently caught to never affect tool responses.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext } from './session.js';

export type LogOutcome = 'success' | 'blocked' | 'error';

/**
 * Log a tool call to the active agent session.
 * Fire-and-forget: never throws, never blocks.
 */
export function autoLog(
  toolName: string,
  args: Record<string, unknown>,
  outcome: LogOutcome,
  detail?: string,
): void {
  const ctx = sessionContext.get();
  if (!ctx || ctx.sessionId === 'local-session') return;

  const argSummary = summarizeArgs(args);
  const level = outcome === 'error' ? 'error' : outcome === 'blocked' ? 'warn' : 'info';
  const message = `[${outcome}] ${toolName}(${argSummary})${detail ? ' - ' + truncate(detail, 200) : ''}`;

  devFlowClient.logAgentSession(ctx.sessionId, { message, level }).catch(() => {});
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return '';

  const parts: string[] = [];
  for (const key of keys) {
    const val = args[key];
    if (typeof val === 'string' && val.length > 50) {
      parts.push(`${key}: "${val.slice(0, 47)}..."`);
    } else if (typeof val === 'string') {
      parts.push(`${key}: "${val}"`);
    } else if (Array.isArray(val)) {
      parts.push(`${key}: [${val.length} items]`);
    } else if (val !== undefined && val !== null) {
      parts.push(`${key}: ${String(val)}`);
    }
  }
  return parts.join(', ');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/context/auto-logger.ts
git commit -m "feat: add auto-logger module for fire-and-forget session logging"
```

---

## Task 2: Auto-Status Derivation Module

**Files:**
- Create: `src/context/auto-status.ts`

**Step 1: Create the auto-status module**

The design document specifies these mappings:

| Tool-Call | Derived agentStatus | agentMessage |
|---|---|---|
| `devflow_init` | `analyzing` | (handled by init itself) |
| `flow_update(implementationPlan)` | `planning` | "Plan wird erstellt" |
| `task_create` | `planning` | "Tasks werden erstellt" |
| `task_update(isCompleted: true)` | `implementing` | "Implementierung laeuft" |
| `flow_update(→ code_review)` | `idle` | "Code-Review eingereicht" |
| `flow_update(→ plan_review)` | `idle` | "Plan zur Review eingereicht" |
| `flow_get_feedback` | `reviewing` | "Feedback wird analysiert" |
| Blocked call | unchanged | unchanged |

```typescript
// src/context/auto-status.ts
/**
 * Auto-Status - Derives agentStatus from tool calls.
 *
 * After each successful tool call, determines if agentStatus should change
 * and updates the workflow. Non-blocking, fire-and-forget.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext } from './session.js';

interface StatusUpdate {
  agentStatus: string;
  agentMessage: string;
}

/**
 * Derive agent status from a tool call and update the workflow.
 * Fire-and-forget: never throws, never blocks.
 */
export function autoStatus(
  toolName: string,
  args: Record<string, unknown>,
): void {
  const ctx = sessionContext.get();
  if (!ctx) return;

  const update = deriveStatus(toolName, args);
  if (!update) return;

  // Skip if status hasn't changed
  if (ctx.workflow.agentStatus === update.agentStatus) return;

  const flowId = ctx.workflow.id;
  devFlowClient.updateWorkflow(flowId, {
    agentStatus: update.agentStatus,
    agentMessage: update.agentMessage,
  }).catch(() => {});
}

function deriveStatus(
  toolName: string,
  args: Record<string, unknown>,
): StatusUpdate | null {
  // flow_update with state transition to review → idle
  if (toolName === 'flow_update') {
    const targetState = args.currentState as string | undefined;
    if (targetState === 'plan_review' || targetState === 'code_review') {
      return { agentStatus: 'idle', agentMessage: targetState === 'plan_review' ? 'Plan zur Review eingereicht' : 'Code-Review eingereicht' };
    }

    // flow_update with implementationPlan → planning
    if (args.implementationPlan) {
      return { agentStatus: 'planning', agentMessage: 'Plan wird erstellt' };
    }

    // flow_update with agentSummary → testing (wrapping up)
    if (args.agentSummary) {
      return { agentStatus: 'testing', agentMessage: 'Implementierung abgeschlossen' };
    }

    return null;
  }

  // task_create → planning
  if (toolName === 'task_create') {
    return { agentStatus: 'planning', agentMessage: 'Tasks werden erstellt' };
  }

  // task_update with isCompleted → implementing
  if (toolName === 'task_update' && args.isCompleted === true) {
    return { agentStatus: 'implementing', agentMessage: 'Implementierung laeuft' };
  }

  // flow_get_feedback → reviewing
  if (toolName === 'flow_get_feedback') {
    return { agentStatus: 'reviewing', agentMessage: 'Feedback wird analysiert' };
  }

  // knowledge_update → implementing (documenting)
  if (toolName === 'project_knowledge_update') {
    return { agentStatus: 'implementing', agentMessage: 'Dokumentation wird aktualisiert' };
  }

  return null;
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/context/auto-status.ts
git commit -m "feat: add auto-status derivation module"
```

---

## Task 3: Integrate Auto-Logger + Auto-Status into Registry

**Files:**
- Modify: `src/tools/registry.ts`

**Step 1: Add imports and post-processing to handle()**

The registry's `handle()` method is the single dispatch point for all tool calls. We add auto-logging and auto-status calls after every dispatch (success or blocked). These are fire-and-forget and never affect the tool response.

Replace the entire `handle()` method in `src/tools/registry.ts`:

```typescript
// Add imports at top of file:
import { autoLog, type LogOutcome } from '../context/auto-logger.js';
import { autoStatus } from '../context/auto-status.js';

// Replace the handle() method:

  /**
   * Dispatch a tool call with Context-Guard, State-Guard, Auto-Logging, and Auto-Status.
   */
  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Guard 1: Context-Guard - discovery tools bypass
    if (!DISCOVERY_TOOLS.has(name)) {
      if (!sessionContext.isActive()) {
        const msg = buildNoContextMessage(name);
        autoLog(name, args, 'blocked', 'no context');
        return msg;
      }

      // Guard 2: State-Guard
      if (!sessionContext.isToolAllowed(name)) {
        const ctx = sessionContext.get()!;
        const msg = buildStateBlockMessage(
          name,
          ctx.workflow.summary,
          ctx.workflow.id,
          ctx.workflow.currentState,
        );
        autoLog(name, args, 'blocked', `state: ${ctx.workflow.currentState}`);
        return msg;
      }
    }

    // Execute tool
    const result = await tool.handler(args);

    // Post-processing (fire-and-forget, only for non-discovery tools with active session)
    if (sessionContext.isActive() && !DISCOVERY_TOOLS.has(name)) {
      autoLog(name, args, 'success');
      autoStatus(name, args);
    }

    return result;
  }
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/tools/registry.ts
git commit -m "feat: integrate auto-logger and auto-status into registry dispatch"
```

---

## Task 4: Auto-Complete Session on Review/Done States

**Files:**
- Modify: `src/tools/flow.ts` (handleFlowUpdate function)

**Step 1: Add auto-complete logic to flow_update**

When `flow_update` transitions to a review state (`plan_review`, `code_review`) or `done`, the agent session should be automatically completed. This replaces the need for manual `agent_session_complete` calls.

In `src/tools/flow.ts`, inside `handleFlowUpdate()`, after the successful context integration block (line ~409-421), add session auto-complete logic:

Find this block at the end of `handleFlowUpdate`:
```typescript
  // Context integration: refresh session after successful update
  if (sessionContext.isActive() && sessionContext.getFlowId() === resolvedId) {
    const updatedWorkflow = result.data!;
    sessionContext.updateWorkflow(updatedWorkflow);

    const newState = updatedWorkflow.currentState;
    sessionContext.updateAllowedActions(getAllowedTools(newState));

    // Provide guidance for review/wait states
    if (['plan_review', 'code_review', 'testing'].includes(newState)) {
      const guidance = NEXT_STEP_GUIDANCE[newState] || '';
      return `Workflow updated successfully.\n\n${formatWorkflowDetail(updatedWorkflow)}\n\n---\n**Naechster Schritt:** ${guidance}`;
    }
  }

  return `Workflow updated successfully.\n\n${formatWorkflowDetail(result.data)}`;
```

Replace with:
```typescript
  // Context integration: refresh session after successful update
  if (sessionContext.isActive() && sessionContext.getFlowId() === resolvedId) {
    const updatedWorkflow = result.data!;
    sessionContext.updateWorkflow(updatedWorkflow);

    const newState = updatedWorkflow.currentState;
    sessionContext.updateAllowedActions(getAllowedTools(newState));

    // Auto-complete session when entering review/done states
    if (['plan_review', 'code_review', 'done'].includes(newState)) {
      const ctx = sessionContext.get()!;
      if (ctx.sessionId !== 'local-session') {
        const summaryMap: Record<string, string> = {
          plan_review: 'Plan eingereicht, warte auf Review',
          code_review: 'Code-Review eingereicht',
          done: 'Workflow abgeschlossen',
        };
        devFlowClient.completeAgentSession(ctx.sessionId, {
          summary: summaryMap[newState] || 'Session beendet',
        }).catch(() => {});
      }
    }

    // Provide guidance for review/wait states
    if (['plan_review', 'code_review', 'testing'].includes(newState)) {
      const guidance = NEXT_STEP_GUIDANCE[newState] || '';
      return `Workflow updated successfully.\n\n${formatWorkflowDetail(updatedWorkflow)}\n\n---\n**Naechster Schritt:** ${guidance}`;
    }
  }

  return `Workflow updated successfully.\n\n${formatWorkflowDetail(result.data)}`;
```

Also add the import for `devFlowClient` at the top of the file if not already present (it IS already imported).

**Step 2: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/tools/flow.ts
git commit -m "feat: auto-complete agent session on review/done transitions"
```

---

## Task 5: Remote Config Types & Sync Module

**Files:**
- Create: `src/config/remote-config.ts`

**Step 1: Create the remote config module**

This module defines the remote config structure and handles sync with the backend. It gracefully falls back to hardcoded defaults if the backend doesn't support the config endpoint yet.

```typescript
// src/config/remote-config.ts
/**
 * Remote Config - Loads project configuration from DevFlow backend.
 *
 * Config includes state-permission map, next-step guidance, and CLAUDE.md template.
 * Falls back to hardcoded defaults if backend doesn't support config endpoint.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface RemoteConfig {
  version: string;
  statePermissions: Record<string, string[]>;
  nextStepGuidance: Record<string, string>;
  discoveryTools: string[];
  requiredFields: Record<string, { fields: string[]; message: string }>;
  blockedTransitions: Record<string, { target: string; reason: string }[]>;
}

const CONFIG_DIR = '.devflow';
const CONFIG_FILE = 'config.json';
const VERSION_FILE = 'config.version';

let activeConfig: RemoteConfig | null = null;

/**
 * Get the currently loaded remote config (or null if not loaded).
 */
export function getRemoteConfig(): RemoteConfig | null {
  return activeConfig;
}

/**
 * Sync config from backend.
 * Returns the config if successful, null if backend doesn't support it.
 */
export async function syncConfig(
  baseUrl: string,
  token: string,
  projectId: string,
  workingDir: string,
): Promise<RemoteConfig | null> {
  const configDir = join(workingDir, CONFIG_DIR);
  const configPath = join(configDir, CONFIG_FILE);
  const versionPath = join(configDir, VERSION_FILE);

  // Read local version hash
  let localVersion: string | null = null;
  try {
    localVersion = await readFile(versionPath, 'utf-8');
  } catch {
    // No local version yet
  }

  // Fetch from backend
  try {
    const url = localVersion
      ? `${baseUrl}/api/projects/${projectId}/config?version=${encodeURIComponent(localVersion)}`
      : `${baseUrl}/api/projects/${projectId}/config`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // 304 Not Modified - config hasn't changed
    if (response.status === 304) {
      // Load from local cache
      try {
        const cached = await readFile(configPath, 'utf-8');
        activeConfig = JSON.parse(cached) as RemoteConfig;
        return activeConfig;
      } catch {
        return null;
      }
    }

    // 404 - endpoint doesn't exist yet, use defaults
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { success: boolean; data?: RemoteConfig; version?: string };
    if (!data.success || !data.data) {
      return null;
    }

    // Save to local cache
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(data.data, null, 2));
    if (data.version) {
      await writeFile(versionPath, data.version);
    }

    activeConfig = data.data;
    return activeConfig;
  } catch {
    // Network error or backend doesn't support it
    // Try loading from local cache
    try {
      const cached = await readFile(configPath, 'utf-8');
      activeConfig = JSON.parse(cached) as RemoteConfig;
      return activeConfig;
    } catch {
      return null;
    }
  }
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add src/config/remote-config.ts
git commit -m "feat: add remote config types and sync module"
```

---

## Task 6: Apply Remote Config to Permissions

**Files:**
- Modify: `src/context/permissions.ts`

**Step 1: Add config override support**

The permissions module currently uses hardcoded `STATE_PERMISSIONS` and `NEXT_STEP_GUIDANCE`. We add a function that checks the remote config first and falls back to hardcoded defaults.

Add at the top of `src/context/permissions.ts` (after existing imports):

```typescript
import { getRemoteConfig } from '../config/remote-config.js';
```

Replace the `getAllowedTools` function with a version that checks remote config:

```typescript
export function getAllowedTools(state: string): string[] {
  const remote = getRemoteConfig();
  if (remote?.statePermissions?.[state]) {
    return [...remote.statePermissions[state]];
  }
  return [...(STATE_PERMISSIONS[state] || [])];
}
```

Add a new function `getNextStepGuidance` for remote-config-aware guidance:

```typescript
export function getNextStepGuidance(state: string): string {
  const remote = getRemoteConfig();
  if (remote?.nextStepGuidance?.[state]) {
    return remote.nextStepGuidance[state];
  }
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Workflow-Status.';
}
```

Then update `buildStateBlockMessage` to use the new function:

Replace:
```typescript
  const nextStep = NEXT_STEP_GUIDANCE[currentState] || 'Pruefe den Workflow-Status.';
```

With:
```typescript
  const nextStep = getNextStepGuidance(currentState);
```

**Step 2: Update usages of NEXT_STEP_GUIDANCE in other files**

In `src/tools/init.ts`, the `determineNextStep` function uses `NEXT_STEP_GUIDANCE` directly. Update the import and usage:

Replace the import line:
```typescript
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
```
With:
```typescript
import { getAllowedTools, NEXT_STEP_GUIDANCE, getNextStepGuidance } from '../context/permissions.js';
```

In `determineNextStep`, replace:
```typescript
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Workflow-Status.';
```
With:
```typescript
  return getNextStepGuidance(state);
```

In `src/tools/flow.ts`, update usages. Replace import:
```typescript
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
```
With:
```typescript
import { getAllowedTools, NEXT_STEP_GUIDANCE, getNextStepGuidance } from '../context/permissions.js';
```

In `handleFlowCreate`, replace:
```typescript
  const nextStep = NEXT_STEP_GUIDANCE[newWorkflow.currentState] || 'Beginne mit der Planung.';
```
With:
```typescript
  const nextStep = getNextStepGuidance(newWorkflow.currentState);
```

In `handleFlowUpdate`, replace:
```typescript
      const guidance = NEXT_STEP_GUIDANCE[newState] || '';
```
With:
```typescript
      const guidance = getNextStepGuidance(newState);
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 4: Commit**

```bash
git add src/context/permissions.ts src/tools/init.ts src/tools/flow.ts src/config/remote-config.ts
git commit -m "feat: apply remote config to permissions with hardcoded fallback"
```

---

## Task 7: Config Sync at Startup

**Files:**
- Modify: `src/index.ts`
- Modify: `src/api/client.ts` (expose token + baseUrl for sync)

**Step 1: Add accessor methods to DevFlowClient**

In `src/api/client.ts`, add two getter methods to the `DevFlowClient` class so the sync module can access the token and base URL:

```typescript
  /**
   * Get the base URL for direct API calls
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the current access token (or null if not authenticated)
   */
  getAccessToken(): string | null {
    return this.credentials?.accessToken ?? null;
  }
```

Add these after the existing `hasLinkedProject()` method (around line 118).

**Step 2: Add config sync to startup in index.ts**

In `src/index.ts`, add the import:

```typescript
import { syncConfig } from './config/remote-config.js';
```

In the `main()` function, after `await devFlowClient.init();`, add config sync:

```typescript
async function main() {
  await devFlowClient.init();

  // Sync remote config if project is linked
  const projectId = devFlowClient.getLinkedProjectId();
  const token = devFlowClient.getAccessToken();
  if (projectId && token) {
    const config = await syncConfig(
      devFlowClient.getBaseUrl(),
      token,
      projectId,
      process.cwd(),
    );
    if (config) {
      console.error(`Remote config loaded (version: ${config.version})`);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const projectName = devFlowClient.getLinkedProjectName();
  console.error(`DevFlow MCP Server v3.0.0 (${registry.size} tools, enforcement active)`);
  if (projectName) {
    console.error(`Linked to project: ${projectName}`);
  }
}
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: Clean compile, no errors.

**Step 4: Commit**

```bash
git add src/index.ts src/api/client.ts
git commit -m "feat: sync remote config at startup with graceful fallback"
```

---

## Task 8: Build Verification & Final Cleanup

**Files:**
- Modify: `src/context/permissions.ts` (remove `agent_session_log` from progress state - now automatic)

**Step 1: Remove manual session log from permissions**

Since logging is now automatic, the agent no longer needs `agent_session_log` in the allowed tools for `progress` state. In `src/context/permissions.ts`, update the `progress` entry in `STATE_PERMISSIONS`:

Replace:
```typescript
  progress: [
    'flow_update',
    'flow_get',
    'task_list',
    'task_create',
    'task_update',
    'project_knowledge_get',
    'project_knowledge_update',
    'agent_session_log',
  ],
```

With:
```typescript
  progress: [
    'flow_update',
    'flow_get',
    'task_list',
    'task_create',
    'task_update',
    'project_knowledge_get',
    'project_knowledge_update',
  ],
```

Also remove `agent_session_list` from `done` state since sessions are now auto-managed:

Replace:
```typescript
  done: [
    'flow_get',
    'task_list',
    'agent_session_list',
  ],
```

With:
```typescript
  done: [
    'flow_get',
    'task_list',
  ],
```

**Step 2: Final build**

Run: `npm run build`
Expected: Clean compile, no errors. Version 3.0.0.

**Step 3: Commit**

```bash
git add src/context/permissions.ts
git commit -m "chore: remove manual session tools from permissions (now automatic)"
```

---

## Summary

| Task | Component | Type |
|------|-----------|------|
| 1 | Auto-Logger Module | Create `src/context/auto-logger.ts` |
| 2 | Auto-Status Derivation | Create `src/context/auto-status.ts` |
| 3 | Registry Integration | Modify `src/tools/registry.ts` |
| 4 | Session Auto-Complete | Modify `src/tools/flow.ts` |
| 5 | Remote Config Module | Create `src/config/remote-config.ts` |
| 6 | Config → Permissions | Modify `src/context/permissions.ts`, `src/tools/init.ts`, `src/tools/flow.ts` |
| 7 | Config Sync at Startup | Modify `src/index.ts`, `src/api/client.ts` |
| 8 | Cleanup & Build | Modify `src/context/permissions.ts` |

**Architecture after Phase 2:**

```
Tool Call → Registry.handle()
  ├─ Context-Guard (Phase 1)
  ├─ State-Guard (Phase 1, now config-aware)
  ├─ Execute tool handler
  ├─ Auto-Log (fire-and-forget) ← NEW
  ├─ Auto-Status (fire-and-forget) ← NEW
  └─ Auto-Complete on review/done ← NEW

Startup:
  ├─ devFlowClient.init() (auth)
  ├─ syncConfig() ← NEW
  └─ server.connect()
```
