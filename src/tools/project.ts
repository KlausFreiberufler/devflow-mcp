/**
 * Project MCP Tools
 * Tools for listing and getting project details in WorkFlow Pro
 */

import { workflowProClient, type Project } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const projectListTool = {
  name: 'project_list',
  description: `List all projects in WorkFlow Pro.
Returns active projects with their names and Jira keys.
Use this to find the project you want to work with.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      includeInactive: {
        type: 'boolean',
        description: 'Include inactive/archived projects (default: false)'
      }
    }
  }
};

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
        description: 'The project ID'
      }
    },
    required: ['projectId']
  }
};

// ============ Tool Handlers ============

async function handleProjectList(args: Record<string, unknown>): Promise<string> {
  const includeInactive = args.includeInactive as boolean | undefined;
  const result = await workflowProClient.listProjects();

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list projects'}`;
  }

  let projects = result.data;

  // Filter inactive unless requested
  if (!includeInactive) {
    projects = projects.filter(p => p.isActive);
  }

  if (projects.length === 0) {
    return 'No projects found. Create a project in WorkFlow Pro first.';
  }

  return formatProjectList(projects);
}

async function handleProjectGet(args: Record<string, unknown>): Promise<string> {
  const projectId = args.projectId as string;
  const result = await workflowProClient.getProject(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Project not found'}`;
  }

  return formatProjectDetail(result.data);
}

// ============ Formatters ============

function formatProjectList(projects: Project[]): string {
  const lines = ['# Projects\n'];

  for (const p of projects) {
    const jira = p.jiraKey ? ` [${p.jiraKey}]` : '';
    const inactive = !p.isActive ? ' (archived)' : '';
    lines.push(`- **${p.name}**${jira}${inactive}`);
    lines.push(`  ID: ${p.id}`);
    if (p.description) {
      lines.push(`  ${p.description.substring(0, 100)}${p.description.length > 100 ? '...' : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

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
  project_list: {
    definition: projectListTool,
    handler: withErrorHandling('project_list', handleProjectList),
  },
  project_get: {
    definition: projectGetTool,
    handler: withErrorHandling('project_get', handleProjectGet),
  },
};
