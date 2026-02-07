/**
 * Workflow MCP Tools
 * Tools for listing, getting, creating, and updating workflows in WorkFlow Pro
 */

import { workflowProClient, type Workflow } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const workflowListDef = {
  name: 'workflow_list',
  description: `List all workflows, optionally filtered by project.
Returns workflows with their current state (idea, planning, plan_review, progress, code_review, testing, done).
Use this to find workflows to work on.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'Optional project ID to filter workflows'
      },
      state: {
        type: 'string',
        enum: ['idea', 'planning', 'plan_review', 'progress', 'code_review', 'testing', 'done'],
        description: 'Optional state filter'
      }
    }
  }
};

const workflowGetDef = {
  name: 'workflow_get',
  description: `Get detailed information about a specific workflow.
Returns the full workflow including:
- Summary and description
- Acceptance criteria
- Current state
- Agent status (if being worked on)
- Implementation plan (full content)
- Audit info (who created/approved)

Use this before starting work on a workflow to understand requirements.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      workflowId: {
        type: 'string',
        description: 'The workflow ID (e.g., "abc123" or full ID)'
      }
    },
    required: ['workflowId']
  }
};

const workflowCreateDef = {
  name: 'workflow_create',
  description: `Create a new workflow in a project.
Use this to create new feature requests, bug reports, or tasks.
The workflow starts in 'idea' state by default.

Requires a projectId (use project_list to find it) and a summary.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'The project ID this workflow belongs to'
      },
      summary: {
        type: 'string',
        description: 'Brief summary/title of the workflow'
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done'
      },
      workflowType: {
        type: 'string',
        enum: ['feature', 'bug', 'chore'],
        description: 'Type of workflow (default: feature)'
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

const workflowUpdateDef = {
  name: 'workflow_update',
  description: `Update a workflow's status or progress.
Use this to:
- Change workflow state (idea -> planning -> plan_review -> progress -> code_review -> testing -> done)
- Report agent status (what you're currently doing)
- Send progress messages to the user
- Submit implementation plan for review
- Submit agent summary after implementation

IMPORTANT: Some state transitions require mandatory fields:
- plan_review requires: implementationPlan
- code_review requires: agentSummary AND testingInstructions

The agentStatus and agentMessage are visible in the WorkFlow Pro UI.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      workflowId: {
        type: 'string',
        description: 'The workflow ID to update'
      },
      currentState: {
        type: 'string',
        enum: ['idea', 'planning', 'plan_review', 'progress', 'code_review', 'testing', 'done'],
        description: 'New state for the workflow'
      },
      agentStatus: {
        type: 'string',
        enum: ['idle', 'analyzing', 'planning', 'implementing', 'testing', 'reviewing'],
        description: 'Current agent activity status'
      },
      agentMessage: {
        type: 'string',
        description: 'Human-readable message about what the agent is doing'
      },
      implementationPlan: {
        type: 'string',
        description: 'Markdown content of the implementation plan (required for plan_review state)'
      },
      agentSummary: {
        type: 'string',
        description: 'Agent summary after implementation (required for code_review state)'
      },
      testingInstructions: {
        type: 'string',
        description: 'Instructions for user testing (required for code_review state). Include what to test, expected behavior, and edge cases.'
      }
    },
    required: ['workflowId']
  }
};

const workflowGetFeedbackDef = {
  name: 'workflow_get_feedback',
  description: `Get user feedback for a workflow.
Use this at the start of a session to check if the user has provided feedback on:
- The implementation plan (plan_review phase)
- The code implementation (code_review phase)

If feedback exists, you should address it before continuing work.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      workflowId: {
        type: 'string',
        description: 'The workflow ID to get feedback for'
      }
    },
    required: ['workflowId']
  }
};

// ============ Helpers ============

/**
 * Resolve a partial workflow ID to a full ID by prefix matching.
 */
async function resolveWorkflowId(partialId: string): Promise<string | null> {
  // Try exact match first
  const exact = await workflowProClient.getWorkflow(partialId);
  if (exact.success && exact.data) {
    return partialId;
  }

  // Fallback: list all workflows and find by prefix
  const list = await workflowProClient.listWorkflows();
  if (!list.success || !list.data) {
    return null;
  }

  const matches = list.data.filter(w => w.id.startsWith(partialId));
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}

// ============ State Transition Guardrails ============

/** Transitions that can only be triggered by the user via UI */
const BLOCKED_TRANSITIONS: Record<string, { target: string; reason: string }[]> = {
  'plan_review': [
    { target: 'progress', reason: 'Der User muss den Plan zuerst in der UI freigeben. Warte auf Freigabe in plan_review.' }
  ],
  'code_review': [
    { target: 'testing', reason: 'Der User muss den Code zuerst in der UI freigeben. Warte auf Freigabe in code_review.' },
    { target: 'done', reason: 'Der User muss den Code zuerst in der UI freigeben. Warte auf Freigabe in code_review.' }
  ],
  'testing': [
    { target: 'done', reason: 'Der User muss das Testing zuerst in der UI abschließen. Warte auf Freigabe in testing.' }
  ]
};

/** Required fields for state transitions */
const REQUIRED_FIELDS: Record<string, { fields: string[]; message: string }> = {
  'plan_review': {
    fields: ['implementationPlan'],
    message: 'implementationPlan ist Pflicht beim Übergang zu plan_review. Schreibe einen Plan bevor du den State wechselst.'
  },
  'code_review': {
    fields: ['agentSummary', 'testingInstructions'],
    message: 'agentSummary und testingInstructions sind Pflicht beim Übergang zu code_review. Beschreibe was implementiert wurde und was der User testen soll.'
  }
};

// ============ Tool Handlers ============

async function handleWorkflowList(args: Record<string, unknown>): Promise<string> {
  const projectId = args.projectId as string | undefined;
  const state = args.state as string | undefined;

  const result = await workflowProClient.listWorkflows(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list workflows'}`;
  }

  let workflows = result.data;

  if (state) {
    workflows = workflows.filter(w => w.currentState === state);
  }

  const linkedProject = workflowProClient.getLinkedProjectName();
  const contextInfo = linkedProject
    ? `*Showing workflows for project: ${linkedProject}*\n\n`
    : '';

  if (workflows.length === 0) {
    return contextInfo + 'No workflows found matching the criteria.';
  }

  return contextInfo + formatWorkflowList(workflows);
}

async function handleWorkflowGet(args: Record<string, unknown>): Promise<string> {
  const workflowId = args.workflowId as string;

  const resolvedId = await resolveWorkflowId(workflowId);
  if (!resolvedId) {
    return `Error: Workflow not found (tried exact and prefix match for "${workflowId}")`;
  }

  const result = await workflowProClient.getWorkflow(resolvedId);
  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Workflow not found'}`;
  }

  return formatWorkflowDetail(result.data);
}

async function handleWorkflowCreate(args: Record<string, unknown>): Promise<string> {
  const projectId = args.projectId as string | undefined;
  const summary = args.summary as string;
  const description = args.description as string | undefined;
  const workflowType = args.workflowType as string | undefined;
  const acceptanceCriteria = args.acceptanceCriteria as string[] | undefined;

  // Use linked project if no projectId provided
  const effectiveProjectId = projectId || workflowProClient.getLinkedProjectId();
  if (!effectiveProjectId) {
    return 'Error: projectId ist erforderlich. Nutze project_list um die verfügbaren Projekte zu sehen, oder verknüpfe ein Projekt.';
  }

  const result = await workflowProClient.createWorkflow({
    projectId: effectiveProjectId,
    summary,
    description,
    workflowType: workflowType || 'feature',
    acceptanceCriteria,
  });

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to create workflow'}`;
  }

  return `Workflow created successfully.\n\n${formatWorkflowDetail(result.data)}`;
}

async function handleWorkflowUpdate(args: Record<string, unknown>): Promise<string> {
  const workflowId = args.workflowId as string;
  const currentState = args.currentState as Workflow['currentState'] | undefined;
  const agentStatus = args.agentStatus as string | undefined;
  const agentMessage = args.agentMessage as string | undefined;
  const implementationPlan = args.implementationPlan as string | undefined;
  const agentSummary = args.agentSummary as string | undefined;
  const testingInstructions = args.testingInstructions as string | undefined;

  const resolvedId = await resolveWorkflowId(workflowId);
  if (!resolvedId) {
    return `Error: Workflow not found (tried exact and prefix match for "${workflowId}")`;
  }

  // Guardrail: Check state transitions
  if (currentState) {
    const currentWorkflow = await workflowProClient.getWorkflow(resolvedId);
    if (currentWorkflow.success && currentWorkflow.data) {
      const fromState = currentWorkflow.data.currentState;

      // Check blocked transitions (user-only)
      const blocked = BLOCKED_TRANSITIONS[fromState]?.find(b => b.target === currentState);
      if (blocked) {
        return `⛔ Blockiert: ${blocked.reason}\n\nAktueller State: ${fromState} → Gewünschter State: ${currentState}\n\nDiese Transition kann nur vom User über die WorkFlow Pro UI ausgelöst werden.`;
      }
    }

    // Check required fields for target state
    const required = REQUIRED_FIELDS[currentState];
    if (required) {
      const allArgs = { implementationPlan, agentSummary, testingInstructions };
      const missing = required.fields.filter(f => !allArgs[f as keyof typeof allArgs]);
      if (missing.length > 0) {
        return `⛔ Pflichtfelder fehlen: ${missing.join(', ')}\n\n${required.message}`;
      }
    }
  }

  // Build clean update object
  const cleanUpdate: Record<string, unknown> = {};
  if (currentState) cleanUpdate.currentState = currentState;
  if (agentStatus) cleanUpdate.agentStatus = agentStatus;
  if (agentMessage) cleanUpdate.agentMessage = agentMessage;
  if (implementationPlan) cleanUpdate.implementationPlan = implementationPlan;
  if (agentSummary) cleanUpdate.agentSummary = agentSummary;
  if (testingInstructions) cleanUpdate.testingInstructions = testingInstructions;

  const result = await workflowProClient.updateWorkflow(resolvedId, cleanUpdate);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to update workflow'}`;
  }

  return `Workflow updated successfully.\n\n${formatWorkflowDetail(result.data)}`;
}

async function handleWorkflowGetFeedback(args: Record<string, unknown>): Promise<string> {
  const workflowId = args.workflowId as string;

  const resolvedId = await resolveWorkflowId(workflowId);
  if (!resolvedId) {
    return `Error: Workflow not found (tried exact and prefix match for "${workflowId}")`;
  }

  const result = await workflowProClient.getWorkflowFeedback(resolvedId);

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
    lines.push('\nPlease address these points before completing the workflow.\n');
  }

  if (feedbackAt) {
    lines.push(`*Feedback provided: ${new Date(feedbackAt).toLocaleString()}*`);
  }

  return lines.join('\n');
}

// ============ Formatters ============

function formatWorkflowList(workflows: Workflow[]): string {
  const lines = ['# Workflows\n'];

  const byState: Record<string, Workflow[]> = {
    idea: [], planning: [], plan_review: [], progress: [],
    code_review: [], testing: [], done: []
  };

  for (const w of workflows) {
    byState[w.currentState]?.push(w);
  }

  for (const [state, wfs] of Object.entries(byState)) {
    if (wfs.length === 0) continue;

    const emoji: Record<string, string> = {
      idea: '💡', planning: '📋', plan_review: '📝', progress: '🔨',
      code_review: '👀', testing: '🧪', done: '✅'
    };

    const label = state === 'plan_review' ? 'Plan Review'
               : state === 'code_review' ? 'Code Review'
               : state.charAt(0).toUpperCase() + state.slice(1);

    lines.push(`## ${emoji[state] || '📌'} ${label} (${wfs.length})\n`);

    for (const w of wfs) {
      const ticket = w.ticketKey ? `[${w.ticketKey}] ` : '';
      lines.push(`- **${w.id}**: ${ticket}${w.summary}`);
      if (w.agentStatus) {
        lines.push(`  └─ Agent: ${w.agentStatus}${w.agentMessage ? ` - ${w.agentMessage}` : ''}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatWorkflowDetail(workflow: Workflow): string {
  const lines = [
    `# Workflow: ${workflow.summary}`,
    '',
    `**ID:** ${workflow.id}`,
    `**State:** ${workflow.currentState}`,
  ];

  if (workflow.ticketKey) {
    lines.push(`**Ticket:** ${workflow.ticketKey}`);
  }

  if (workflow.agentStatus) {
    lines.push(`**Agent Status:** ${workflow.agentStatus}`);
    if (workflow.agentMessage) {
      lines.push(`**Agent Message:** ${workflow.agentMessage}`);
    }
  }

  lines.push('');

  if (workflow.description) {
    lines.push('## Description\n');
    lines.push(workflow.description);
    lines.push('');
  }

  if (workflow.acceptanceCriteria && workflow.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria\n');
    for (const criterion of workflow.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');
  }

  // Show feedback if any
  if (workflow.planFeedback) {
    lines.push('## Plan Feedback (from user)\n');
    lines.push(workflow.planFeedback);
    lines.push('');
  }

  if (workflow.codeFeedback) {
    lines.push('## Code Feedback (from user)\n');
    lines.push(workflow.codeFeedback);
    lines.push('');
  }

  // Show full implementation plan (not truncated!)
  if (workflow.implementationPlan) {
    lines.push('## Implementation Plan\n');
    lines.push(workflow.implementationPlan);
    lines.push('');
  }

  // Show agent summary
  if (workflow.agentSummary) {
    lines.push('## Agent Summary\n');
    lines.push(workflow.agentSummary);
    lines.push('');
  }

  // Show testing instructions
  if (workflow.testingInstructions) {
    lines.push('## Testing Instructions\n');
    lines.push(workflow.testingInstructions);
    lines.push('');
  }

  // Audit trail
  const auditLines: string[] = [];
  if (workflow.planCreatedBy) {
    const at = workflow.planCreatedAt ? ` (${new Date(workflow.planCreatedAt).toLocaleString()})` : '';
    auditLines.push(`- **Plan erstellt von:** ${workflow.planCreatedBy}${at}`);
  }
  if (workflow.planApprovedBy) {
    const at = workflow.planApprovedAt ? ` (${new Date(workflow.planApprovedAt).toLocaleString()})` : '';
    auditLines.push(`- **Plan genehmigt von:** ${workflow.planApprovedBy}${at}`);
  }
  if (workflow.codeApprovedBy) {
    const at = workflow.codeApprovedAt ? ` (${new Date(workflow.codeApprovedAt).toLocaleString()})` : '';
    auditLines.push(`- **Code genehmigt von:** ${workflow.codeApprovedBy}${at}`);
  }
  if (auditLines.length > 0) {
    lines.push('## Audit\n');
    lines.push(...auditLines);
    lines.push('');
  }

  lines.push(`**Created:** ${new Date(workflow.createdAt).toLocaleString()}`);
  if (workflow.completedAt) {
    lines.push(`**Completed:** ${new Date(workflow.completedAt).toLocaleString()}`);
  }

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  workflow_list: {
    definition: workflowListDef,
    handler: withErrorHandling('workflow_list', handleWorkflowList),
  },
  workflow_get: {
    definition: workflowGetDef,
    handler: withErrorHandling('workflow_get', handleWorkflowGet),
  },
  workflow_create: {
    definition: workflowCreateDef,
    handler: withErrorHandling('workflow_create', handleWorkflowCreate),
  },
  workflow_update: {
    definition: workflowUpdateDef,
    handler: withErrorHandling('workflow_update', handleWorkflowUpdate),
  },
  workflow_get_feedback: {
    definition: workflowGetFeedbackDef,
    handler: withErrorHandling('workflow_get_feedback', handleWorkflowGetFeedback),
  },
};
