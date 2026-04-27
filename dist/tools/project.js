/**
 * Project MCP Tools
 * Tools for listing and getting project details in DevFlow
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
// ============ Tool Definitions ============
const projectListDef = {
    name: 'project_list',
    description: `List all available projects.
Returns projects with their ID, name, and status.
Use this to find the project ID for other tools like flow_list or release_list.`,
    inputSchema: {
        type: 'object',
        properties: {}
    }
};
const projectGetDef = {
    name: 'project_get',
    description: `Get detailed information about a specific project.
Returns the full project including:
- Name and description
- Tech stack information
- Project configuration

Use this to understand the project context before working on flows.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            }
        }
    }
};
// ============ Tool Handlers ============
async function handleProjectList() {
    const result = await devFlowClient.listProjects();
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to list projects'}`;
    }
    if (result.data.length === 0) {
        return 'No projects found.';
    }
    const linkedId = devFlowClient.getLinkedProjectId();
    return formatProjectList(result.data, linkedId);
}
async function handleProjectGet(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    if (!projectId) {
        return 'Error: No project ID provided and no linked project configured. Use project_list to find available projects.';
    }
    const result = await devFlowClient.getProject(projectId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Project not found'}`;
    }
    return formatProjectDetail(result.data);
}
// ============ Formatters ============
function formatProjectList(projects, linkedId) {
    const lines = ['# Projects\n'];
    for (const p of projects) {
        const linked = p.id === linkedId ? ' ⭐ (linked)' : '';
        const status = p.isActive ? '' : ' [archived]';
        lines.push(`- **${p.name}**${linked}${status}`);
        lines.push(`  ID: ${p.id}`);
        if (p.description) {
            lines.push(`  ${p.description.substring(0, 120)}${p.description.length > 120 ? '...' : ''}`);
        }
    }
    return lines.join('\n');
}
function formatProjectDetail(project) {
    const lines = [
        `# Project: ${project.name}`,
        '',
        `**ID:** ${project.id}`,
        `**Status:** ${project.isActive ? 'Active' : 'Archived'}`,
    ];
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
export const tools = {
    project_list: {
        definition: projectListDef,
        handler: withErrorHandling('project_list', handleProjectList),
    },
    project_get: {
        definition: projectGetDef,
        handler: withErrorHandling('project_get', handleProjectGet),
    },
};
