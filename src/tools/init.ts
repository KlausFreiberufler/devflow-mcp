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

function determineFeedback(workflow: {
  planFeedback?: string;
  codeFeedback?: string;
}): SessionFeedback | null {
  if (workflow.planFeedback) {
    return { type: 'plan_rejected', message: workflow.planFeedback };
  }
  if (workflow.codeFeedback) {
    return { type: 'code_rejected', message: workflow.codeFeedback };
  }
  return null;
}

function determineNextStep(state: string, feedback: SessionFeedback | null): string {
  if (feedback) {
    if (feedback.type === 'plan_rejected') {
      return 'Lies das Feedback und ueberarbeite den Plan. Nutze flow_update({ implementationPlan: "...", currentState: "plan_review" }) wenn fertig.';
    }
    if (feedback.type === 'code_rejected') {
      return 'Lies das Code-Feedback und behebe die genannten Punkte. Nutze flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "code_review" }) wenn fertig.';
    }
  }
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Workflow-Status.';
}

async function handleDevflowInit(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;

  // Release previous context if switching workflows
  if (sessionContext.isActive()) {
    const currentId = sessionContext.getFlowId();
    if (currentId && currentId !== flowId) {
      try {
        await devFlowClient.updateWorkflow(currentId, {
          agentStatus: 'idle',
        });
      } catch {
        // Best effort
      }
      sessionContext.release();
    }
  }

  // 0. Agent-Slot check (if not already in a session)
  if (!sessionContext.isActive()) {
    try {
      const slotResult = await devFlowClient.getAgentSlotStatus();
      if (slotResult.success && slotResult.data?.active && slotResult.data.workflow) {
        const slot = slotResult.data.workflow;
        return [
          '⛔ Dein Agent-Slot ist bereits belegt.',
          '',
          'Aktiver Agent:',
          `  Workflow: ${slot.summary} (${slot.id})`,
          `  Status: ${slot.agentStatus}`,
          `  Seit: ${new Date(slot.since).toLocaleString()}`,
          '',
          'Trenne den aktiven Agent in DevFlow → Einstellungen → API-Zugang,',
          'oder warte bis die aktuelle Session endet.',
        ].join('\n');
      }
    } catch {
      // Slot endpoint not available → continue (no enforcement)
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

  // 3. Check if locked by another agent
  if (workflow.agentStatus && workflow.agentStatus !== 'idle') {
    const currentCtx = sessionContext.get();
    if (!currentCtx || currentCtx.workflow.id !== workflow.id) {
      return [
        '⛔ Workflow ist bereits in Bearbeitung.',
        '',
        `Workflow: '${workflow.summary}' (${workflow.id})`,
        `Agent-Status: ${workflow.agentStatus}`,
        workflow.agentMessage ? `Agent-Message: ${workflow.agentMessage}` : '',
        '',
        'Warte bis die aktuelle Session endet oder trenne den Agent in DevFlow → Einstellungen → API-Zugang.',
      ].filter(Boolean).join('\n');
    }
  }

  // 4. Check done state
  if (workflow.currentState === 'done') {
    return [
      '⛔ Workflow ist bereits abgeschlossen.',
      '',
      `Workflow: '${workflow.summary}' (${workflow.id})`,
      '',
      'Waehle einen anderen Workflow mit flow_list().',
    ].join('\n');
  }

  // 5. Lock workflow
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
    // Continue with local tracking
  }

  // 7. Load tasks
  let tasks: import('../api/client.js').Task[] = [];
  try {
    const taskResult = await devFlowClient.listTasks(resolvedId);
    if (taskResult.success && taskResult.data) {
      tasks = taskResult.data;
    }
  } catch {
    // Continue without tasks
  }

  // 8. Build context
  const feedback = determineFeedback(workflow);
  const state = workflow.currentState;
  const allowedActions = getAllowedTools(state);
  const nextStep = determineNextStep(state, feedback);

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

  return formatInitResponse(activeContext);
}

function formatInitResponse(ctx: ActiveContext): string {
  const w = ctx.workflow;
  const lines = [
    '# Session gestartet',
    '',
    `**Workflow:** ${w.summary}`,
    `**ID:** ${w.id}`,
    `**State:** ${w.currentState}`,
  ];

  if (w.description) {
    lines.push('', '## Beschreibung', w.description);
  }

  if (w.acceptanceCriteria && w.acceptanceCriteria.length > 0) {
    lines.push('', '## Acceptance Criteria');
    for (const c of w.acceptanceCriteria) {
      lines.push(`- [ ] ${c}`);
    }
  }

  if (ctx.feedback) {
    lines.push('', `## Feedback`, `**Typ:** ${ctx.feedback.type}`, ctx.feedback.message);
  }

  if (w.implementationPlan) {
    lines.push('', '## Implementation Plan', w.implementationPlan);
  }

  if (ctx.tasks.length > 0) {
    lines.push('', '## Tasks');
    const completed = ctx.tasks.filter(t => t.isCompleted).length;
    lines.push(`**Fortschritt:** ${completed}/${ctx.tasks.length}`);
    for (const t of ctx.tasks) {
      const check = t.isCompleted ? '✅' : '⬜';
      lines.push(`${check} ${t.summary}`);
    }
  }

  lines.push(
    '',
    '---',
    `**Erlaubte Aktionen:** ${ctx.allowedActions.join(', ')}`,
    `**Naechster Schritt:** ${ctx.nextStep}`,
  );

  return lines.join('\n');
}

export const tools: ToolModule = {
  devflow_init: {
    definition: devflowInitDef,
    handler: withErrorHandling('devflow_init', handleDevflowInit),
  },
};
