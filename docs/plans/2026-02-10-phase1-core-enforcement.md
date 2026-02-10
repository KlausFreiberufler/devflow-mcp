# Phase 1: Core Enforcement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the DevFlow MCP Server from soft CLAUDE.md rules into a technically enforced Init-Gate with Context-Guard, State-Guard, and Flow-Locking.

**Architecture:** Every tool call passes through two guard layers in the registry: (1) Context-Guard checks if `devflow_init` has been called, (2) State-Guard checks if the tool is allowed in the current workflow state. A `SessionContext` singleton holds the active workflow and session. Flow-Locking uses the existing `agentStatus` field on workflows.

**Tech Stack:** TypeScript, MCP SDK (`@modelcontextprotocol/sdk`), Node.js ESM

---

### Task 1: Create Session Context Module

**Files:**
- Create: `src/context/session.ts`

**Step 1: Create the context directory**

Run: `mkdir -p src/context`

**Step 2: Write the SessionContext singleton**

```typescript
// src/context/session.ts

/**
 * Session Context - Singleton that holds the active workflow context.
 *
 * This is the core of the Init-Gate: no context = no tools.
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

  /**
   * Initialize the session context with a workflow.
   * Called by devflow_init after validation.
   */
  init(ctx: ActiveContext): void {
    this.context = ctx;
  }

  /**
   * Release the session context.
   * Called when session ends (flow_update to review states, or server shutdown).
   */
  release(): void {
    this.context = null;
  }

  /**
   * Check if a session context is active.
   */
  isActive(): boolean {
    return this.context !== null;
  }

  /**
   * Get the active context. Returns null if no context is set.
   */
  get(): ActiveContext | null {
    return this.context;
  }

  /**
   * Get the active workflow ID. Returns null if no context.
   */
  getFlowId(): string | null {
    return this.context?.workflow.id ?? null;
  }

  /**
   * Get the active workflow state. Returns null if no context.
   */
  getState(): string | null {
    return this.context?.workflow.currentState ?? null;
  }

  /**
   * Check if a tool is in the allowed actions list for the current state.
   */
  isToolAllowed(toolName: string): boolean {
    if (!this.context) return false;
    return this.context.allowedActions.includes(toolName);
  }

  /**
   * Update the workflow in the context (e.g. after a state change).
   */
  updateWorkflow(workflow: Workflow): void {
    if (this.context) {
      this.context.workflow = workflow;
    }
  }

  /**
   * Update the allowed actions (e.g. after a state change).
   */
  updateAllowedActions(actions: string[]): void {
    if (this.context) {
      this.context.allowedActions = actions;
    }
  }
}

export const sessionContext = new SessionContext();
```

**Step 3: Verify it compiles**

Run: `npm run build`
Expected: No errors related to `src/context/session.ts`

**Step 4: Commit**

```bash
git add src/context/session.ts
git commit -m "feat: add SessionContext singleton for Init-Gate"
```

---

### Task 2: Create State-Permission Map

**Files:**
- Create: `src/context/permissions.ts`

**Step 1: Write the permission definitions**

```typescript
// src/context/permissions.ts

/**
 * State-Permission Map
 *
 * Defines which tools are allowed in which workflow state,
 * which tools work without init (discovery), and block messages.
 */

/** Tools that work WITHOUT devflow_init (discovery mode) */
export const DISCOVERY_TOOLS: ReadonlySet<string> = new Set([
  'flow_list',
  'flow_create',
  'devflow_init',
]);

/** Tools allowed per workflow state */
export const STATE_PERMISSIONS: Record<string, readonly string[]> = {
  idea: [
    'flow_update',      // → planning
    'flow_get',         // Read details
  ],
  planning: [
    'flow_update',      // Set plan → plan_review
    'flow_get',         // Read details
    'flow_get_feedback', // Check for feedback
  ],
  plan_review: [
    'flow_get',          // Read details
    'flow_get_feedback', // Check for user feedback
  ],
  progress: [
    'flow_update',       // → code_review
    'flow_get',          // Read details
    'task_list',         // See tasks
    'task_create',       // Create tasks
    'task_update',       // Complete tasks
    'project_knowledge_get',    // Read knowledge
    'project_knowledge_update', // Update knowledge
    'agent_session_log',        // Manual log (optional)
  ],
  code_review: [
    'flow_get',          // Read details
    'flow_get_feedback', // Check for user feedback
  ],
  testing: [
    'flow_get',          // Read details
    'flow_get_feedback', // Check for user feedback
    'task_list',         // See tasks
  ],
  done: [
    'flow_get',          // Read details
    'task_list',         // See tasks
    'agent_session_list', // See session history
  ],
};

/** Next step guidance per state */
export const NEXT_STEP_GUIDANCE: Record<string, string> = {
  idea: 'Wechsle den Workflow zu "planning" mit flow_update({ currentState: "planning" }) und beginne die Analyse.',
  planning: 'Analysiere die Anforderungen, erstelle einen Implementation-Plan und reiche ihn ein mit flow_update({ implementationPlan: "...", currentState: "plan_review" }).',
  plan_review: 'Warte auf User-Feedback zum Plan. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  progress: 'Erstelle Tasks aus dem Plan und beginne mit der Implementierung. Wenn fertig: flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "code_review" }).',
  code_review: 'Warte auf User-Feedback zum Code. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  testing: 'Warte auf User-Testing-Ergebnis. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  done: 'Dieser Workflow ist abgeschlossen. Waehle einen anderen Workflow mit flow_list().',
};

/**
 * Build the "no context" block message shown when a tool is called without devflow_init.
 */
export function buildNoContextMessage(toolName: string): string {
  return [
    `⛔ Kein aktiver Workflow-Context. Tool '${toolName}' ist blockiert.`,
    '',
    'Starte deine Arbeit mit einem dieser Schritte:',
    '1. flow_list() → Finde einen freien Workflow',
    '2. devflow_init({ flowId: "<id>" }) → Beanspruche ihn',
    '   ODER',
    '3. flow_create({ summary: "..." }) → Erstelle einen neuen Workflow',
    '',
    'Ohne aktiven Context sind keine weiteren Tools verfuegbar.',
  ].join('\n');
}

/**
 * Build the state-violation block message shown when a tool is not allowed in the current state.
 */
export function buildStateBlockMessage(
  toolName: string,
  workflowSummary: string,
  workflowId: string,
  currentState: string,
): string {
  const allowed = STATE_PERMISSIONS[currentState] || [];
  const nextStep = NEXT_STEP_GUIDANCE[currentState] || 'Pruefe den Workflow-Status.';

  return [
    `⛔ Aktion '${toolName}' nicht erlaubt im State '${currentState}'.`,
    '',
    `Workflow: '${workflowSummary}' (${workflowId})`,
    `Aktueller State: ${currentState}`,
    `Erlaubte Aktionen: ${allowed.length > 0 ? allowed.join(', ') : 'keine'}`,
    '',
    `Naechster Schritt: ${nextStep}`,
  ].join('\n');
}

/**
 * Get allowed tools for a given state.
 */
export function getAllowedTools(state: string): string[] {
  return [...(STATE_PERMISSIONS[state] || [])];
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/context/permissions.ts
git commit -m "feat: add state-permission map for enforcement"
```

---

### Task 3: Add Guard Middleware to Registry

**Files:**
- Modify: `src/tools/registry.ts`

The registry's `handle()` method is the single dispatch point for ALL tool calls. We add two guard checks here.

**Step 1: Update registry.ts with guard middleware**

Replace the entire file content:

```typescript
// src/tools/registry.ts

/**
 * Tool Registry with Guard Middleware
 *
 * All tool calls pass through two guards:
 * 1. Context-Guard: blocks tools without active devflow_init session
 * 2. State-Guard: blocks tools not allowed in the current workflow state
 */

import { sessionContext } from '../context/session.js';
import {
  DISCOVERY_TOOLS,
  buildNoContextMessage,
  buildStateBlockMessage,
} from '../context/permissions.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ToolRegistration {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export type ToolModule = Record<string, ToolRegistration>;

class ToolRegistry {
  private tools = new Map<string, ToolRegistration>();

  /**
   * Register all tools from a module
   */
  register(module: ToolModule): void {
    for (const [name, registration] of Object.entries(module)) {
      if (this.tools.has(name)) {
        throw new Error(`Duplicate tool registration: ${name}`);
      }
      this.tools.set(name, registration);
    }
  }

  /**
   * Get all tool definitions for ListToolsRequest
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Dispatch a tool call to the right handler.
   * Applies Context-Guard and State-Guard before executing.
   */
  async handle(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // --- Guard 1: Context-Guard ---
    // Discovery tools bypass the context check
    if (!DISCOVERY_TOOLS.has(name)) {
      if (!sessionContext.isActive()) {
        return buildNoContextMessage(name);
      }

      // --- Guard 2: State-Guard ---
      if (!sessionContext.isToolAllowed(name)) {
        const ctx = sessionContext.get()!;
        return buildStateBlockMessage(
          name,
          ctx.workflow.summary,
          ctx.workflow.id,
          ctx.workflow.currentState,
        );
      }
    }

    return tool.handler(args);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the number of registered tools
   */
  get size(): number {
    return this.tools.size;
  }
}

export const registry = new ToolRegistry();
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors. The guards are now active but won't block anything until `devflow_init` tool is wired up, because `DISCOVERY_TOOLS` includes `flow_list` and `flow_create`.

**Step 3: Commit**

```bash
git add src/tools/registry.ts
git commit -m "feat: add context-guard and state-guard middleware to registry"
```

---

### Task 4: Create devflow_init Tool

**Files:**
- Create: `src/tools/init.ts`

This is the core Init-Gate tool. It:
1. Fetches the workflow and validates it
2. Checks if the workflow is already locked (agentStatus != idle/null)
3. Creates an agent session via the backend
4. Sets agentStatus on the workflow to "analyzing"
5. Loads feedback if any
6. Loads existing tasks
7. Sets the SessionContext
8. Returns the full context

**Step 1: Write the devflow_init tool**

```typescript
// src/tools/init.ts

/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates workflow, locks it, creates session, sets context.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext, type SessionFeedback, type ActiveContext } from '../context/session.js';
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definition ============

const devflowInitDef = {
  name: 'devflow_init',
  description: `Initialize a DevFlow work session for a workflow.

MUST be called before any other tools (except flow_list and flow_create).
Without devflow_init, all tools are blocked.

What it does:
- Validates and loads the workflow
- Locks the workflow for this agent (exclusive)
- Creates an agent session for tracking
- Returns full context: workflow details, feedback, tasks, allowed actions, next step

Call this at the start of every work session.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The workflow ID to work on'
      }
    },
    required: ['flowId']
  }
};

// ============ Helper: Resolve Workflow ID ============

async function resolveWorkflowId(partialId: string): Promise<string | null> {
  const exact = await devFlowClient.getWorkflow(partialId);
  if (exact.success && exact.data) {
    return partialId;
  }

  const list = await devFlowClient.listWorkflows();
  if (!list.success || !list.data) {
    return null;
  }

  const matches = list.data.filter(w => w.id.startsWith(partialId));
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

// ============ Helper: Determine Feedback ============

function determineFeedback(workflow: {
  currentState: string;
  planFeedback?: string;
  codeFeedback?: string;
  planApprovedBy?: string;
}): SessionFeedback | null {
  if (workflow.planFeedback) {
    return {
      type: 'plan_rejected',
      message: workflow.planFeedback,
    };
  }
  if (workflow.codeFeedback) {
    return {
      type: 'code_rejected',
      message: workflow.codeFeedback,
    };
  }
  return null;
}

// ============ Helper: Determine Next Step ============

function determineNextStep(
  state: string,
  feedback: SessionFeedback | null,
): string {
  if (feedback) {
    switch (feedback.type) {
      case 'plan_rejected':
        return 'Lies das Feedback und ueberarbeite den Plan. Nutze flow_update({ implementationPlan: "...", currentState: "plan_review" }) wenn fertig.';
      case 'code_rejected':
        return 'Lies das Code-Feedback und behebe die genannten Punkte. Nutze flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "code_review" }) wenn fertig.';
      case 'testing_failed':
        return 'Lies das Testing-Feedback und fixe die Bugs.';
    }
  }
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Workflow-Status.';
}

// ============ Tool Handler ============

async function handleDevflowInit(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;

  // Already have an active context? Release it first.
  if (sessionContext.isActive()) {
    const currentId = sessionContext.getFlowId();
    if (currentId === flowId) {
      // Re-init same workflow: just refresh context
    } else {
      // Different workflow: release old context, set idle on old workflow
      try {
        await devFlowClient.updateWorkflow(currentId!, {
          agentStatus: 'idle',
          agentMessage: undefined,
        });
      } catch {
        // Best effort
      }
      sessionContext.release();
    }
  }

  // 1. Resolve workflow ID
  const resolvedId = await resolveWorkflowId(flowId);
  if (!resolvedId) {
    return `⛔ Workflow nicht gefunden: "${flowId}"\n\nNutze flow_list() um verfuegbare Workflows zu sehen.`;
  }

  // 2. Fetch workflow
  const result = await devFlowClient.getWorkflow(resolvedId);
  if (!result.success || !result.data) {
    return `⛔ Workflow konnte nicht geladen werden: ${result.error || 'Unbekannter Fehler'}`;
  }

  const workflow = result.data;

  // 3. Check if workflow is locked by another agent
  if (workflow.agentStatus && workflow.agentStatus !== 'idle') {
    // Check if it's us re-initting
    const currentCtx = sessionContext.get();
    if (!currentCtx || currentCtx.workflow.id !== workflow.id) {
      return [
        `⛔ Workflow ist bereits in Bearbeitung.`,
        '',
        `Workflow: '${workflow.summary}' (${workflow.id})`,
        `Agent-Status: ${workflow.agentStatus}`,
        workflow.agentMessage ? `Agent-Message: ${workflow.agentMessage}` : '',
        '',
        'Warte bis die aktuelle Session endet oder trenne den Agent in DevFlow → Einstellungen → API-Zugang.',
      ].filter(Boolean).join('\n');
    }
  }

  // 4. Check if workflow is in 'done' state
  if (workflow.currentState === 'done') {
    return [
      `⛔ Workflow ist bereits abgeschlossen.`,
      '',
      `Workflow: '${workflow.summary}' (${workflow.id})`,
      `State: done`,
      '',
      'Waehle einen anderen Workflow mit flow_list().',
    ].join('\n');
  }

  // 5. Lock workflow: set agentStatus to "analyzing"
  const lockResult = await devFlowClient.updateWorkflow(resolvedId, {
    agentStatus: 'analyzing',
    agentMessage: 'Session gestartet',
  });

  if (!lockResult.success) {
    return `⛔ Workflow konnte nicht gesperrt werden: ${lockResult.error || 'Unbekannter Fehler'}`;
  }

  // 6. Create agent session
  let sessionId = 'local-session';
  try {
    const sessionResult = await devFlowClient.createAgentSession({
      workflowId: resolvedId,
      type: 'enforcement-v3',
    });
    if (sessionResult.success && sessionResult.data) {
      sessionId = sessionResult.data.id;
    }
  } catch {
    // Agent session creation failed, continue with local tracking
  }

  // 7. Load tasks
  let tasks: import('../api/client.js').Task[] = [];
  try {
    const taskResult = await devFlowClient.listTasks(resolvedId);
    if (taskResult.success && taskResult.data) {
      tasks = taskResult.data;
    }
  } catch {
    // Tasks not available, continue
  }

  // 8. Determine feedback and next step
  const feedback = determineFeedback(workflow);
  const state = workflow.currentState;
  const allowedActions = getAllowedTools(state);
  const nextStep = determineNextStep(state, feedback);

  // 9. Set session context
  const activeContext: ActiveContext = {
    workflow: lockResult.data || workflow,
    sessionId,
    startedAt: new Date().toISOString(),
    feedback,
    tasks,
    allowedActions,
    nextStep,
  };
  sessionContext.init(activeContext);

  // 10. Format response
  return formatInitResponse(activeContext);
}

// ============ Response Formatter ============

function formatInitResponse(ctx: ActiveContext): string {
  const w = ctx.workflow;
  const lines = [
    `# Session gestartet`,
    '',
    `**Workflow:** ${w.summary}`,
    `**ID:** ${w.id}`,
    `**State:** ${w.currentState}`,
  ];

  if (w.description) {
    lines.push('');
    lines.push('## Beschreibung');
    lines.push(w.description);
  }

  if (w.acceptanceCriteria && w.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('## Acceptance Criteria');
    for (const c of w.acceptanceCriteria) {
      lines.push(`- [ ] ${c}`);
    }
  }

  if (ctx.feedback) {
    lines.push('');
    lines.push('## ⚠️ Feedback');
    lines.push(`**Typ:** ${ctx.feedback.type}`);
    lines.push(ctx.feedback.message);
  }

  if (w.implementationPlan) {
    lines.push('');
    lines.push('## Implementation Plan');
    lines.push(w.implementationPlan);
  }

  if (ctx.tasks.length > 0) {
    lines.push('');
    lines.push('## Tasks');
    const completed = ctx.tasks.filter(t => t.isCompleted).length;
    lines.push(`**Fortschritt:** ${completed}/${ctx.tasks.length}`);
    for (const t of ctx.tasks) {
      const check = t.isCompleted ? '✅' : '⬜';
      lines.push(`${check} ${t.summary}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`**Erlaubte Aktionen:** ${ctx.allowedActions.join(', ')}`);
  lines.push(`**Naechster Schritt:** ${ctx.nextStep}`);

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  devflow_init: {
    definition: devflowInitDef,
    handler: withErrorHandling('devflow_init', handleDevflowInit),
  },
};
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/init.ts
git commit -m "feat: add devflow_init tool (Init-Gate)"
```

---

### Task 5: Wire devflow_init into index.ts and Update Server Version

**Files:**
- Modify: `src/index.ts`

**Step 1: Add the init tool registration and remove project_list**

Replace `src/index.ts` with:

```typescript
#!/usr/bin/env node
/**
 * DevFlow MCP Server v3.0.0
 *
 * Enforced workflow development with Init-Gate.
 * Tools are gated: devflow_init must be called first.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { devFlowClient } from './api/client.js';
import { registry } from './tools/registry.js';
import { sessionContext } from './context/session.js';

// Register tool modules
// Init-Gate (discovery + init)
import { tools as initTools } from './tools/init.js';
// Workflow tools (gated)
import { tools as flowTools } from './tools/flow.js';
import { tools as taskTools } from './tools/task.js';
import { tools as agentSessionTools } from './tools/agent-session.js';
import { tools as knowledgeTools } from './tools/knowledge.js';
import { tools as releaseTools } from './tools/release.js';
import { tools as searchTools } from './tools/search.js';

// NOTE: project_list removed from runtime tools (only used during setup)

registry.register(initTools);
registry.register(flowTools);
registry.register(taskTools);
registry.register(agentSessionTools);
registry.register(knowledgeTools);
registry.register(releaseTools);
registry.register(searchTools);

// Initialize server
const server = new Server(
  { name: 'devflow', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.listTools(),
}));

// Handle tool calls (guards are applied inside registry.handle)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await registry.handle(name, (args || {}) as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Graceful shutdown: release workflow lock
function cleanup() {
  if (sessionContext.isActive()) {
    const flowId = sessionContext.getFlowId();
    if (flowId) {
      // Best-effort: set workflow to idle
      devFlowClient.updateWorkflow(flowId, {
        agentStatus: 'idle',
        agentMessage: undefined,
      }).catch(() => {});
    }
    sessionContext.release();
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

// Start server
async function main() {
  await devFlowClient.init();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const projectName = devFlowClient.getLinkedProjectName();
  console.error(`DevFlow MCP Server v3.0.0 (${registry.size} tools, enforcement active)`);
  if (projectName) {
    console.error(`Linked to project: ${projectName}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors. Server now has `devflow_init`, guards, and graceful shutdown.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire devflow_init, add guards and graceful shutdown"
```

---

### Task 6: Update flow_update to Integrate with SessionContext

**Files:**
- Modify: `src/tools/flow.ts`

When `flow_update` transitions to a review state (plan_review, code_review), we need to:
1. Update the SessionContext allowed actions
2. Potentially release the lock (set agentStatus to idle)

**Step 1: Add context integration to flow_update handler**

In `src/tools/flow.ts`, add the import at the top (after existing imports):

```typescript
import { sessionContext } from '../context/session.js';
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
```

Then at the end of `handleFlowUpdate`, after the successful update (before the return statement `return \`Workflow updated successfully...`), add context refresh logic:

```typescript
  // --- Context Integration ---
  // After successful update, refresh the session context if active
  if (sessionContext.isActive() && sessionContext.getFlowId() === resolvedId) {
    const updatedWorkflow = result.data!;
    sessionContext.updateWorkflow(updatedWorkflow);

    const newState = updatedWorkflow.currentState;
    sessionContext.updateAllowedActions(getAllowedTools(newState));

    // If transitioning to a review/wait state, inform the agent
    if (['plan_review', 'code_review', 'testing'].includes(newState)) {
      const guidance = NEXT_STEP_GUIDANCE[newState] || '';
      return `Workflow updated successfully.\n\n${formatWorkflowDetail(updatedWorkflow)}\n\n---\n**Naechster Schritt:** ${guidance}`;
    }
  }
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/flow.ts
git commit -m "feat: integrate flow_update with SessionContext"
```

---

### Task 7: Update flow_list to Show Lock Status

**Files:**
- Modify: `src/tools/flow.ts`

**Step 1: Update the formatWorkflowList function**

In `src/tools/flow.ts`, find the `formatWorkflowList` function. Replace the line inside the for-loop that renders each workflow:

Find this block in the inner for-loop:
```typescript
      lines.push(`- **${w.id}**: ${ticket}${w.summary}`);
      if (w.agentStatus) {
        lines.push(`  └─ Agent: ${w.agentStatus}${w.agentMessage ? ` - ${w.agentMessage}` : ''}`);
      }
```

Replace with:
```typescript
      const lockInfo = (w.agentStatus && w.agentStatus !== 'idle')
        ? ` [🔒 ${w.agentStatus}]`
        : ' (frei)';
      lines.push(`- **${w.id}**: ${ticket}${w.summary}${lockInfo}`);
      if (w.agentMessage) {
        lines.push(`  └─ ${w.agentMessage}`);
      }
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/flow.ts
git commit -m "feat: show lock status in flow_list"
```

---

### Task 8: Update flow_create to Auto-Init

**Files:**
- Modify: `src/tools/flow.ts`

When a workflow is created via `flow_create`, it should automatically initialize the session context so the agent can immediately start working.

**Step 1: Update handleFlowCreate**

At the end of `handleFlowCreate`, after the success check, add auto-init logic:

```typescript
  // Auto-init: set session context for the newly created workflow
  const newWorkflow = result.data!;
  const allowedActions = getAllowedTools(newWorkflow.currentState);
  const nextStep = NEXT_STEP_GUIDANCE[newWorkflow.currentState] || 'Beginne mit der Planung.';

  // Lock the workflow
  await devFlowClient.updateWorkflow(newWorkflow.id, {
    agentStatus: 'analyzing',
    agentMessage: 'Neuer Workflow erstellt',
  });

  // Create agent session
  let sessionId = 'local-session';
  try {
    const sessionResult = await devFlowClient.createAgentSession({
      workflowId: newWorkflow.id,
      type: 'enforcement-v3',
    });
    if (sessionResult.success && sessionResult.data) {
      sessionId = sessionResult.data.id;
    }
  } catch {
    // Continue with local tracking
  }

  // Set context
  sessionContext.init({
    workflow: newWorkflow,
    sessionId,
    startedAt: new Date().toISOString(),
    feedback: null,
    tasks: [],
    allowedActions,
    nextStep,
  });

  return [
    `Workflow erstellt und Session gestartet.`,
    '',
    formatWorkflowDetail(newWorkflow),
    '',
    '---',
    `**Erlaubte Aktionen:** ${allowedActions.join(', ')}`,
    `**Naechster Schritt:** ${nextStep}`,
  ].join('\n');
```

And replace the existing return statement:
```typescript
  return `Workflow created successfully.\n\n${formatWorkflowDetail(result.data)}`;
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/flow.ts
git commit -m "feat: auto-init session on flow_create"
```

---

### Task 9: Update CLAUDE.md Template (Slim Version)

**Files:**
- Modify: `src/templates/claude-md.ts`

**Step 1: Replace the template with the slim version**

Replace the entire `generateClaudeMdContent` function body:

```typescript
export function generateClaudeMdContent(projectName: string, techStack?: string): string {
  const techStackLine = techStack
    ? `**Tech-Stack:** ${techStack}\n`
    : '';

  return `${MARKER_START}
# DevFlow - Strukturierte KI-Entwicklung

**Projekt:** ${projectName}
${techStackLine}
Dieses Projekt nutzt DevFlow fuer strukturierte, nachvollziehbare KI-Entwicklung.
Alle Regeln werden technisch vom MCP-Server erzwungen.

## Arbeitsstart

BEVOR du mit der Arbeit beginnst:

1. \`flow_list()\` → Finde einen freien Workflow
2. \`devflow_init({ flowId: "<id>" })\` → Starte deine Session
   ODER
3. \`flow_create({ summary: "..." })\` → Erstelle einen neuen Workflow

**Ohne \`devflow_init\` sind alle Tools blockiert.**

## Prozess

Der Server gibt dir bei jedem Schritt Anweisungen:
- **allowedActions** → welche Tools du nutzen darfst
- **nextStep** → was du als naechstes tun sollst

Folge den Anweisungen aus den Tool-Responses. Erlaubte Aktionen haengen vom
Workflow-State ab und werden vom Server erzwungen.

## Workflow-States

\`\`\`
idea → planning → plan_review → progress → code_review → testing → done
\`\`\`

Review-States (plan_review, code_review, testing) sind Wartezustaende.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.
${MARKER_END}
`;
}
```

**Step 2: Verify it compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/templates/claude-md.ts
git commit -m "feat: slim CLAUDE.md template (server enforces rules)"
```

---

### Task 10: Build Verification & Version Bump

**Files:**
- Modify: `package.json` (version bump)

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Verify the dist output**

Run: `ls dist/`
Expected: All compiled JS files including new ones:
- `dist/context/session.js`
- `dist/context/permissions.js`
- `dist/tools/init.js`

**Step 3: Update version in package.json**

Change version from `"1.0.0"` to `"3.0.0"` in `package.json`.

**Step 4: Update the CLAUDE.md in the project root**

Re-generate the CLAUDE.md for this project with the new slim template. The existing CLAUDE.md should be replaced with the slim version between the markers.

**Step 5: Final commit**

```bash
git add package.json CLAUDE.md
git commit -m "chore: bump version to 3.0.0, update project CLAUDE.md"
```

---

## File Summary

### New Files
| File | Purpose |
|---|---|
| `src/context/session.ts` | SessionContext singleton - holds active workflow + session |
| `src/context/permissions.ts` | State-permission map, discovery tools, block messages |
| `src/tools/init.ts` | `devflow_init` tool - Init-Gate entry point |

### Modified Files
| File | Changes |
|---|---|
| `src/tools/registry.ts` | Added Context-Guard and State-Guard middleware to `handle()` |
| `src/index.ts` | Register init tool, remove project_list, graceful shutdown, v3.0.0 |
| `src/tools/flow.ts` | Context integration in flow_update, lock status in flow_list, auto-init in flow_create |
| `src/templates/claude-md.ts` | Slim CLAUDE.md template (~30 lines statt ~250) |
| `package.json` | Version bump to 3.0.0 |

### Removed from Runtime
| File | Reason |
|---|---|
| `src/tools/project.ts` | `project_list` no longer registered (kept for setup use) |

---

## Verification Checklist

After all tasks are done, verify:

- [ ] `npm run build` succeeds
- [ ] `devflow_init` is in the tool list
- [ ] `project_list` is NOT in the tool list
- [ ] Calling any tool without `devflow_init` returns the "no context" block message
- [ ] `flow_list` and `flow_create` work without init (discovery tools)
- [ ] After `devflow_init`, tools are gated by workflow state
- [ ] `flow_list` shows lock status
- [ ] `flow_create` auto-initializes session
- [ ] Server releases lock on shutdown (SIGINT/SIGTERM)
- [ ] CLAUDE.md template is slim (~30 lines)
