/**
 * Flow MCP Tools
 * Tools for listing, getting, creating, and updating flows in DevFlow
 */

import { devFlowClient, type Flow, type FlowAttachment, type FlowDiscussionComment } from '../api/client.js';
import type { ToolContentBlock, ToolHandlerResult, ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';
import { sessionContext } from '../context/session.js';
import { getGuidanceFor } from '../context/permissions.js';
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

/**
 * DF-432 — Pure renderer for backend 409 gate.failures[] responses (DF-374 shape).
 * Exported for unit-tests.
 *
 * Pre-DF-432 the plugin only handled the DF-292 / 403 self-approval shape and
 * the modern unified-gate 409 fell through to a generic `Error: ${msg}` — the
 * per-failure reason + hint were silently dropped. This renderer keeps them
 * front-and-center.
 *
 * Input shape (DF-374):
 *   {
 *     transition?: 'in_progress→review',
 *     failures: [{
 *       conditionId: string,
 *       label?: string,
 *       reason: string,
 *       hint?: string | null,
 *       openTasks?: [{id, text}],
 *       pendingDrafts?: any[],
 *       validationErrors?: any[],
 *     }],
 *     autoFixed?: string[],
 *   }
 */
export function renderGateFailures(
  gate: {
    transition?: string;
    failures?: Array<{
      conditionId: string;
      label?: string;
      reason: string;
      hint?: string | null;
      openTasks?: Array<{ id: string; text: string }>;
      pendingDrafts?: unknown[];
      validationErrors?: unknown[];
    }>;
    autoFixed?: string[];
  },
  topLevelError?: string
): string {
  const failures = gate?.failures || [];
  const transitionLabel = gate?.transition ? `transition '${gate.transition}'` : 'this transition';
  const lines: string[] = [
    `⛔ Gate blocked: ${failures.length} condition${failures.length === 1 ? '' : 's'} failed for ${transitionLabel}.`,
    '',
  ];
  for (const f of failures) {
    lines.push(`• **${f.label || f.conditionId}**`);
    lines.push(`  - reason: \`${f.reason}\``);
    if (f.hint) lines.push(`  - hint: ${f.hint}`);
    if (f.openTasks && f.openTasks.length > 0) {
      const tasks = f.openTasks.map(t => t.text).join(', ');
      lines.push(`  - open tasks: ${tasks}`);
    }
    if (f.validationErrors && f.validationErrors.length > 0) {
      lines.push(`  - validation errors: ${JSON.stringify(f.validationErrors)}`);
    }
    if (f.pendingDrafts && f.pendingDrafts.length > 0) {
      lines.push(`  - ${f.pendingDrafts.length} pending knowledge-draft(s) need a decision`);
    }
    lines.push('');
  }
  if (gate?.autoFixed && gate.autoFixed.length > 0) {
    lines.push(`✓ Auto-fixed by backend: ${gate.autoFixed.join(', ')}`);
    lines.push('');
  }
  if (topLevelError && topLevelError !== `Gate blocked: ${failures.length} condition${failures.length === 1 ? '' : 's'} failed`) {
    // Single-failure hint that the backend surfaces as the top-level error (DF-374).
    lines.push(`Backend message: ${topLevelError}`);
  }
  return lines.join('\n').trimEnd();
}

// ============ Tool Definitions ============

const flowListDef = {
  name: 'flow_list',
  description: `List flows as a Markdown table (ID | State | Assignee | Titel).

Conventions enforced uniformly across the plugin (skill: devflow-flow-display):
- ⭐ prefix marks flows assigned to / created by the current user
- 🔒 marks active agent sessions; idle flows have no lock-marker
- Done-flows are hidden by default (focus on open work). Pass includeDone=true to see them.
- Order matches the browser FlowsPage default (kanban_sort_order ASC for project-scope, updated_at DESC for cross-project).

Use this to find flows to work on or to brief the user on the backlog.`,
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
      },
      mine: {
        type: 'boolean',
        description: 'If true, only return flows assigned to / created by the current user.'
      },
      includeDone: {
        type: 'boolean',
        description: 'If true, include done-flows. Default: false (open backlog only).'
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

DF-378 — Valid metadata triple required:
  - summary: short one-line title, 3..80 characters (NOT a paragraph)
  - description: detailed body, ≥ 30 characters (the goal, motivation, constraints)
  - acceptanceCriteria: at least 1 testable success criterion, each ≥ 10 characters

If your text is long, put the title into \`summary\` (≤ 80 chars) and the body into \`description\`.
The backend rejects payloads that violate these limits with a structured 400 \`flow_input_invalid\`.

Requires a projectId (use project_list to find it).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'The project ID this flow belongs to'
      },
      summary: {
        type: 'string',
        description: 'Brief one-line title (3..80 chars). Long text belongs in `description`, not here.'
      },
      description: {
        type: 'string',
        description: 'Detailed body explaining the goal, motivation, and constraints (≥ 30 chars).'
      },
      flowType: {
        type: 'string',
        enum: ['feature', 'hotfix'],
        description: 'Type of flow (default: feature)'
      },
      acceptanceCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of acceptance criteria (≥ 1 item, each ≥ 10 chars).'
      }
    },
    required: ['summary', 'description', 'acceptanceCriteria']
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
      },
      // DF-292 — agent_with_discipline self-approval. When the project has
      // allow_agent_self_approval=ON and the active step requires discipline-
      // tokens, pass selfApproved + the signed tokens to satisfy the gate.
      selfApproved: {
        type: 'boolean',
        description: "DF-292 — set to true to claim this transition under 'agent_with_discipline' policy. Must be combined with disciplineTokens."
      },
      disciplineTokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'DF-292 — signed HMAC tokens (one per required skill) returned by devflow_token_emit. Backend verifies all required tokens before allowing the transition.'
      },
      // DF-435 evidence fields — the backend derives discipline-tokens from
      // these automatically. Without the passthrough the adr-compliance gate
      // rejects review→done with `files_changed_missing_with_git_enabled`
      // (engine runs got stuck for 5 iterations on exactly this).
      filesChanged: {
        type: 'array',
        items: { type: 'string' },
        description: 'Repo-relative paths changed by this flow (e.g. from `git diff --name-only origin/main...HEAD`). Required by the adr-compliance gate on review→done when git is enabled.'
      },
      testStrategy: {
        type: 'string',
        description: 'DF-435 — evidence for devflow-tdd/verification: how the change was tested (commands + results).'
      },
      acVerification: {
        type: 'array',
        items: { type: 'object' },
        description: 'DF-435 — per-AC verification evidence: [{acId, status, evidence}].'
      },
      planReconciliation: {
        type: 'object',
        description: 'DF-435 — plan-vs-reality reconciliation: { perAcStatus: [{acId, status}, ...] }.'
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
  const mineOnly = args.mine === true;
  const includeDone = args.includeDone === true;

  const result = await devFlowClient.listFlows(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list flows'}`;
  }

  let flows = result.data;

  if (state) {
    flows = flows.filter(w => w.currentState === state);
  }

  if (mineOnly) {
    flows = flows.filter(w => w.isMine === true);
  }

  const linkedProject = devFlowClient.getLinkedProjectName();
  const contextInfo = linkedProject
    ? `*Showing flows for project: ${linkedProject}*\n\n`
    : '';

  if (flows.length === 0) {
    return contextInfo + 'No flows found matching the criteria.';
  }

  return contextInfo + formatFlowList(flows, { includeDone });
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

  // DF-332: load comments / discussion thread (parallel-friendly, but kept after image
  // fetching so we don't double the latency on flows with embedded images)
  let discussionSection = '';
  try {
    const commentsResult = await devFlowClient.listFlowComments(resolvedId);
    if (commentsResult.success && Array.isArray(commentsResult.data)) {
      discussionSection = formatDiscussionSection(commentsResult.data);
    }
  } catch { /* discussion is best-effort context, never block flow_get */ }

  // Build text response: flow detail + inline attachments + remaining attachment list + discussion
  let output = formatFlowDetail(flow, { skipEmbeddedImages: true });
  if (inlineTextSections.length > 0) {
    output += '\n\n' + inlineTextSections.join('\n\n');
  }
  if (otherAttachments.length > 0) {
    output += '\n\n' + formatAttachmentList(otherAttachments);
  }
  if (discussionSection) {
    output += '\n\n' + discussionSection;
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
  const nextStep = getGuidanceFor(newFlow.currentState) || 'Beginne mit der Planung.';

  // Anlegen heißt nicht arbeiten (DF-532).
  //
  // Hier stand vorher zweierlei, das beides so tat, als würde bereits an dem
  // neuen Flow gearbeitet:
  //
  // 1. `agentStatus: 'analyzing'` — dadurch erschien ein frisch angelegter
  //    Flow in `flow_list` als gesperrt (🔒), obwohl niemand ihn angefasst
  //    hatte. Ein solcher Status hat andernorts schon einen Vorgang
  //    zweieinhalb Wochen lang als belegt angezeigt.
  //
  // 2. `createAgentSession` — und das war das teurere: Das Backend verdrängt
  //    beim Anlegen einer Sitzung die laufende Sitzung. Wer also während einer
  //    fremden Prüfsitzung eine Auffälligkeit als Flow festhielt, zerstörte
  //    damit deren Nachweis. Gemessen am 17.08.2026: Eine Abnehmer-Sitzung
  //    stand danach auf `abandoned` mit null Protokolleinträgen — die
  //    Prüfarbeit hatte stattgefunden, nur ihr Beleg war weg. Und die
  //    Antwort meldete dazu nichts, sondern schrieb „Session gestartet".
  //
  // Ein Flow in `idea` braucht keine Sitzung. Wer an ihm arbeiten will, ruft
  // `devflow_init` — das legt eine an und sagt auch, wenn es dabei eine
  // andere verdrängt.
  await devFlowClient.updateFlow(newFlow.id, {
    agentStatus: 'idle',
    agentMessage: 'Neuer Flow erstellt',
  });

  const sessionId = 'local-session';

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
    // Sagt jetzt, was wirklich passiert ist (DF-532): angelegt, nicht
    // begonnen. Der alte Satz behauptete eine Sitzung, die eine fremde
    // verdrängt hatte — die Antwort log über ihre eigene Nebenwirkung.
    'Flow erstellt. Zum Arbeiten: devflow_init({ flowId }) — eine laufende Sitzung an einem anderen Vorgang bleibt davon unberührt.',
    '',
    formatFlowDetail(newFlow),
    '',
    '---',
    `**Erlaubte Aktionen:** ${allowedActions.join(', ')}`,
    `**Naechster Schritt:** ${nextStep}`,
  ].join('\n');
}

export async function handleFlowUpdate(args: Record<string, unknown>): Promise<string> {
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
  // DF-292 — agent_with_discipline self-approval
  const selfApproved = args.selfApproved as boolean | undefined;
  const disciplineTokens = args.disciplineTokens as string[] | undefined;
  // DF-435 evidence passthrough (fixes files_changed_missing_with_git_enabled on review→done)
  const filesChanged = args.filesChanged as string[] | undefined;
  const testStrategy = args.testStrategy as string | undefined;
  const acVerification = args.acVerification as unknown[] | undefined;
  const planReconciliation = args.planReconciliation as Record<string, unknown> | undefined;

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

    // DF-377 — Client-side strictness checks are now informational warnings only.
    // The DevFlow backend (DF-374 unified flow-gate service) is the authoritative
    // gate for state transitions. The plugin still surfaces hints so the agent
    // gets immediate feedback, but it no longer hard-blocks — the backend's 409
    // response is the source of truth.

    // Task tracking — informational
    if (currentState === 'review' && strictness.taskTracking >= 3) {
      try {
        const taskResult = await devFlowClient.listTasks(resolvedId);
        const tasks = taskResult.success ? taskResult.data || [] : [];
        if (tasks.length === 0) {
          warnings.push(`📋 Strictness ${formatStrictnessLevel(strictness.taskTracking)} suggests creating tasks. Use task_create() — the backend may also block if project_configs.task_enforcement='gate'.`);
        }
        if (strictness.taskTracking >= 5) {
          const incomplete = tasks.filter(t => !t.isCompleted);
          if (incomplete.length > 0) {
            warnings.push(`📋 ${incomplete.length} task(s) still open: ${incomplete.map(t => t.summary).join(', ')}. Strictness ${formatStrictnessLevel(strictness.taskTracking)} suggests completing them before review.`);
          }
        }
      } catch {
        // Non-critical: skip task check on error
      }
    }

    // Docs update — informational
    if (currentState === 'review' && strictness.docsUpdate >= 3) {
      const flowData = currentFlow.success ? currentFlow.data as unknown as Record<string, unknown> : null;
      const existingCommits = flowData?.commits
        ? (typeof flowData.commits === 'string' ? JSON.parse(flowData.commits as string) : flowData.commits) as { message: string }[]
        : [];
      const allCommits = [...existingCommits, ...(commits || [])];
      const hasDocsCommit = allCommits.some((c) =>
        /\bdocs?\b/i.test(c.message)
      );

      if (!hasDocsCommit) {
        warnings.push(`📖 Strictness ${formatStrictnessLevel(strictness.docsUpdate)} suggests a docs update. Use doc_page_list() / doc_page_update(), or commit with 'docs' in the message. The backend may also block at Strictness 5.`);
      }
    }

    // Git discipline — informational
    const gitEnabled = getConfig().gitEnabled;
    if (currentState === 'review' && gitEnabled && strictness.gitDiscipline >= 4) {
      if (currentFlow.success && currentFlow.data) {
        if (!currentFlow.data.branchName && !branchName) {
          warnings.push(`🌿 Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} suggests reporting a branch via flow_update({ branchName }).`);
        }
      }
      if (strictness.gitDiscipline >= 5) {
        if (!prUrl && !currentFlow.data?.prUrl) {
          warnings.push(`🔗 Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} suggests a PR URL. Create the PR and report it via flow_update({ prUrl }).`);
        }
        const persistedCommits = currentFlow.data?.commits ?? [];
        const totalCommits = [...persistedCommits, ...(commits || [])];
        if (totalCommits.length === 0) {
          warnings.push(`📦 Strictness ${formatStrictnessLevel(strictness.gitDiscipline)} suggests reporting commits via flow_update({ commits }) — ideally in the same call as the review transition.`);
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
  // DF-292 — agent_with_discipline self-approval fields
  if (selfApproved !== undefined) cleanUpdate.selfApproved = selfApproved;
  if (disciplineTokens) cleanUpdate.disciplineTokens = disciplineTokens;
  // DF-435 evidence passthrough — backend derives discipline-tokens from these
  if (filesChanged) cleanUpdate.filesChanged = filesChanged;
  if (testStrategy) cleanUpdate.testStrategy = testStrategy;
  if (acVerification) cleanUpdate.acVerification = acVerification;
  if (planReconciliation) cleanUpdate.planReconciliation = planReconciliation;

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
    // Handle 403 gate blocked response (DF-292 self-approval shape).
    // DF-434 — branch on gate.reason. The old code told the agent "requires human
    // action / wait / do NOT retry" for EVERY 403, even when the gate was actionable
    // (missing discipline-tokens). That is exactly why self-approval silently fell
    // back to manual UI approval: the agent was told to give up instead of emitting
    // the tokens it was missing. Only human_required (Self-Approval OFF) is a real wait.
    if (result.statusCode === 403 && result.gate) {
      const gate = result.gate as any;
      const reason: string = gate.reason || '';
      const step: string = gate.pipelineStep || 'transition';

      // Actionable — discipline-tokens missing or their evidence is invalid.
      if (reason === 'discipline_incomplete' || reason === 'discipline_token_evidence_invalid') {
        const required: string[] = Array.isArray(gate.requiredSkills) ? gate.requiredSkills : [];
        const missing: string[] = Array.isArray(gate.missing) && gate.missing.length ? gate.missing : required;
        return [
          `🔐 Self-approval gate for step '${step}': discipline-tokens incomplete — this is YOUR action, do not wait for the user.`,
          '',
          missing.length ? `Missing token(s): ${missing.join(', ')}` : '',
          required.length ? `Required skills: ${required.join(', ')}` : '',
          '',
          gate.hint || 'Emit a token for each missing skill via devflow_token_emit({ flowId, skillName, evidence }), then retry flow_update with selfApproved=true and disciplineTokens=[…].',
        ].filter(Boolean).join('\n');
      }

      // Actionable — the agent must explicitly claim self-approval.
      if (reason === 'selfApproved flag required to claim agent self-approval') {
        return [
          `🔐 Self-approval gate for step '${step}': you must claim self-approval explicitly.`,
          '',
          'Emit the required discipline-tokens, then call flow_update({ currentState, selfApproved: true, disciplineTokens: [...] }). Do not wait for the user.',
        ].join('\n');
      }

      // Not actionable by the agent — Self-Approval is OFF, or a genuine human-only gate.
      if (reason === 'human_required' || /allow_agent_self_approval=0/.test(reason)) {
        return [
          `⛔ Gate blocked at step '${step}': human approval required.`,
          '',
          gate.userMessage || reason || '',
          '',
          'Show this to the user and stop — Self-Approval is OFF for this project (Settings → General). Do NOT retry.',
        ].filter(Boolean).join('\n');
      }

      // Fallback for any other 403 gate shape.
      return [
        `⛔ Gate blocked at step '${step}'.`,
        '',
        reason || 'This transition requires action before it can proceed.',
        gate.hint || '',
      ].filter(Boolean).join('\n');
    }
    // DF-432 — Handle 409 unified-gate response (DF-374 shape with gate.failures[])
    // Pre-fix: this fell through to the generic Error string and the agent lost
    // all per-failure reason/hint information. Render each failure as a bullet
    // with its hint so the agent knows exactly what to fix.
    if (result.statusCode === 409 && (result as any).gate?.failures) {
      return renderGateFailures((result as any).gate, result.error);
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

    // Auto-complete session on review/wait/done states.
    // DF-436 — NOT under agent_with_discipline (except done): there the agent
    // keeps working (self-approval); completing the session mid-flight made
    // the backend treat follow-up calls as human (gate bypass + audit gap).
    if (['approval', 'review', 'done'].includes(newState)) {
      const sessionId = sessionContext.get()?.sessionId;
      const currentPolicy = sessionContext.get()?.transitionPolicy;
      if (
        sessionId &&
        sessionId !== 'local-session' &&
        shouldAutoCompleteSession(newState, currentPolicy)
      ) {
        const summaryMap: Record<string, string> = {
          approval: 'Plan eingereicht, warte auf Freigabe',
          review: 'Self-Review abgeschlossen, warte auf User-Review',
          done: 'Flow abgeschlossen',
        };
        devFlowClient.completeAgentSession(sessionId, {
          summary: summaryMap[newState] || 'Session beendet',
        })
          .then(() => {
            // DF-436 — stop sending the completed session's header; the
            // backend treats any X-Agent-Session as agent (fail-closed), but
            // a stale header is misleading in logs/audit.
            devFlowClient.setAgentSessionId(null);
          })
          .catch(() => {});
      }

      // DF-437 — policy-aware: no 'Warte auf User' when the step runs under
      // agent_with_discipline; the agent is told to self-approve instead.
      const guidance = getGuidanceFor(newState, sessionContext.get()?.transitionPolicy) || '';
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

/**
 * DF-329 — Uniform flow-list rendering for the plugin.
 *
 * Iron Laws (enforced by `devflow-flow-display` skill):
 *   1. Markdown table with columns: ID | State | Assignee | Titel
 *   2. Own flows (isMine=true) get ⭐ prefix on the ID
 *   3. Active sessions get 🔒, idle = no marker (replaces noisy „(frei)")
 *   4. Done-flows hidden by default — backlog focus is on open work
 *
 * Pass `includeDone: true` if the caller explicitly wants them.
 */
function formatFlowList(flows: Flow[], opts: { includeDone?: boolean } = {}): string {
  const stateEmoji: Record<string, string> = {
    idea: '💡', planning: '📋', approval: '🔒', ready: '▶️',
    in_progress: '🔨', review: '🔍', done: '✅'
  };
  const stateOrder = ['idea', 'planning', 'approval', 'ready', 'in_progress', 'review', 'done'];

  // DF-329 IL#4: only open flows by default
  const visible = opts.includeDone ? flows : flows.filter(f => f.currentState !== 'done');

  // Sort: state-priority, then preserve incoming order (which is backend's
  // kanban_sort_order ASC / updated_at DESC depending on scope)
  const sorted = [...visible].sort((a, b) =>
    stateOrder.indexOf(a.currentState) - stateOrder.indexOf(b.currentState)
  );

  if (sorted.length === 0) {
    return '# Flows\n\n*No open flows. Use `flow_create` to start one, or pass `includeDone: true` to see archived work.*\n';
  }

  const lines = ['# Flows\n'];
  lines.push('| ID | State | Assignee | Titel |');
  lines.push('|---|---|---|---|');

  for (const w of sorted) {
    const idLabel = w.displayId || w.id;
    // DF-329 IL#2: ⭐ for own flows
    const id = w.isMine ? `⭐ **${idLabel}**` : `**${idLabel}**`;

    const stateLabel = `${stateEmoji[w.currentState] || ''} ${w.currentState}`.trim();

    // DF-329 IL#3: assignee separate from lock-status
    const assigneeName = w.assignee?.name || w.assigneeName || '—';
    const lockSuffix = w.agentStatus && w.agentStatus !== 'idle' ? ' 🔒' : '';
    const assignee = `${assigneeName}${lockSuffix}`;

    const ticket = w.ticketKey ? `[${w.ticketKey}] ` : '';
    // Pipe-escape the title in case it contains the column separator
    const title = `${ticket}${w.summary}`.replace(/\|/g, '\\|');

    lines.push(`| ${id} | ${stateLabel} | ${assignee} | ${title} |`);
  }

  return lines.join('\n') + '\n';
}

/**
 * DF-332 — Render the flow's comments/discussion thread as a Markdown section.
 *
 * Returns empty string when there are no live comments (deletedAt is set on
 * tombstoned comments — those are skipped to keep the agent's context focused
 * on what's still actionable).
 *
 * Format per comment:
 *   **@username (Display Name)** · 2026-05-06T08:30:12 [✓ resolved]
 *   > body line 1
 *   > body line 2
 */
function formatDiscussionSection(comments: FlowDiscussionComment[]): string {
  const live = comments.filter(c => !c.deletedAt);
  if (live.length === 0) return '';

  const lines: string[] = [`## Discussion (${live.length})`, ''];

  // Sort by createdAt asc — chronological reading
  const sorted = [...live].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  for (const c of sorted) {
    const username = c.author?.username || c.authorId;
    const display = c.author?.displayName ? ` (${c.author.displayName})` : '';
    const ts = c.createdAt ? c.createdAt.replace(/\.\d{3}Z$/, 'Z') : '';
    const resolved = c.resolvedAt ? ' [✓ resolved]' : '';

    lines.push(`**@${username}${display}** · ${ts}${resolved}`);
    lines.push('');
    // Quote body — handle multi-line + empty body
    const body = (c.body || '').trim();
    if (body) {
      for (const bodyLine of body.split('\n')) {
        lines.push(`> ${bodyLine}`);
      }
    } else {
      lines.push('> *(empty)*');
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
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

// ============ DF-332 — flow_comments_get ============

const flowCommentsGetDef = {
  name: 'flow_comments_get',
  description: `Reload only the discussion (comments) for a flow as a Markdown section.

Returns the same "## Discussion (N)"-section that flow_get appends. Useful when:
- The user said something new in the UI and you want fresh context without re-fetching the entire flow + attachments.
- You want a focused view of resolution status across comments.

Resolved comments are marked with [✓ resolved]. Body is rendered verbatim — wikilinks like [[adr-134]] stay raw (use wiki_get_page to resolve them).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID (e.g. "DF-329" or full ID).'
      }
    },
    required: ['flowId']
  }
};

async function handleFlowCommentsGet(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const resolvedId = await resolveFlowId(flowId);
  if (!resolvedId) {
    return `Error: Flow not found (tried exact and prefix match for "${flowId}")`;
  }

  const result = await devFlowClient.listFlowComments(resolvedId);
  if (!result.success || !Array.isArray(result.data)) {
    return `Error: ${result.error || 'Failed to load comments'}`;
  }

  const section = formatDiscussionSection(result.data);
  if (!section) {
    return '*No discussion yet for this flow.*';
  }
  return section;
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
  flow_comments_get: {
    definition: flowCommentsGetDef,
    handler: withErrorHandling('flow_comments_get', handleFlowCommentsGet),
  },
};

/**
 * DF-436 — decide whether flow_update should auto-complete the agent-session
 * after a transition. Under `agent_with_discipline` the agent self-approves
 * and keeps working — the session must stay ACTIVE so the backend keeps
 * treating the caller as an agent (gate + audit consistency). Only a real
 * hand-off to a human (human_only / human_or_agent waits) or flow completion
 * ends the session.
 */
export function shouldAutoCompleteSession(newState: string, transitionPolicy?: string | null): boolean {
  if (!['approval', 'review', 'done'].includes(newState)) return false;
  if (newState === 'done') return true;
  return transitionPolicy !== 'agent_with_discipline';
}
