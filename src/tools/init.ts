/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, locks it, creates session, sets context.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext, type SessionFeedback, type ActiveContext, type GitContext } from '../context/session.js';
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

function determineNextStep(state: string, feedback: SessionFeedback | null, git?: GitContext): string {
  if (feedback) {
    if (feedback.type === 'plan_rejected') {
      return 'Lies das Feedback und ueberarbeite den Plan. Nutze flow_update({ implementationPlan: "...", currentState: "plan_review" }) wenn fertig.';
    }
    if (feedback.type === 'code_rejected') {
      return 'Lies das Code-Feedback und behebe die genannten Punkte. Fuehre erneut Self-Review durch und nutze flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "testing" }) wenn fertig.';
    }
  }

  // Git workflow guidance
  if (git?.enabled && state === 'progress') {
    const baseBranch = git.releaseBranchName || git.defaultBranch;
    if (git.releaseBranchName && !git.releaseBranchCreated) {
      return `Erstelle zuerst den Release-Branch: git checkout -b ${git.releaseBranchName} ${git.defaultBranch}`;
    }
    if (git.flowBranchName && !git.flowBranchCreated) {
      return `Erstelle den Feature-Branch: git checkout -b ${git.flowBranchName} ${baseBranch}`;
    }
  }

  // Enhanced progress guidance with self-review
  if (state === 'progress' && git?.enabled) {
    const commitHint = git.commitMessagePrompt ? ' (nach Commit-Richtlinien)' : '';
    return `Implementiere die Anforderungen. Wenn fertig: Self-Review durchfuehren (Diff pruefen, Findings fixen, sauber committen${commitHint}). Testing-Instructions erstellen → flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "testing" }).`;
  }

  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Flow-Status.';
}

function generateGitGuidelines(git: GitContext, projectName: string): string {
  const lines = [`# Git-Richtlinien fuer Projekt "${projectName}"`, ''];

  if (git.flowBranchPrompt) {
    lines.push('## Flow-Branches', git.flowBranchPrompt, '');
  }

  if (git.releaseBranchPrompt) {
    lines.push('## Release-Branches', git.releaseBranchPrompt, '');
  }

  if (git.commitMessagePrompt) {
    lines.push('## Commit Messages', git.commitMessagePrompt, '');
  }

  if (git.prTemplatePrompt) {
    lines.push('## PR-Vorlage', git.prTemplatePrompt, '');
  }

  lines.push('## Automatisierung');
  lines.push(`- PR bei Flow-Abschluss: ${git.autoPrOnFlowDone ? 'Ja' : 'Nein'}`);
  lines.push(`- PR bei Release-Abschluss: ${git.autoPrOnRelease ? 'Ja' : 'Nein'}`);

  const targetBranch = git.releaseBranchName || git.defaultBranch;
  lines.push(`- Ziel-Branch: \`${targetBranch}\``);
  lines.push('');

  return lines.join('\n');
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

  // 8. Load git settings
  let gitContext: GitContext | undefined;
  try {
    const gitResult = await devFlowClient.getGitSettings(projectId);
    if (gitResult.success && gitResult.data?.enabled) {
      const gs = gitResult.data;
      // Find active release for branch info
      const releasesResult = await devFlowClient.listReleases(projectId);
      const activeRelease = releasesResult.data?.find((r: { isActive?: boolean }) => r.isActive);

      gitContext = {
        enabled: true,
        defaultBranch: gs.defaultBranch,
        flowBranchPrompt: gs.flowBranchPrompt,
        releaseBranchPrompt: gs.releaseBranchPrompt,
        commitMessagePrompt: gs.commitMessagePrompt,
        prTemplatePrompt: gs.prTemplatePrompt,
        autoPrOnFlowDone: gs.autoPrOnFlowDone || false,
        autoPrOnRelease: gs.autoPrOnRelease || false,
        autoAssignToActiveRelease: gs.autoAssignToActiveRelease,
        flowBranchName: flow.branchName,
        flowBranchCreated: flow.branchCreated || false,
        releaseBranchName: activeRelease?.branchName,
        releaseBranchCreated: activeRelease?.branchCreated || false,
      };
    }
  } catch {
    // Continue without git context
  }

  // 9. Build context
  const feedback = determineFeedback(flow);
  const state = flow.currentState;
  const allowedActions = getAllowedTools(state);
  const nextStep = determineNextStep(state, feedback, gitContext);

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
    git: gitContext,
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

  // Git workflow section
  if (ctx.git?.enabled) {
    const projectName = devFlowClient.getLinkedProjectName() || 'Unbekannt';
    lines.push('', generateGitGuidelines(ctx.git, projectName));

    // Branch status
    lines.push('## Branch-Status');
    const baseBranch = ctx.git.releaseBranchName || ctx.git.defaultBranch;
    if (ctx.git.releaseBranchName) {
      const releaseStatus = ctx.git.releaseBranchCreated ? '✅' : '⬜';
      lines.push(`${releaseStatus} Release-Branch: \`${ctx.git.releaseBranchName}\``);
    }
    if (ctx.git.flowBranchName) {
      const flowStatus = ctx.git.flowBranchCreated ? '✅' : '⬜';
      lines.push(`${flowStatus} Feature-Branch: \`${ctx.git.flowBranchName}\``);
    }
    lines.push(`Basis: \`${baseBranch}\``);
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
