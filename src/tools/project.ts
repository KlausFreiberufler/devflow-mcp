/**
 * Project MCP Tools
 * Tools for getting project details in DevFlow
 */

import { devFlowClient, type Project } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const projectGetTool = {
  name: 'project_get',
  description: `Get detailed information about a specific project.
Returns the full project including:
- Name and description
- Jira key (if connected)
- Tech stack information
- Project configuration

Use this to understand the project context before working on workflows.`,
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

// ============ Tool Handlers ============

async function handleProjectGet(args: Record<string, unknown>): Promise<string> {
  const projectId = (args.projectId as string) || devFlowClient.getLinkedProjectId();

  if (!projectId) {
    return 'Error: No project ID provided and no linked project configured. Set DEVFLOW_PROJECT_ID in .mcp.json.';
  }

  const result = await devFlowClient.getProject(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Project not found'}`;
  }

  return formatProjectDetail(result.data);
}

// ============ Formatters ============

function formatProjectDetail(project: Project): string {
  const lines = [
    `# Project: ${project.name}`,
    '',
    `**ID:** ${project.id}`,
    `**Status:** ${project.isActive ? 'Active' : 'Archived'}`,
  ];

  if (project.jiraKey) {
    lines.push(`**Jira Key:** ${project.jiraKey}`);
  }

  if (project.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(project.description);
  }

  if (project.techStack) {
    lines.push('');
    lines.push('## Tech Stack');
    lines.push(project.techStack);
  }

  lines.push('');
  lines.push(`**Created:** ${new Date(project.createdAt).toLocaleString()}`);

  return lines.join('\n');
}

// ============ Tool Module Export ============

export const tools: ToolModule = {
  project_get: {
    definition: projectGetTool,
    handler: withErrorHandling('project_get', handleProjectGet),
  },
};
