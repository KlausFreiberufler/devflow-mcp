/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, locks it, creates session, sets context.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext, type SessionFeedback, type ActiveContext } from '../context/session.js';
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';

// Lease renewal timer
let renewalInterval: ReturnType<typeof setInterval> | null = null;
const RENEW_INTERVAL_MS = parseInt(process.env.LEASE_RENEW_INTERVAL || '30', 10) * 1000;

export function startLeaseRenewal(leaseId: string, leaseToken: string): void {
  stopLeaseRenewal();
  renewalInterval = setInterval(async () => {
    try {
      const result = await devFlowClient.renewLease(leaseId, leaseToken);
      if (!result.success) {
        console.error(`Lease renewal failed: ${result.error}`);
        stopLeaseRenewal();
      }
    } catch (err) {
      console.error('Lease renewal error:', err);
      stopLeaseRenewal();
    }
  }, RENEW_INTERVAL_MS);
}

export function stopLeaseRenewal(): void {
  if (renewalInterval) {
    clearInterval(renewalInterval);
    renewalInterval = null;
  }
}

const devflowInitDef = {
  name: 'devflow_init',
  description: `Initialize a DevFlow work session for a flow.

MUST be called before any other tools (except flow_list and flow_create).
Without devflow_init, all tools are blocked.

What it does:
- Validates and loads the flow
- Locks the flow for this agent (exclusive)
- Creates an agent session for tracking
- Returns full context: flow details, feedback, tasks, allowed actions, next step

Call this at the start of every work session.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to work on'
      }
    },
    required: ['flowId']
  }
};

async function resolveFlowId(partialId: string): Promise<string | null> {
  const exact = await devFlowClient.getFlow(partialId);
  if (exact.success && exact.data) {
    return partialId;
  }

  const list = await devFlowClient.listFlows();
  if (!list.success || !list.data) {
    return null;
  }

  const matches = list.data.filter(w => w.id.startsWith(partialId));
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

function determineFeedback(flow: {
  planFeedback?: string;
  codeFeedback?: string;
}): SessionFeedback | null {
  if (flow.planFeedback) {
    return { type: 'plan_rejected', message: flow.planFeedback };
  }
  if (flow.codeFeedback) {
    return { type: 'code_rejected', message: flow.codeFeedback };
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
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Flow-Status.';
}

async function handleDevflowInit(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;

  // Release previous context if switching flows
  if (sessionContext.isActive()) {
    const currentId = sessionContext.getFlowId();
    const currentLeaseId = sessionContext.getLeaseId();
    const currentLeaseToken = sessionContext.getLeaseToken();
    if (currentId && currentId !== flowId) {
      try {
        if (currentLeaseId && currentLeaseToken) {
          await devFlowClient.releaseLease(currentLeaseId, currentLeaseToken);
        }
        await devFlowClient.updateFlow(currentId, {
          agentStatus: 'idle',
        });
      } catch {
        // Best effort
      }
      stopLeaseRenewal();
      sessionContext.release();
    }
  }

  // 1. Resolve flow ID
  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `⛔ Flow nicht gefunden: "${flowId}"\n\nNutze flow_list() um verfuegbare Flows zu sehen.`;
  }

  // 2. Fetch flow
  const result = await devFlowClient.getFlow(resolvedId);
  if (!result.success || !result.data) {
    return `⛔ Flow konnte nicht geladen werden: ${result.error || 'Unbekannter Fehler'}`;
  }

  const flow = result.data;

  // 3. Check done state
  if (flow.currentState === 'done') {
    return [
      '⛔ Flow ist bereits abgeschlossen.',
      '',
      `Flow: '${flow.summary}' (${flow.id})`,
      '',
      'Waehle einen anderen Flow mit flow_list().',
    ].join('\n');
  }

  // 5. Acquire lease
  let leaseId: string | undefined;
  let leaseToken: string | undefined;

  const projectId = flow.projectId;
  const leaseResult = await devFlowClient.acquireLease(projectId, resolvedId);

  if (!leaseResult.success || !leaseResult.data) {
    const errorMsg = leaseResult.error || 'Unbekannter Fehler';
    // Check for plan limit
    if (errorMsg.includes('Plan limit')) {
      return [
        '⛔ Plan-Limit erreicht.',
        '',
        errorMsg,
        '',
        'Upgrade deinen Plan oder trenne einen aktiven Agent in DevFlow → Einstellungen → API-Zugang.',
      ].join('\n');
    }
    // Check for flow already locked
    if (errorMsg.includes('already has an active lease')) {
      return [
        '⛔ Flow ist bereits durch einen anderen Agent gesperrt.',
        '',
        `Flow: '${flow.summary}' (${flow.id})`,
        '',
        'Warte bis die aktuelle Session endet oder trenne den Agent in DevFlow → Einstellungen → API-Zugang.',
      ].join('\n');
    }
    return `⛔ Lease konnte nicht erstellt werden: ${errorMsg}`;
  }

  leaseId = leaseResult.data.leaseId;
  leaseToken = leaseResult.data.leaseToken;

  // Start lease renewal timer
  startLeaseRenewal(leaseId, leaseToken);

  // 6. Lock flow (set status for UI display)
  const lockResult = await devFlowClient.updateFlow(resolvedId, {
    agentStatus: 'analyzing',
    agentMessage: 'Session gestartet',
  });

  if (!lockResult.success) {
    // Release lease if flow lock fails
    try { await devFlowClient.releaseLease(leaseId, leaseToken); } catch {}
    stopLeaseRenewal();
    return `⛔ Flow konnte nicht gesperrt werden: ${lockResult.error || 'Unbekannter Fehler'}`;
  }

  // 7. Create agent session
  let sessionId = 'local-session';
  try {
    const sessionResult = await devFlowClient.createAgentSession({
      flowId: resolvedId,
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

  // 9. Build context
  const feedback = determineFeedback(flow);
  const state = flow.currentState;
  const allowedActions = getAllowedTools(state);
  const nextStep = determineNextStep(state, feedback);

  const activeContext: ActiveContext = {
    flow: lockResult.data || flow,
    sessionId,
    startedAt: new Date().toISOString(),
    feedback,
    tasks,
    allowedActions,
    nextStep,
    leaseId,
    leaseToken,
  };
  sessionContext.init(activeContext);

  return formatInitResponse(activeContext);
}

function formatInitResponse(ctx: ActiveContext): string {
  const w = ctx.flow;
  const lines = [
    '# Session gestartet',
    '',
    `**Flow:** ${w.summary}`,
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
