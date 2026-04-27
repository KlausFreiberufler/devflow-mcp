/**
 * Guidelines MCP Tools
 * Tools for getting and updating project-specific CLAUDE.md guidelines
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
import { syncProjectGuidelines } from '../setup/claude-md-generator.js';
import { getWorkingDir } from '../utils/working-dir.js';
// ============ Tool Definitions ============
const projectGuidelinesGetDef = {
    name: 'project_guidelines_get',
    description: `Get project-specific CLAUDE.md guidelines.
Returns guidelines that are automatically synced into the project's CLAUDE.md file.
These guidelines are managed by the user via the DevFlow UI.

Automatically uses the linked project if no projectId is provided.`,
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
const projectGuidelinesUpdateDef = {
    name: 'project_guidelines_update',
    description: `Update project-specific CLAUDE.md guidelines.
Updates the guidelines in the backend and immediately syncs them into the local CLAUDE.md file.
The guidelines field accepts markdown content.

Automatically uses the linked project if no projectId is provided.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            guidelines: {
                type: 'string',
                description: 'The guidelines content (markdown supported)'
            }
        },
        required: ['guidelines']
    }
};
// ============ Tool Handlers ============
async function handleProjectGuidelinesGet(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    if (!projectId) {
        return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
    }
    const result = await devFlowClient.getProjectGuidelines(projectId);
    if (!result.success || !result.data) {
        // Graceful handling: endpoint may not exist yet
        if (result.error?.includes('404')) {
            return formatGuidelines({ guidelines: '' }, projectId);
        }
        return `Error: ${result.error || 'Failed to get project guidelines'}`;
    }
    return formatGuidelines(result.data, projectId);
}
async function handleProjectGuidelinesUpdate(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    const guidelines = args.guidelines;
    if (!projectId) {
        return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
    }
    const result = await devFlowClient.updateProjectGuidelines(guidelines, projectId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to update project guidelines'}`;
    }
    // Sync to local CLAUDE.md immediately
    try {
        await syncProjectGuidelines(getWorkingDir(), guidelines);
    }
    catch {
        // Non-critical: local sync failure doesn't block the update
    }
    return `Project guidelines updated successfully.\n\n${formatGuidelines(result.data, projectId)}`;
}
// ============ Formatters ============
function formatGuidelines(data, projectId) {
    const lines = [
        '# Project Guidelines',
        '',
    ];
    if (projectId) {
        lines.push(`**Project:** ${projectId}`);
    }
    if (data.updatedAt) {
        lines.push(`**Last updated:** ${new Date(data.updatedAt).toLocaleString()}`);
    }
    lines.push('');
    if (data.guidelines && data.guidelines.trim()) {
        lines.push('## Content\n');
        lines.push(data.guidelines);
    }
    else {
        lines.push('*No guidelines stored yet. Use project_guidelines_update to add project-specific CLAUDE.md guidelines, or edit them in the DevFlow UI.*');
    }
    return lines.join('\n');
}
// ============ Tool Registry Export ============
export const tools = {
    project_guidelines_get: {
        definition: projectGuidelinesGetDef,
        handler: withErrorHandling('project_guidelines_get', handleProjectGuidelinesGet),
    },
    project_guidelines_update: {
        definition: projectGuidelinesUpdateDef,
        handler: withErrorHandling('project_guidelines_update', handleProjectGuidelinesUpdate),
    },
};
