/**
 * Task MCP Tools
 * Tools for listing, creating, and updating tasks in DevFlow
 */

import { devFlowClient, type Task } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const taskListDef = {
  name: 'task_list',
  description: `List all tasks for a workflow.
Tasks are sub-items of a workflow that track implementation progress.
Returns tasks with their completion status and hierarchy.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to list tasks for'
      }
    },
    required: ['flowId']
  }
};

const taskCreateDef = {
  name: 'task_create',
  description: `Create a new task under a workflow.
Use this to break down a workflow into smaller, trackable steps.
Tasks can have:
- Summary (required): Brief description of what to do
- Description: Detailed implementation notes
- Acceptance criteria: List of conditions for completion
- Parent task: For creating sub-tasks

Best practice: Create tasks for each logical step before starting implementation.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID this task belongs to'
      },
      parentId: {
        type: 'string',
        description: 'Optional parent task ID for creating sub-tasks'
      },
      summary: {
        type: 'string',
        description: 'Brief description of the task (required)'
      },
      description: {
        type: 'string',
        description: 'Detailed description or implementation notes'
      },
      acceptanceCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of conditions that must be met for task completion'
      }
    },
    required: ['flowId', 'summary']
  }
};

const taskUpdateDef = {
  name: 'task_update',
  description: `Update a task's status or details.
Use this to:
- Mark tasks as completed when done
- Update task description with implementation notes
- Modify acceptance criteria
- Change task status for Kanban board

Always mark tasks complete when you finish them to track progress.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID to update'
      },
      summary: {
        type: 'string',
        description: 'New summary for the task'
      },
      description: {
        type: 'string',
        description: 'New description for the task'
      },
      isCompleted: {
        type: 'boolean',
        description: 'Mark task as completed (true) or incomplete (false)'
      },
      acceptanceCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated acceptance criteria'
      },
      status: {
        type: 'string',
        enum: ['todo', 'doing', 'done'],
        description: 'Task status for Kanban board (todo, doing, done)'
      }
    },
    required: ['taskId']
  }
};

// ============ Tool Handlers ============

async function handleTaskList(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;

  const result = await devFlowClient.listTasks(flowId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list tasks'}`;
  }

  if (result.data.length === 0) {
    return 'No tasks found for this workflow. Use task_create to add tasks.';
  }

  return formatTaskList(result.data);
}

async function handleTaskCreate(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const parentId = args.parentId as string | undefined;
  const summary = args.summary as string;
  const description = args.description as string | undefined;
  const acceptanceCriteria = args.acceptanceCriteria as string[] | undefined;

  const result = await devFlowClient.createTask({
    workflowId: flowId,
    parentId,
    summary,
    description,
    acceptanceCriteria
  });

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to create task'}`;
  }

  return `Task created successfully!\n\n${formatTaskDetail(result.data)}`;
}

async function handleTaskUpdate(args: Record<string, unknown>): Promise<string> {
  const taskId = args.taskId as string;
  const summary = args.summary as string | undefined;
  const description = args.description as string | undefined;
  const isCompleted = args.isCompleted as boolean | undefined;
  const acceptanceCriteria = args.acceptanceCriteria as string[] | undefined;
  const status = args.status as 'todo' | 'doing' | 'done' | undefined;

  // Only include non-undefined values
  const cleanUpdate: Record<string, unknown> = {};
  if (summary !== undefined) cleanUpdate.summary = summary;
  if (description !== undefined) cleanUpdate.description = description;
  if (isCompleted !== undefined) cleanUpdate.isCompleted = isCompleted;
  if (acceptanceCriteria !== undefined) cleanUpdate.acceptanceCriteria = acceptanceCriteria;
  if (status !== undefined) cleanUpdate.status = status;

  const result = await devFlowClient.updateTask(taskId, cleanUpdate);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to update task'}`;
  }

  const action = isCompleted ? 'completed' : 'updated';
  return `Task ${action} successfully!\n\n${formatTaskDetail(result.data)}`;
}

// ============ Formatters ============

function formatTaskList(tasks: Task[]): string {
  const lines = ['# Tasks\n'];

  // Build hierarchy
  const topLevel = tasks.filter(t => !t.parentId);
  const children: Record<string, Task[]> = {};

  for (const task of tasks) {
    if (task.parentId) {
      if (!children[task.parentId]) {
        children[task.parentId] = [];
      }
      children[task.parentId].push(task);
    }
  }

  // Count stats
  const completed = tasks.filter(t => t.isCompleted).length;
  const total = tasks.length;
  lines.push(`**Progress:** ${completed}/${total} tasks completed\n`);

  // Render hierarchy
  for (const task of topLevel) {
    lines.push(formatTaskLine(task, 0));
    const subs = children[task.id];
    if (subs) {
      for (const sub of subs) {
        lines.push(formatTaskLine(sub, 1));
      }
    }
  }

  return lines.join('\n');
}

function formatTaskLine(task: Task, indent: number): string {
  const prefix = '  '.repeat(indent);
  const checkbox = task.isCompleted ? '✅' : '⬜';
  return `${prefix}${checkbox} **${task.id}**: ${task.summary}`;
}

function formatTaskDetail(task: Task): string {
  const lines = [
    `## Task: ${task.summary}`,
    '',
    `**ID:** ${task.id}`,
    `**Status:** ${task.isCompleted ? '✅ Completed' : '⬜ Pending'}`,
    `**Workflow:** ${task.workflowId}`,
  ];

  if (task.parentId) {
    lines.push(`**Parent:** ${task.parentId}`);
  }

  if (task.description) {
    lines.push('');
    lines.push('### Description');
    lines.push(task.description);
  }

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('### Acceptance Criteria');
    for (const criterion of task.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
  }

  lines.push('');
  lines.push(`**Created:** ${new Date(task.createdAt).toLocaleString()}`);

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  task_list: {
    definition: taskListDef,
    handler: withErrorHandling('task_list', handleTaskList),
  },
  task_create: {
    definition: taskCreateDef,
    handler: withErrorHandling('task_create', handleTaskCreate),
  },
  task_update: {
    definition: taskUpdateDef,
    handler: withErrorHandling('task_update', handleTaskUpdate),
  },
};
