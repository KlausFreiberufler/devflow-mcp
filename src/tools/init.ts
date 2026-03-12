/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, creates session via backend init endpoint, sets context.
 */

import { devFlowClient } from '../api/client.js';
import { sessionContext, type SessionFeedback, type ActiveContext, type GitContext } from '../context/session.js';
import { getAllowedTools, NEXT_STEP_GUIDANCE } from '../context/permissions.js';
import { getConfig } from '../config/sync.js';
import { formatStrictnessLevel } from '../config/types.js';
import { checkForUpdate } from '../config/version-check.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';
import { resolveFlowId } from '../utils/resolve-flow-id.js';

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
      return 'Lies das Feedback und ueberarbeite den Plan. Nutze flow_update({ implementationPlan: "...", currentState: "approval" }) wenn fertig.';
    }
    if (feedback.type === 'code_rejected') {
      return 'Lies das Code-Feedback und behebe die genannten Punkte. Fuehre erneut Self-Review durch und nutze flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "review" }) wenn fertig.';
    }
  }

  // Git workflow guidance
  if (git?.enabled && state === 'in_progress') {
    const baseBranch = git.releaseBranchName || git.defaultBranch;
    if (git.releaseBranchName && !git.releaseBranchCreated) {
      return `Erstelle zuerst den Release-Branch: git checkout -b ${git.releaseBranchName} ${git.defaultBranch}`;
    }
    if (git.flowBranchName && !git.flowBranchCreated) {
      return `Erstelle den Feature-Branch: git checkout -b ${git.flowBranchName} ${baseBranch}`;
    }
  }

  // Enhanced progress guidance with self-review
  if (state === 'in_progress') {
    const commitHint = git?.enabled && git.commitMessagePrompt ? ' (nach Commit-Richtlinien)' : '';
    let guidance = `Implementiere die Anforderungen. Wenn fertig: Self-Review durchfuehren (Diff pruefen, Findings fixen, sauber committen${commitHint}). Testing-Instructions erstellen → flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "review" }).`;

    // Add docs update guidance based on docsUpdate strictness level
    const docsLevel = getConfig().strictness.docsUpdate;
    if (docsLevel >= 5) {
      guidance += '\n\n⚠️ DOCS-UPDATE PFLICHT: Vor dem Review MUSST du alle relevanten Docs pruefen und aktualisieren. Nutze GET /api/docs/relevant?flowId=<flowId> um betroffene Seiten zu finden. Aktualisiere EN + DE Versionen. Docs-Commit ist Pflicht.';
    } else if (docsLevel >= 3) {
      guidance += '\n\nDOCS-UPDATE: Bevor du zu Review wechselst, pruefe ob Dokumentation aktualisiert werden muss: GET /api/docs/relevant?flowId=<flowId>. Aktualisiere betroffene Docs (EN + DE) und committe die Aenderungen.';
    }

    return guidance;
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

  // 1. Release previous context if switching flows
  if (sessionContext.isActive()) {
    const ctx = sessionContext.get();
    if (ctx && ctx.flow.id !== flowId) {
      try {
        if (ctx.sessionId) {
          await devFlowClient.completeAgentSession(ctx.sessionId);
        }
        await devFlowClient.updateFlow(ctx.flow.id, {
          agentStatus: 'idle',
        });
      } catch {
        // Best effort cleanup
      }
      sessionContext.release();
    }
  }

  // 2. Resolve flow ID (supports partial IDs)
  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `⛔ Flow nicht gefunden: "${flowId}"\n\nNutze flow_list() um verfuegbare Flows zu sehen.`;
  }

  // 3. Call init endpoint (creates session, returns flow + tasks + permissions)
  const initResult = await devFlowClient.initSession(resolvedId);
  if (!initResult.success || !initResult.data) {
    const errorMsg = initResult.error || 'Unbekannter Fehler';
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
    if (errorMsg.includes('already has an active') || errorMsg.includes('already locked')) {
      return [
        '⛔ Flow ist bereits durch einen anderen Agent gesperrt.',
        '',
        `Flow ID: ${resolvedId}`,
        '',
        'Warte bis die aktuelle Session endet oder trenne den Agent in DevFlow → Einstellungen → API-Zugang.',
      ].join('\n');
    }
    return `⛔ Init fehlgeschlagen: ${errorMsg}`;
  }

  const { session, flow: initFlow, tasks: initTasks, warning } = initResult.data;
  const initData = initResult.data as Record<string, unknown>;

  // Store session ID on client for X-Agent-Session header
  devFlowClient.setAgentSessionId(session.id);

  // 4. Fetch full flow details (init endpoint returns minimal flow data)
  const fullFlowResult = await devFlowClient.getFlow(resolvedId);
  if (!fullFlowResult.success || !fullFlowResult.data) {
    return `⛔ Flow konnte nicht geladen werden: ${fullFlowResult.error || 'Unbekannter Fehler'}`;
  }
  const flow = fullFlowResult.data;

  // 5. Auto-advance state for visibility (idea → planning, ready → in_progress)
  const AUTO_ADVANCE: Record<string, string> = {
    idea: 'planning',
    ready: 'in_progress',
  };
  const advanceTo = AUTO_ADVANCE[flow.currentState];
  if (advanceTo) {
    const advanceUpdate: Record<string, unknown> = {
      currentState: advanceTo,
      agentStatus: advanceTo === 'planning' ? 'analyzing' : 'implementing',
      agentMessage: 'Session gestartet',
    };
    const advanceResult = await devFlowClient.updateFlow(resolvedId, advanceUpdate);
    if (advanceResult.success && advanceResult.data) {
      // Use the updated flow
      Object.assign(flow, advanceResult.data);
    }
  } else {
    // Set agent status even without state advance
    await devFlowClient.updateFlow(resolvedId, {
      agentStatus: 'analyzing',
      agentMessage: 'Session gestartet',
    }).catch(() => {});
  }

  // 6. Check for feedback
  const feedback = determineFeedback(flow);

  // 7. Load git settings
  let gitContext: GitContext | undefined;
  try {
    const projectId = flow.projectId;
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

  // 8. Transform tasks from init response to full Task format
  const tasks = initTasks.map(t => ({
    id: t.id,
    flowId: resolvedId,
    summary: t.summary,
    isCompleted: t.isCompleted,
    sortOrder: 0,
    createdAt: '',
    status: t.status as 'todo' | 'doing' | 'done' | undefined,
  }));

  // 9. Build context
  const state = flow.currentState;
  const allowedActions = getAllowedTools(state);
  const nextStep = determineNextStep(state, feedback, gitContext);

  const activeContext: ActiveContext = {
    flow,
    previousState: advanceTo ? AUTO_ADVANCE[advanceTo] ? undefined : flow.currentState : undefined,
    sessionId: session.id,
    startedAt: new Date().toISOString(),
    feedback,
    tasks,
    allowedActions,
    nextStep,
    git: gitContext,
  };

  // Track the previous state correctly for auto-advance display
  if (advanceTo) {
    // The original state before auto-advance
    const originalState = Object.entries(AUTO_ADVANCE).find(([, v]) => v === flow.currentState)?.[0];
    if (originalState) {
      activeContext.previousState = originalState;
    }
  }

  sessionContext.init(activeContext);

  // 10. Store pipeline info if present (Phase 2 init response)
  // Note: Only override allowedActions from pipeline when NO auto-advance happened.
  // The backend init response reflects the pre-advance state, so its allowedActions
  // would be stale after auto-advance (e.g. 'ready' actions instead of 'in_progress').
  if (initData.pipelineStep) {
    const gate = initData.gate as { blocked?: boolean } | undefined;
    const pipelineUpdate: Partial<ActiveContext> = {
      pipelineStep: initData.pipelineStep as string,
      skill: (initData.skill as { slug: string; name: string; description?: string }) || null,
      gateBlocked: gate?.blocked || false,
      retryCount: (initData.retryCount as number) || 0,
      previousFeedback: (initData.previousFeedback as string) || null,
    };
    // Only use pipeline allowedActions if: (a) it's a real array, and (b) no auto-advance
    if (!advanceTo && Array.isArray(initData.allowedActions)) {
      pipelineUpdate.allowedActions = initData.allowedActions as string[];
    }
    sessionContext.update(pipelineUpdate);
  }

  // Version check (non-blocking, cached)
  const baseUrl = devFlowClient.getBaseUrl();
  const updateInfo = await checkForUpdate(baseUrl);

  return formatInitResponse(activeContext, warning, updateInfo);
}

function formatInitResponse(
  ctx: ActiveContext,
  warning?: string,
  updateAvailable?: { currentVersion: string; latestVersion: string } | null,
): string {
  const w = ctx.flow;
  const lines = [
    '# Session gestartet',
    '',
    `**Flow:** ${w.summary}`,
    `**ID:** ${w.id}`,
    `**State:** ${w.currentState}`,
  ];

  // Show strictness levels
  const s = getConfig().strictness;
  lines.push(`**Strictness:** Flow ${formatStrictnessLevel(s.flowRequired)} | Plan ${formatStrictnessLevel(s.planRequired)} | Tasks ${formatStrictnessLevel(s.taskTracking)} | Git ${formatStrictnessLevel(s.gitDiscipline)} | Review ${formatStrictnessLevel(s.reviewRequired)} | Docs ${formatStrictnessLevel(s.docsUpdate)}`);

  if (ctx.previousState) {
    lines.push(`**Auto-Advance:** ${ctx.previousState} → ${w.currentState}`);
  }

  if (warning) {
    lines.push('', `⚠️ **Warnung:** ${warning}`);
  }

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

  // Pipeline section (Phase 2)
  if (ctx.pipelineStep) {
    const executor = (ctx.skill?.slug) || 'agent';
    lines.push('', '## Pipeline');
    lines.push(`**Current step:** ${ctx.pipelineStep} (${executor})`);
    if (ctx.skill) {
      lines.push(`**Skill:** ${ctx.skill.name}${ctx.skill.description ? ` — ${ctx.skill.description}` : ''}`);
    }
    if (ctx.gateBlocked) {
      lines.push('', `⚠️ **Gate blocked:** Step '${ctx.pipelineStep}' requires human action. Wait for user in DevFlow UI.`);
    }
    if (ctx.retryCount && ctx.retryCount > 0 && ctx.previousFeedback) {
      lines.push('', `🔄 **Retry #${ctx.retryCount}** — Previous feedback:`, ctx.previousFeedback);
    }
  }

  lines.push(
    '',
    '---',
    `**Erlaubte Aktionen:** ${ctx.allowedActions.join(', ')}`,
    `**Naechster Schritt:** ${ctx.nextStep}`,
  );

  if (updateAvailable) {
    lines.push('');
    lines.push('---');
    lines.push(`**⚠️ Update available:** v${updateAvailable.currentVersion} → v${updateAvailable.latestVersion}`);
    lines.push('Run: `npx github:KlausFreiberufler/devflow-mcp setup`');
  }

  return lines.join('\n');
}

export const tools: ToolModule = {
  devflow_init: {
    definition: devflowInitDef,
    handler: withErrorHandling('devflow_init', handleDevflowInit),
  },
};
