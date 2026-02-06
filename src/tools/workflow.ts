/**
 * Workflow MCP Tools
 * Tools for listing, getting, and updating workflows in WorkFlow Pro
 */

import { z } from 'zod';
import { workflowProClient, type Workflow } from '../api/client.js';

// ============ Tool Definitions ============

export const workflowListTool = {
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

export const workflowGetTool = {
  name: 'workflow_get',
  description: `Get detailed information about a specific workflow.
Returns the full workflow including:
- Summary and description
- Acceptance criteria
- Current state
- Agent status (if being worked on)
- Associated tasks

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

export const workflowUpdateTool = {
  name: 'workflow_update',
  description: `Update a workflow's status or progress.
Use this to:
- Change workflow state (idea -> planning -> plan_review -> progress -> code_review -> testing -> done)
- Report agent status (what you're currently doing)
- Send progress messages to the user
- Submit implementation plan for review
- Submit agent summary after implementation

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
        description: 'Markdown content of the implementation plan (for plan_review state)'
      },
      agentSummary: {
        type: 'string',
        description: 'Agent summary after implementation (for code_review state)'
      },
      testingInstructions: {
        type: 'string',
        description: 'Instructions for user testing (shown in testing state). Include what to test, expected behavior, and edge cases.'
      }
    },
    required: ['workflowId']
  }
};

export const workflowGetFeedbackTool = {
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

// ============ Tool Handlers ============

export async function handleWorkflowList(args: {
  projectId?: string;
  state?: string;
}): Promise<string> {
  const result = await workflowProClient.listWorkflows(args.projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list workflows'}`;
  }

  let workflows = result.data;

  // Filter by state if specified
  if (args.state) {
    workflows = workflows.filter(w => w.currentState === args.state);
  }

  // Add project context info
  const linkedProject = workflowProClient.getLinkedProjectName();
  const contextInfo = linkedProject
    ? `*Showing workflows for project: ${linkedProject}*\n\n`
    : '';

  if (workflows.length === 0) {
    return contextInfo + 'No workflows found matching the criteria.';
  }

  return contextInfo + formatWorkflowList(workflows);
}

export async function handleWorkflowGet(args: {
  workflowId: string;
}): Promise<string> {
  const result = await workflowProClient.getWorkflow(args.workflowId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Workflow not found'}`;
  }

  return formatWorkflowDetail(result.data);
}

export async function handleWorkflowUpdate(args: {
  workflowId: string;
  currentState?: 'idea' | 'planning' | 'plan_review' | 'progress' | 'code_review' | 'testing' | 'done';
  agentStatus?: string;
  agentMessage?: string;
  implementationPlan?: string;
  agentSummary?: string;
  testingInstructions?: string;
}): Promise<string> {
  const { workflowId, ...update } = args;

  // Guardrail: State transitions that require user approval via UI
  if (update.currentState) {
    const currentWorkflow = await workflowProClient.getWorkflow(workflowId);
    if (currentWorkflow.success && currentWorkflow.data) {
      const currentState = currentWorkflow.data.currentState;
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

      const blocked = BLOCKED_TRANSITIONS[currentState]?.find(b => b.target === update.currentState);
      if (blocked) {
        return `⛔ Blockiert: ${blocked.reason}\n\nAktueller State: ${currentState} → Gewünschter State: ${update.currentState}\n\nDiese Transition kann nur vom User über die WorkFlow Pro UI ausgelöst werden.`;
      }
    }
  }

  // Only include non-undefined values
  const cleanUpdate: Record<string, unknown> = {};
  if (update.currentState) cleanUpdate.currentState = update.currentState;
  if (update.agentStatus) cleanUpdate.agentStatus = update.agentStatus;
  if (update.agentMessage) cleanUpdate.agentMessage = update.agentMessage;
  if (update.implementationPlan) cleanUpdate.implementationPlan = update.implementationPlan;
  if (update.agentSummary) cleanUpdate.agentSummary = update.agentSummary;
  if (update.testingInstructions) cleanUpdate.testingInstructions = update.testingInstructions;

  const result = await workflowProClient.updateWorkflow(workflowId, cleanUpdate);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to update workflow'}`;
  }

  return `Workflow updated successfully.\n\n${formatWorkflowDetail(result.data)}`;
}

export async function handleWorkflowGetFeedback(args: {
  workflowId: string;
}): Promise<string> {
  const result = await workflowProClient.getWorkflowFeedback(args.workflowId);

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

  // Group by state
  const byState: Record<string, Workflow[]> = {
    idea: [],
    planning: [],
    plan_review: [],
    progress: [],
    code_review: [],
    testing: [],
    done: []
  };

  for (const w of workflows) {
    byState[w.currentState]?.push(w);
  }

  for (const [state, wfs] of Object.entries(byState)) {
    if (wfs.length === 0) continue;

    const emoji = {
      idea: '💡',
      planning: '📋',
      plan_review: '📝',
      progress: '🔨',
      code_review: '👀',
      testing: '🧪',
      done: '✅'
    }[state] || '📌';

    const label = state === 'plan_review' ? 'Plan Review'
                : state === 'code_review' ? 'Code Review'
                : state.charAt(0).toUpperCase() + state.slice(1);

    lines.push(`## ${emoji} ${label} (${wfs.length})\n`);

    for (const w of wfs) {
      const id = w.id.substring(0, 8);
      const ticket = w.ticketKey ? `[${w.ticketKey}] ` : '';
      lines.push(`- **${id}**: ${ticket}${w.summary}`);
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

  // Show feedback if any (for review states)
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

  // Show implementation plan summary if present
  if (workflow.implementationPlan) {
    lines.push('## Implementation Plan\n');
    // Show first 500 chars as preview
    const preview = workflow.implementationPlan.length > 500
      ? workflow.implementationPlan.substring(0, 500) + '...'
      : workflow.implementationPlan;
    lines.push(preview);
    lines.push('');
  }

  // Show agent summary if present
  if (workflow.agentSummary) {
    lines.push('## Agent Summary\n');
    lines.push(workflow.agentSummary);
    lines.push('');
  }

  // Show testing instructions if present
  if (workflow.testingInstructions) {
    lines.push('## Testing Instructions\n');
    lines.push(workflow.testingInstructions);
    lines.push('');
  }

  lines.push(`**Created:** ${new Date(workflow.createdAt).toLocaleString()}`);
  if (workflow.completedAt) {
    lines.push(`**Completed:** ${new Date(workflow.completedAt).toLocaleString()}`);
  }

  return lines.join('\n');
}
