/**
 * Knowledge MCP Tools
 * Tools for getting and updating project knowledge in WorkFlow Pro
 */

import { workflowProClient } from '../api/client.js';
import type { ProjectKnowledge } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const projectKnowledgeGetDef = {
  name: 'project_knowledge_get',
  description: `Get the knowledge base for a project.
Returns the stored knowledge/context for the project, which may include:
- Architecture decisions
- Code conventions
- Important patterns
- Domain-specific information

Automatically uses the linked project if no projectId is provided.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'The project ID. If omitted, uses the linked project.'
      }
    }
  }
};

const projectKnowledgeUpdateDef = {
  name: 'project_knowledge_update',
  description: `Update the knowledge base for a project.
Use this to store important context, decisions, or patterns discovered during work.
The knowledge field accepts markdown content.

Automatically uses the linked project if no projectId is provided.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: {
        type: 'string',
        description: 'The project ID. If omitted, uses the linked project.'
      },
      knowledge: {
        type: 'string',
        description: 'The knowledge content to store (markdown supported)'
      }
    },
    required: ['knowledge']
  }
};

// ============ Tool Handlers ============

async function handleProjectKnowledgeGet(args: Record<string, unknown>): Promise<string> {
  const projectId = (args.projectId as string | undefined) || workflowProClient.getLinkedProjectId();

  if (!projectId) {
    return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
  }

  const result = await workflowProClient.getProjectKnowledge(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to get project knowledge'}`;
  }

  return formatKnowledge(result.data as ProjectKnowledge, projectId);
}

async function handleProjectKnowledgeUpdate(args: Record<string, unknown>): Promise<string> {
  const projectId = (args.projectId as string | undefined) || workflowProClient.getLinkedProjectId();
  const knowledge = args.knowledge as string;

  if (!projectId) {
    return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
  }

  const result = await workflowProClient.updateProjectKnowledge(knowledge, projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to update project knowledge'}`;
  }

  return `Project knowledge updated successfully.\n\n${formatKnowledge(result.data as ProjectKnowledge, projectId)}`;
}

// ============ Formatters ============

function formatKnowledge(data: ProjectKnowledge, projectId?: string): string {
  const lines = [
    `# Project Knowledge`,
    '',
  ];
  if (projectId) {
    lines.push(`**Project:** ${projectId}`);
  }

  if (data.updatedAt) {
    lines.push(`**Last updated:** ${new Date(data.updatedAt).toLocaleString()}`);
  }

  lines.push('');

  if (data.knowledge && data.knowledge.trim()) {
    lines.push('## Content\n');
    lines.push(data.knowledge);
  } else {
    lines.push('*No knowledge stored yet. Use project_knowledge_update to add project context.*');
  }

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  project_knowledge_get: {
    definition: projectKnowledgeGetDef,
    handler: withErrorHandling('project_knowledge_get', handleProjectKnowledgeGet),
  },
  project_knowledge_update: {
    definition: projectKnowledgeUpdateDef,
    handler: withErrorHandling('project_knowledge_update', handleProjectKnowledgeUpdate),
  },
};
