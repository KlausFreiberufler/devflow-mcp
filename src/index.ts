#!/usr/bin/env node
/**
 * WorkFlow Pro MCP Server
 *
 * Provides Claude Code with tools to interact with WorkFlow Pro:
 * - List and manage projects
 * - List, get, and update workflows
 * - Create and manage tasks
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { workflowProClient } from './api/client.js';
import {
  workflowListTool,
  workflowGetTool,
  workflowCreateTool,
  workflowUpdateTool,
  workflowGetFeedbackTool,
  handleWorkflowList,
  handleWorkflowGet,
  handleWorkflowCreate,
  handleWorkflowUpdate,
  handleWorkflowGetFeedback
} from './tools/workflow.js';
import {
  taskListTool,
  taskCreateTool,
  taskUpdateTool,
  handleTaskList,
  handleTaskCreate,
  handleTaskUpdate
} from './tools/task.js';
import {
  projectListTool,
  projectGetTool,
  handleProjectList,
  handleProjectGet
} from './tools/project.js';

// Initialize server
const server = new Server(
  {
    name: 'workflow-pro',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      projectListTool,
      projectGetTool,
      workflowListTool,
      workflowGetTool,
      workflowCreateTool,
      workflowUpdateTool,
      workflowGetFeedbackTool,
      taskListTool,
      taskCreateTool,
      taskUpdateTool,
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      // Project tools
      case 'project_list':
        result = await handleProjectList(args as { includeInactive?: boolean });
        break;
      case 'project_get':
        result = await handleProjectGet(args as { projectId: string });
        break;

      // Workflow tools
      case 'workflow_list':
        result = await handleWorkflowList(args as { projectId?: string; state?: string });
        break;
      case 'workflow_get':
        result = await handleWorkflowGet(args as { workflowId: string });
        break;
      case 'workflow_create':
        result = await handleWorkflowCreate(args as {
          projectId: string;
          summary: string;
          description?: string;
          workflowType?: string;
          acceptanceCriteria?: string[];
        });
        break;
      case 'workflow_update':
        result = await handleWorkflowUpdate(args as {
          workflowId: string;
          currentState?: 'idea' | 'planning' | 'plan_review' | 'progress' | 'code_review' | 'testing' | 'done';
          agentStatus?: string;
          agentMessage?: string;
          implementationPlan?: string;
          agentSummary?: string;
          testingInstructions?: string;
        });
        break;
      case 'workflow_get_feedback':
        result = await handleWorkflowGetFeedback(args as { workflowId: string });
        break;

      // Task tools
      case 'task_list':
        result = await handleTaskList(args as { workflowId: string });
        break;
      case 'task_create':
        result = await handleTaskCreate(args as {
          workflowId: string;
          parentId?: string;
          summary: string;
          description?: string;
          acceptanceCriteria?: string[];
        });
        break;
      case 'task_update':
        result = await handleTaskUpdate(args as {
          taskId: string;
          summary?: string;
          description?: string;
          isCompleted?: boolean;
          acceptanceCriteria?: string[];
          status?: 'todo' | 'doing' | 'done';
        });
        break;

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Initialize and start server
async function main() {
  // Initialize the API client
  await workflowProClient.init();

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup info
  const projectName = workflowProClient.getLinkedProjectName();
  if (projectName) {
    console.error(`WorkFlow Pro MCP Server running (linked to: ${projectName})`);
  } else {
    console.error('WorkFlow Pro MCP Server running (no project linked)');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
