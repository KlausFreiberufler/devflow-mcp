/**
 * Release MCP Tools
 * Tools for listing, getting, creating, and updating releases in DevFlow
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
// ============ Tool Definitions ============
const releaseListDef = {
    name: 'release_list',
    description: `List all releases for a project.
Returns releases with their status, target dates, and descriptions.
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
const releaseGetDef = {
    name: 'release_get',
    description: `Get detailed information about a specific release.
Returns the full release including name, description, status, and dates.`,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'The release ID'
            }
        },
        required: ['id']
    }
};
const releaseCreateDef = {
    name: 'release_create',
    description: `Create a new release for a project.
Use this to plan a new version or milestone.
Automatically uses the linked project if no projectId is provided.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            name: {
                type: 'string',
                description: 'Release name (e.g., "v1.2.0", "Sprint 5")'
            },
            description: {
                type: 'string',
                description: 'Description of the release scope and goals'
            },
            targetDate: {
                type: 'string',
                description: 'Target release date (ISO 8601 format, e.g., "2026-03-01")'
            }
        },
        required: ['name']
    }
};
const releaseUpdateDef = {
    name: 'release_update',
    description: `Update an existing release.
Use this to change the release name, description, status, or target date.`,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'The release ID to update'
            },
            name: {
                type: 'string',
                description: 'New release name'
            },
            description: {
                type: 'string',
                description: 'New description'
            },
            status: {
                type: 'string',
                description: 'New status (e.g., "planned", "in_progress", "released", "cancelled")'
            },
            targetDate: {
                type: 'string',
                description: 'New target date (ISO 8601 format)'
            }
        },
        required: ['id']
    }
};
// ============ Tool Handlers ============
async function handleReleaseList(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    if (!projectId) {
        return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
    }
    const result = await devFlowClient.listReleases(projectId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to list releases'}`;
    }
    const releases = result.data;
    if (releases.length === 0) {
        return 'No releases found for this project. Use release_create to create one.';
    }
    return formatReleaseList(releases);
}
async function handleReleaseGet(args) {
    const id = args.id;
    const result = await devFlowClient.getRelease(id);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Release not found'}`;
    }
    return formatReleaseDetail(result.data);
}
async function handleReleaseCreate(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    const name = args.name;
    const description = args.description;
    const targetDate = args.targetDate;
    if (!projectId) {
        return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
    }
    const result = await devFlowClient.createRelease({ projectId, name, description, targetDate });
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to create release'}`;
    }
    return `Release created successfully.\n\n${formatReleaseDetail(result.data)}`;
}
async function handleReleaseUpdate(args) {
    const id = args.id;
    const name = args.name;
    const description = args.description;
    const status = args.status;
    const targetDate = args.targetDate;
    const cleanUpdate = {};
    if (name !== undefined)
        cleanUpdate.name = name;
    if (description !== undefined)
        cleanUpdate.description = description;
    if (status !== undefined)
        cleanUpdate.status = status;
    if (targetDate !== undefined)
        cleanUpdate.targetDate = targetDate;
    const result = await devFlowClient.updateRelease(id, cleanUpdate);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to update release'}`;
    }
    return `Release updated successfully.\n\n${formatReleaseDetail(result.data)}`;
}
// ============ Formatters ============
function formatReleaseList(releases) {
    const lines = ['# Releases\n'];
    const statusEmoji = {
        planned: '📋',
        in_progress: '🔨',
        released: '🚀',
        cancelled: '❌',
    };
    // Group by status
    const byStatus = {};
    for (const r of releases) {
        const status = r.status || 'planned';
        if (!byStatus[status])
            byStatus[status] = [];
        byStatus[status].push(r);
    }
    for (const [status, statusReleases] of Object.entries(byStatus)) {
        const emoji = statusEmoji[status] || '📌';
        const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`## ${emoji} ${label} (${statusReleases.length})\n`);
        for (const r of statusReleases) {
            lines.push(`- **${r.name}**`);
            lines.push(`  ID: ${r.id}`);
            if (r.targetDate) {
                lines.push(`  Target: ${new Date(r.targetDate).toLocaleDateString()}`);
            }
            if (r.description) {
                lines.push(`  ${r.description.substring(0, 120)}${r.description.length > 120 ? '...' : ''}`);
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}
function formatReleaseDetail(release) {
    const lines = [
        `# Release: ${release.name}`,
        '',
        `**ID:** ${release.id}`,
        `**Project:** ${release.projectId}`,
        `**Status:** ${release.status || 'planned'}`,
    ];
    if (release.targetDate) {
        lines.push(`**Target Date:** ${new Date(release.targetDate).toLocaleDateString()}`);
    }
    if (release.description) {
        lines.push('');
        lines.push('## Description');
        lines.push(release.description);
    }
    lines.push('');
    lines.push(`**Created:** ${new Date(release.createdAt).toLocaleString()}`);
    return lines.join('\n');
}
// ============ Tool Registry Export ============
export const tools = {
    release_list: {
        definition: releaseListDef,
        handler: withErrorHandling('release_list', handleReleaseList),
    },
    release_get: {
        definition: releaseGetDef,
        handler: withErrorHandling('release_get', handleReleaseGet),
    },
    release_create: {
        definition: releaseCreateDef,
        handler: withErrorHandling('release_create', handleReleaseCreate),
    },
    release_update: {
        definition: releaseUpdateDef,
        handler: withErrorHandling('release_update', handleReleaseUpdate),
    },
};
