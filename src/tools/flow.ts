/**
 * Flow MCP Tools
 * Tools for listing, getting, creating, and updating flows in DevFlow
 */

import { devFlowClient, type Flow, type FlowAttachment } from '../api/client.js';
import type { ToolContentBlock, ToolHandlerResult, ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';
import { sessionContext } from '../context/session.js';
import { NEXT_STEP_GUIDANCE } from '../context/permissions.js';
import { extractImagesFromTipTap } from '../utils/tiptap.js';
import { formatAttachmentList } from '../utils/attachments.js';
import { resolveFlowId } from '../utils/resolve-flow-id.js';

// DF-208: MIME types that should be embedded inline as text in flow_get
const INLINE_TEXT_MIME = new Set([
  'text/markdown', 'text/plain', 'text/html', 'text/css', 'text/csv',
  'application/json',
]);
const IMAGE_MIME_PREFIX = 'image/';
// Cap per-image payload to avoid runaway MCP responses (images above this are linked, not embedded)
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// Cap total inline text per flow_get to avoid huge responses
const MAX_INLINE_TEXT_BYTES = 512 * 1024;

// ============ Tool Definitions ============

const flowListDef = {
  name: 'flow_list',
  description: `List all flows, optionally filtered by project.
Returns flows with their current state (idea, planning, approval, ready, in_progress, review, done).
Use this to find flows to work on.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'Optional project ID to filter flows'
      },
      state: {
        type: 'string',
        enum: ['idea', 'planning', 'approval', 'ready', 'in_progress', 'review', 'done'],
        description: 'Optional state filter'
      }
    }
  }
};

const flowGetDef = {
  name: 'flow_get',
  description: `Get detailed information about a specific flow.
Returns the full flow including:
- Summary and description
- Acceptance criteria
- Current state
- Agent status (if being worked on)
- Implementation plan (full content)
- Audit info (who created/approved)

Use this before starting work on a flow to understand requirements.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID (e.g., "abc123" or full ID)'
      }
    },
    required: ['flowId']
  }
};

const flowCreateDef = {
  name: 'flow_create',
  description: `Create a new flow in a project.
Use this to create new feature requests, bug reports, or tasks.
The flow starts in 'idea' state by default.

Requires a projectId (use project_list to find it) and a summary.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'The project ID this flow belongs to'
      },
      summary: {
        type: 'string',
        description: 'Brief summary/title of the flow'
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done'
      },
      flowType: {
        type: 'string',
        enum: ['feature', 'hotfix'],
        description: 'Type of flow (default: feature)'
      },
      acceptanceCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of acceptance criteria'
      }
    },
    required: ['summary']
  }
};

const flowUpdateDef = {
  name: 'flow_update',
  description: `Update a flow's state or submit deliverables.
Use this to:
- Change flow state (idea -> planning -> approval -> ready -> in_progress -> review -> done)
- Submit implementation plan for review
- Submit agent summary after implementation

agentStatus is automatically derived from your tool calls - you don't need to set it manually.

IMPORTANT: Some state transitions require mandatory fields:
- approval requires: implementationPlan
- review requires: agentSummary AND testingInstructions`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to update'
      },
      currentState: {
        type: 'string',
        enum: ['idea', 'planning', 'approval', 'ready', 'in_progress', 'review', 'done'],
        description: 'New state for the flow'
      },
      agentStatus: {
        type: 'string',
        enum: ['idle', 'analyzing', 'planning', 'implementing', 'testing', 'reviewing'],
        description: 'Override for agent status (normally auto-derived, only set if needed)'
      },
      agentMessage: {
        type: 'string',
        description: 'Override for agent message (normally auto-derived, only set if needed)'
      },
      acceptanceCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of acceptance criteria'
      },
      implementationPlan: {
        type: 'string',
        description: 'Markdown content of the implementation plan (required for approval state)'
      },
      agentSummary: {
        type: 'string',
        description: 'Agent summary after implementation (required for review state)'
      },
      testingInstructions: {
        type: 'string',
        description: 'Instructions for user testing (required for review state). Include what to test, expected behavior, and edge cases.'
      },
      commits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hash: { type: 'string', description: 'Git commit hash' },
            message: { type: 'string', description: 'Commit message' }
          },
          required: ['hash', 'message']
        },
        description: 'List of git commits to add to this flow. New commits are appended to existing ones. TIP: When transitioning to `review`, either include your docs commit(s) here in the same call, OR ensure you have previously registered docs commits on the flow — docsUpdate=5 will block review otherwise. For Git-Discipline 5, at least one commit must be visible on the flow (either in this call or persisted).'
      },
      branchName: {
        type: 'string',
        description: 'Git branch name for this flow (required at strictness 4+ when git is enabled)'
      },
      prUrl: {
        type: 'string',
        description: 'GitHub PR URL for this flow'
      },
      prNumber: {
        type: 'number',
        description: 'GitHub PR number for this flow'
      },
      prState: {
        type: 'string',
        enum: ['open', 'closed', 'merged'],
        description: 'GitHub PR state'
      }
    },
    required: ['flowId']
  }
};

const flowGetFeedbackDef = {
  name: 'flow_get_feedback',
  description: `Get user feedback for a flow.
Use this at the start of a session to check if the user has provided feedback on:
- The implementation plan (approval phase)
- The code implementation (review phase, when rejected back to in_progress)

If feedback exists, you should address it before continuing work.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to get feedback for'
      }
    },
    required: ['flowId']
  }
};

// ============ State Transition Guardrails (from config) ============

import { getConfig } from '../config/sync.js';
import { formatStrictnessLevel } from '../config/types.js';

// ============ Tool Handlers ============

async function handleFlowList(args: Record<string, unknown>): Promise<string> {
  const projectId = args.projectId as string | undefined;
  const state = args.state as string | undefined;

  const result = await devFlowClient.listFlows(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list flows'}`;
  }

  let flows = result.data;

  if (state) {
    flows = flows.filter(w => w.currentState === state);
  }

  const linkedProject = devFlowClient.getLinkedProjectName();
  const contextInfo = linkedProject
    ? `*Showing flows for project: ${linkedProject}*\n\n`
    : '';

  if (flows.length === 0) {
    return contextInfo + 'No flows found matching the criteria.';
  }

  return contextInfo + formatFlowList(flows);
}

async function handleFlowGet(args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const flowId = args.flowId as string;

  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `Error: Flow not found (tried exact and prefix match for "${flowId}")`;
  }

  const result = await devFlowClient.getFlow(resolvedId);
  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Flow not found'}`;
  }

  // Load attachments
  let attachments: FlowAttachment[] = [];
  try {
    const attResult = await devFlowClient.getAttachments(resolvedId);
    if (attResult.success && Array.isArray(attResult.data)) {
      attachments = attResult.data;
    }
  } catch {}

  // DF-208: load inline content for text/markdown attachments + image blocks
  const imageBlocks: ToolContentBlock[] = [];
  const inlineTextSections: string[] = [];
  const otherAttachments: FlowAttachment[] = [];
  let inlineBudgetRemaining = MAX_INLINE_TEXT_BYTES;

  for (const att of attachments) {
    const mime = att.mimeType || 'application/octet-stream';

    if (INLINE_TEXT_MIME.has(mime) && inlineBudgetRemaining > 0) {
      const contentResult = await devFlowClient.getAttachmentContent(resolvedId, att.id);
      if (contentResult.success && contentResult.text !== undefined) {
        const slice = contentResult.text.slice(0, inlineBudgetRemaining);
        const truncated = slice.length < contentResult.text.length;
        const lang = mime === 'text/markdown' ? 'markdown' : (mime === 'application/json' ? 'json' : (mime === 'text/html' ? 'html' : 'text'));
        inlineTextSections.push(
          `## Attachment: ${att.originalName}\n\n` +
          '```' + lang + '\n' + slice + (truncated ? '\n... [truncated]' : '') + '\n```'
        );
        inlineBudgetRemaining -= slice.length;
      } else {
        otherAttachments.push(att);
      }
    } else if (mime.startsWith(IMAGE_MIME_PREFIX) && att.fileSize <= MAX_IMAGE_BYTES) {
      const contentResult = await devFlowClient.getAttachmentContent(resolvedId, att.id);
      if (contentResult.success && contentResult.base64) {
        imageBlocks.push({ type: 'image', data: contentResult.base64, mimeType: contentResult.mimeType });
      } else {
        otherAttachments.push(att);
      }
    } else {
      otherAttachments.push(att);
    }
  }

  // DF-208: fetch TipTap-embedded images from descriptionJson as image blocks
  const flow = result.data;
  if (flow.descriptionJson) {
    const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
    const urls = extractImagesFromTipTap(flow.descriptionJson, baseUrl);
    for (const url of urls) {
      const imgResult = await devFlowClient.fetchBinaryAsBase64(url);
      if (imgResult.success && imgResult.base64) {
        imageBlocks.push({ type: 'image', data: imgResult.base64, mimeType: imgResult.mimeType });
      }
    }
  }

  // Build text response: flow detail + inline attachments + remaining attachment list
  let output = formatFlowDetail(flow, { skipEmbeddedImages: true });
  if (inlineTextSections.length > 0) {
    output += '\n\n' + inlineTextSections.join('\n\n');
  }
  if (otherAttachments.length > 0) {
    output += '\n\n' + formatAttachmentList(otherAttachments);
  }

  // If no images were loaded, keep backwards-compat: return string
  if (imageBlocks.length === 0) {
    return output;
  }

  // Return multi-content: text + image blocks
  return [{ type: 'text', text: output }, ...imageBlocks];
}

async function handleFlowCreate(args: Record<string, unknown>): Promise<string> {
  const projectId = args.projectId as string | undefined;
  const summary = args.summary as string;
  const description = args.description as string | undefined;
  const flowType = args.flowType as string | undefined;
  const acceptanceCriteria = args.acceptanceCriteria as string[] | undefined;

  // Use linked project if no projectId provided
  const effectiveProjectId = projectId || devFlowClient.getLinkedProjectId();
  if (!effectiveProjectId) {
    return 'Error: projectId ist erforderlich. Nutze project_list um die verfügbaren Projekte zu sehen, oder verknüpfe ein Projekt.';
  }

  const result = await devFlowClient.createFlow({
    projectId: effectiveProjectId,
    summary,
    description,
    flowType: flowType || 'feature',
    acceptanceCriteria,
  });

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to create flow'}`;
  }

  // Auto-init: set session context for the newly created flow
  const newFlow = result.data;
  const nextStep = NEXT_STEP_GUIDANCE[newFlow.currentState] || 'Beginne mit der Planung.';

  // Lock the flow
  await devFlowClient.updateFlow(newFlow.id, {
    agentStatus: 'analyzing',
    agentMessage: 'Neuer Flow erstellt',
  });

  // Create agent session
  let sessionId = 'local-session';
  try {
    const sessionResult = await devFlowClient.createAgentSession({
      flowId: newFlow.id,
      type: 'enforcement-v3',
    });
    if (sessionResult.success && sessionResult.data) {
      sessionId = sessionResult.data.id;
    }
  } catch {
    // Continue with local tracking
  }

  // Fetch allowedActions from backend (sole source of truth)
  let allowedActions: string[] = [];
  try {
    const nextStepResult = await devFlowClient.getNextStep(newFlow.id);
    if (nextStepResult.success && nextStepResult.data && Array.isArray(nextStepResult.data.allowedActions)) {
      allowedActions = nextStepResult.data.allowedActions as string[];
    }
  } catch {
    // Fall back to init response if next-step not available
  }
  if (allowedActions.length === 0) {
    // Minimal fallback: at least allow flow_update and flow_get for new flows
    allowedActions = ['flow_update', 'flow_get'];
  }

  sessionContext.init({
    flow: newFlow,
    sessionId,
    startedAt: new Date().toISOString(),
    feedback: null,
    tasks: [],
    allowedActions,
    nextStep,
  });

  return [
    'Flow erstellt und Session gestartet.',
    '',
    formatFlowDetail(newFlow),
    '',
    '---',
    `**Erlaubte Aktionen:** ${allowedActions.join(', ')}`,
    `**Naechster Schritt:** ${nextStep}`,
  ].join('\n');
}

async function handleFlowUpdate(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const currentState = args.currentState as Flow['currentState'] | undefined;
  const agentStatus = args.agentStatus as string | undefined;
  const agentMessage = args.agentMessage as string | undefined;
  const acceptanceCriteria = args.acceptanceCriteria as string[] | undefined;
  const implementationPlan = args.implementationPlan as string | undefined;
  const agentSummary = args.agentSummary as string | undefined;
  const testingInstructions = args.testingInstructions as string | undefined;
  const commits = args.commits as { hash: string; message: string }[] | undefined;
  const branchName = args.branchName as string | undefined;
  const prUrl = args.prUrl as string | undefined;
  const prNumber = args.prNumber as number | undefined;
  const prState = args.prState as string | undefined;

  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `Error: Flow not found (tried exact and prefix match for "${flowId}")`;
  }

  // Collect non-blocking warnings (shown after successful update)
  const warnings: string[] = [];

  // Guardrail: Check state transitions
  if (currentState) {
    const currentFlow = await devFlowClient.getFlow(resolvedId);
    // Note: blocked transitions are enforced by the backend pipeline gate system.
    // The MCP no longer maintains its own blockedTransitions map.

    // Check required fields for target state (from config, derived from strictness)
    const required = getConfig().requiredFields[currentState];
    if (required) {
      const allArgs = { implementationPlan, agentSummary, testingInstructions };
      const missing = required.fields.filter(f => !allArgs[f as keyof typeof allArgs]);
      if (missing.length > 0) {
        return `⛔ Pflichtfelder fehlen: ${missing.join(', ')}\n\n${required.message}`;
      }
    }

    // Strictness-based enforcement (beyond requiredFields)
    const strictness = getConfig().strictness;

    // Task tracking enforcement: check tasks exist before review
    if (currentState === 'review' && strictness.taskTracking >= 3) {
      try {
        const taskResult = await devFlowClient.listTasks(resolvedId);
        const tasks = taskResult.success ? taskResult.data || [] : [];
        if (tasks.length === 0) {
          if (strictness.taskTracking >= 4) {
            // Strict/Maximum: block transition
            return `⛔ Strictness ${formatStrictnessLevel(strictness.taskTracking)} erfordert mindestens einen Task.\nErstelle Tasks mit task_create() bevor du zu review wechselst.`;
          }
          // Balanced: warn but don't block
          warnings.push('⚠️ Keine Tasks angelegt. Bei Balanced-Strictness wird empfohlen, Tasks zu erstellen um die Arbeit nachvollziehbar zu machen.');
        }
        if (strictness.taskTracking >= 5) {
          const incomplete = tasks.filter(t => !t.isCompleted);
          if (incomplete.length > 0) {
            return `⛔ Strictness ${formatStrictnessLevel(strictness.taskTracking)} erfordert dass alle Tasks abgeschlossen sind.\n${incomplete.length} Task(s) noch offen: ${incomplete.map(t => t.summary).join(', ')}`;
          }
        }
      } catch {
        // Non-critical: skip task check on error
      }
    }

    // Docs update enforcement when transitioning to review
    if (currentState === 'review' && strictness.docsUpdate >= 3) {
      // Check if docs were already updated: commits with 'docs' in message, or doc_page_update in session logs
      const flowData = currentFlow.success ? currentFlow.data as unknown as Record<string, unknown> : null;
      const existingCommits = flowData?.commits
        ? (typeof flowData.commits === 'string' ? JSON.parse(flowData.commits as string) : flowData.commits) as { message: string }[]
        : [];
      const allCommits = [...existingCommits, ...(commits || [])];
      const hasDocsCommit = allCommits.some((c) =>
        /\bdocs?\b/i.test(c.message)
      );

      if (strictness.docsUpdate >= 5 && !hasDocsCommit) {
        return `⛔ Strictness ${formatStrictnessLevel(strictness.docsUpdate)} erfordert Docs-Update vor Review.\nPruefe und aktualisiere alle relevanten Docs (EN + DE). Nutze doc_page_list() und doc_page_update() um betroffene Seiten zu finden und zu aktualisieren.\nAlternativ: Committe Docs-Aenderungen mit 'docs' im Commit-Message.`;
      }
      if (!hasDocsCommit) {
        warnings.push('📖 Docs-Hinweis: Pruefe ob Dokumentation aktualisiert werden muss. Nutze doc_page_list() oder committe Docs-Aenderungen.');
      }
    }

    // Git discipline enforcement: check branch/commits before review (only when git is enabled)
    const gitEnabled = getConfig().gitEnabled;
    if (currentState === 'review' && gitEnabled && strictness.gitDiscipline >= 4) {
      if (currentFlow.success && currentFlow.data) {
        if (!currentFlow.data.branchName && !branchName) {
          return `⛔ Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} erfordert einen Branch.\nMelde den Branch mit flow_update({ branchName: "..." }) bevor du zu review wechselst.`;
        }
      }
      if (strictness.gitDiscipline >= 5) {
        if (!prUrl && !currentFlow.data?.prUrl) {
          return `⛔ Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} erfordert eine PR-URL.\nErstelle eine PR und melde sie mit flow_update({ prUrl: "...", currentState: "review" }).`;
        }
        // Check that commits are reported — either in this call, or previously persisted on the flow.
        const persistedCommits = currentFlow.data?.commits ?? [];
        const totalCommits = [...persistedCommits, ...(commits || [])];
        if (totalCommits.length === 0) {
          return `⛔ Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} erfordert Commits.\nMelde Commits mit flow_update({ commits: [{ hash: "...", message: "..." }] }) — idealerweise im selben Call wie die Review-Transition.`;
        }
      }
    }
  }

  // Build clean update object
  // Markdown fields: convert escaped \n to real newlines (MCP protocol may escape them)
  const cleanUpdate: Record<string, unknown> = {};
  if (currentState) cleanUpdate.currentState = currentState;
  if (agentStatus) cleanUpdate.agentStatus = agentStatus;
  if (agentMessage) cleanUpdate.agentMessage = agentMessage;
  if (acceptanceCriteria) cleanUpdate.acceptanceCriteria = acceptanceCriteria;
  if (implementationPlan) cleanUpdate.implementationPlan = implementationPlan.replace(/\\n/g, '\n');
  if (agentSummary) cleanUpdate.agentSummary = agentSummary.replace(/\\n/g, '\n');
  if (testingInstructions) cleanUpdate.testingInstructions = testingInstructions.replace(/\\n/g, '\n');
  if (branchName) cleanUpdate.branchName = branchName;
  if (commits) cleanUpdate.commits = commits;
  if (prUrl) cleanUpdate.prUrl = prUrl;
  if (prNumber) cleanUpdate.prNumber = prNumber;
  if (prState) cleanUpdate.prState = prState;

  const result = await devFlowClient.updateFlow(resolvedId, cleanUpdate);

  // If an implementation plan was submitted, also upload it as a markdown attachment.
  // This gives the user a rendered markdown view in the UI instead of a plain text field.
  if (implementationPlan && result.success) {
    try {
      await devFlowClient.uploadAttachment(
        resolvedId,
        'implementation-plan.md',
        implementationPlan.replace(/\\n/g, '\n'),
        'text/markdown'
      );
    } catch {
      // Non-critical: plan is still saved as text via updateFlow
    }
  }

  if (!result.success || !result.data) {
    // Handle 403 gate blocked response
    if (result.statusCode === 403 && result.gate) {
      return [
        `⛔ Gate blocked: Step '${result.gate.pipelineStep}' requires human action.`,
        '',
        `Executor: ${result.gate.executor}`,
        result.gate.reason || '',
        '',
        'Wait for the user to proceed in DevFlow UI.',
        'Do NOT retry this transition.',
      ].filter(Boolean).join('\n');
    }
    return `Error: ${result.error || 'Failed to update flow'}`;
  }

  // Context integration: refresh session after successful update
  if (sessionContext.isActive() && sessionContext.getFlowId() === resolvedId) {
    const updatedFlow = result.data!;
    sessionContext.updateFlow(updatedFlow);

    // Re-fetch allowedActions from backend after state change
    try {
      const nextStepResult = await devFlowClient.getNextStep(resolvedId);
      if (nextStepResult.success && nextStepResult.data && Array.isArray(nextStepResult.data.allowedActions)) {
        sessionContext.updateAllowedActions(nextStepResult.data.allowedActions as string[]);
        sessionContext.update({
          stepKind: (nextStepResult.data.kind as string) || null,
          transitionPolicy: (nextStepResult.data.transitionPolicy as string) || null,
          pipelineStep: (nextStepResult.data.pipelineStep as string) || null,
        });
      }
    } catch {
      // Non-critical: keep existing allowedActions if refresh fails
    }

    const newState = updatedFlow.currentState;

    // Auto-complete session on review/wait/done states
    if (['approval', 'review', 'done'].includes(newState)) {
      const sessionId = sessionContext.get()?.sessionId;
      if (sessionId && sessionId !== 'local-session') {
        const summaryMap: Record<string, string> = {
          approval: 'Plan eingereicht, warte auf Freigabe',
          review: 'Self-Review abgeschlossen, warte auf User-Review',
          done: 'Flow abgeschlossen',
        };
        devFlowClient.completeAgentSession(sessionId, {
          summary: summaryMap[newState] || 'Session beendet',
        }).catch(() => {});
      }

      const guidance = NEXT_STEP_GUIDANCE[newState] || '';
      const reinitHint = newState === 'approval'
        ? `\n\n**Nach Genehmigung:** Rufe \`devflow_init({ flowId: "${resolvedId}" })\` auf — der Auto-Advance von ready → in_progress passiert dort automatisch.`
        : '';
      const warningBlock = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : '';
      return `Flow updated successfully.\n\n${formatFlowDetail(updatedFlow)}\n\n---\n**Naechster Schritt:** ${guidance}${reinitHint}${warningBlock}`;
    }
  }

  // For any state change not caught above, add devflow_init reminder
  const warningBlock = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : '';
  const reinitHint = currentState
    ? `\n\n---\n**WICHTIG:** State hat sich geändert. Rufe jetzt \`devflow_init({ flowId: "${resolvedId}" })\` auf um den nächsten Pipeline-Step und die erlaubten Aktionen zu erhalten.`
    : '';
  return `Flow updated successfully.\n\n${formatFlowDetail(result.data)}${reinitHint}${warningBlock}`;
}

async function handleFlowGetFeedback(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;

  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `Error: Flow not found (tried exact and prefix match for "${flowId}")`;
  }

  const result = await devFlowClient.getFlowFeedback(resolvedId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to get feedback'}`;
  }

  const { planFeedback, codeFeedback, feedbackAt } = result.data;

  if (!planFeedback && !codeFeedback) {
    return 'No feedback pending. You can proceed with your work.';
  }

  const lines = ['# Pending Feedback\n'];

  if (planFeedback) {
    lines.push('## Plan Feedback');
    lines.push('The user has requested changes to the implementation plan:\n');
    lines.push(planFeedback);
    lines.push('\nPlease revise the plan accordingly before proceeding.\n');
  }

  if (codeFeedback) {
    lines.push('## Code Feedback');
    lines.push('The user has provided feedback on the implementation:\n');
    lines.push(codeFeedback);
    lines.push('\nPlease address these points before completing the flow.\n');
  }

  if (feedbackAt) {
    lines.push(`*Feedback provided: ${new Date(feedbackAt).toLocaleString()}*`);
  }

  return lines.join('\n');
}

// ============ Formatters ============

function formatFlowList(flows: Flow[]): string {
  const lines = ['# Flows\n'];

  const byState: Record<string, Flow[]> = {
    idea: [], planning: [], approval: [], ready: [],
    in_progress: [], review: [], done: []
  };

  for (const w of flows) {
    byState[w.currentState]?.push(w);
  }

  for (const [state, wfs] of Object.entries(byState)) {
    if (wfs.length === 0) continue;

    const emoji: Record<string, string> = {
      idea: '💡', planning: '📋', approval: '🔒', ready: '▶️',
      in_progress: '🔨', review: '🔍', done: '✅'
    };

    const stateLabels: Record<string, string> = {
      idea: 'Idea', planning: 'Planning', approval: 'Approval', ready: 'Ready',
      in_progress: 'In Progress', review: 'Review', done: 'Done'
    };
    const label = stateLabels[state] || state.charAt(0).toUpperCase() + state.slice(1);

    lines.push(`## ${emoji[state] || '📌'} ${label} (${wfs.length})\n`);

    for (const w of wfs) {
      const displayId = w.displayId ? `**${w.displayId}**` : `**${w.id}**`;
      const ticket = w.ticketKey ? `[${w.ticketKey}] ` : '';
      const assignee = w.assigneeName ? ` → @${w.assigneeName}` : '';
      const lockInfo = (w.agentStatus && w.agentStatus !== 'idle')
        ? ` [🔒 ${w.agentStatus}]`
        : ' (frei)';
      lines.push(`- ${displayId}: ${ticket}${w.summary}${assignee}${lockInfo}`);
      if (w.agentMessage) {
        lines.push(`  └─ ${w.agentMessage}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatFlowDetail(flow: Flow, opts: { skipEmbeddedImages?: boolean } = {}): string {
  const lines = [
    `# Flow: ${flow.summary}`,
    '',
    `**ID:** ${flow.id}`,
  ];

  if (flow.displayId) {
    lines.push(`**Display-ID:** ${flow.displayId}`);
  }

  lines.push(`**State:** ${flow.currentState}`);

  if (flow.assigneeName) {
    lines.push(`**Assignee:** @${flow.assigneeName}`);
  }

  if (flow.ticketKey) {
    lines.push(`**Ticket:** ${flow.ticketKey}`);
  }

  if (flow.agentStatus) {
    lines.push(`**Agent Status:** ${flow.agentStatus}`);
    if (flow.agentMessage) {
      lines.push(`**Agent Message:** ${flow.agentMessage}`);
    }
  }

  lines.push('');

  if (flow.description) {
    lines.push('## Description\n');
    lines.push(flow.description);
    lines.push('');
  }

  // Extract embedded images from TipTap JSON (URL-list fallback when image-blocks aren't used)
  if (flow.descriptionJson && !opts.skipEmbeddedImages) {
    const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
    const images = extractImagesFromTipTap(flow.descriptionJson, baseUrl);
    if (images.length > 0) {
      lines.push('## Embedded Images\n');
      for (const url of images) {
        lines.push(`- ![image](${url})`);
      }
      lines.push('');
    }
  }

  if (flow.acceptanceCriteria && flow.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria\n');
    for (const criterion of flow.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');
  }

  // Show feedback if any
  if (flow.planFeedback) {
    lines.push('## Plan Feedback (from user)\n');
    lines.push(flow.planFeedback);
    lines.push('');
  }

  if (flow.codeFeedback) {
    lines.push('## Code Feedback (from user)\n');
    lines.push(flow.codeFeedback);
    lines.push('');
  }

  // Show full implementation plan (not truncated!)
  if (flow.implementationPlan) {
    lines.push('## Implementation Plan\n');
    lines.push(flow.implementationPlan);
    lines.push('');
  }

  // Show agent summary
  if (flow.agentSummary) {
    lines.push('## Agent Summary\n');
    lines.push(flow.agentSummary);
    lines.push('');
  }

  // Show testing instructions
  if (flow.testingInstructions) {
    lines.push('## Testing Instructions\n');
    lines.push(flow.testingInstructions);
    lines.push('');
  }

  // Audit trail
  const auditLines: string[] = [];
  if (flow.planCreatedBy) {
    const at = flow.planCreatedAt ? ` (${new Date(flow.planCreatedAt).toLocaleString()})` : '';
    auditLines.push(`- **Plan erstellt von:** ${flow.planCreatedBy}${at}`);
  }
  if (flow.planApprovedBy) {
    const at = flow.planApprovedAt ? ` (${new Date(flow.planApprovedAt).toLocaleString()})` : '';
    auditLines.push(`- **Plan genehmigt von:** ${flow.planApprovedBy}${at}`);
  }
  if (flow.codeApprovedBy) {
    const at = flow.codeApprovedAt ? ` (${new Date(flow.codeApprovedAt).toLocaleString()})` : '';
    auditLines.push(`- **Code genehmigt von:** ${flow.codeApprovedBy}${at}`);
  }
  if (auditLines.length > 0) {
    lines.push('## Audit\n');
    lines.push(...auditLines);
    lines.push('');
  }

  lines.push(`**Created:** ${new Date(flow.createdAt).toLocaleString()}`);
  if (flow.completedAt) {
    lines.push(`**Completed:** ${new Date(flow.completedAt).toLocaleString()}`);
  }

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  flow_list: {
    definition: flowListDef,
    handler: withErrorHandling('flow_list', handleFlowList),
  },
  flow_get: {
    definition: flowGetDef,
    handler: withErrorHandling('flow_get', handleFlowGet),
  },
  flow_create: {
    definition: flowCreateDef,
    handler: withErrorHandling('flow_create', handleFlowCreate),
  },
  flow_update: {
    definition: flowUpdateDef,
    handler: withErrorHandling('flow_update', handleFlowUpdate),
  },
  flow_get_feedback: {
    definition: flowGetFeedbackDef,
    handler: withErrorHandling('flow_get_feedback', handleFlowGetFeedback),
  },
};
