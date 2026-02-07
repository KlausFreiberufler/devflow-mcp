/**
 * Release MCP Tools
 * Tools for listing, getting, creating, and updating releases in WorkFlow Pro
 */

import { workflowProClient } from '../api/client.js';
import type { Release } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const releaseListDef = {
  name: 'release_list',
  description: `List all releases for a project.
Returns releases with their status, target dates, and descriptions.
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

const releaseGetDef = {
  name: 'release_get',
  description: `Get detailed information about a specific release.
Returns the full release including name, description, status, and dates.`,
  inputSchema: {
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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

async function handleReleaseList(args: Record<string, unknown>): Promise<string> {
  const projectId = (args.projectId as string | undefined) || workflowProClient.getLinkedProjectId();

  if (!projectId) {
    return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
  }

  const result = await workflowProClient.listReleases(projectId);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to list releases'}`;
  }

  const releases = result.data as Release[];

  if (releases.length === 0) {
    return 'No releases found for this project. Use release_create to create one.';
  }

  return formatReleaseList(releases);
}

async function handleReleaseGet(args: Record<string, unknown>): Promise<string> {
  const id = args.id as string;

  const result = await workflowProClient.getRelease(id);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Release not found'}`;
  }

  return formatReleaseDetail(result.data as Release);
}

async function handleReleaseCreate(args: Record<string, unknown>): Promise<string> {
  const projectId = (args.projectId as string | undefined) || workflowProClient.getLinkedProjectId();
  const name = args.name as string;
  const description = args.description as string | undefined;
  const targetDate = args.targetDate as string | undefined;

  if (!projectId) {
    return 'Error: projectId is required. No linked project found. Use project_list to find the project ID, or link a project first.';
  }

  const result = await workflowProClient.createRelease({ projectId, name, description, targetDate });

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to create release'}`;
  }

  return `Release created successfully.\n\n${formatReleaseDetail(result.data as Release)}`;
}

async function handleReleaseUpdate(args: Record<string, unknown>): Promise<string> {
  const id = args.id as string;
  const name = args.name as string | undefined;
  const description = args.description as string | undefined;
  const status = args.status as string | undefined;
  const targetDate = args.targetDate as string | undefined;

  const cleanUpdate: Record<string, unknown> = {};
  if (name !== undefined) cleanUpdate.name = name;
  if (description !== undefined) cleanUpdate.description = description;
  if (status !== undefined) cleanUpdate.status = status;
  if (targetDate !== undefined) cleanUpdate.targetDate = targetDate;

  const result = await workflowProClient.updateRelease(id, cleanUpdate);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Failed to update release'}`;
  }

  return `Release updated successfully.\n\n${formatReleaseDetail(result.data as Release)}`;
}

// ============ Formatters ============

function formatReleaseList(releases: Release[]): string {
  const lines = ['# Releases\n'];

  const statusEmoji: Record<string, string> = {
    planned: '📋',
    in_progress: '🔨',
    released: '🚀',
    cancelled: '❌',
  };

  // Group by status
  const byStatus: Record<string, Release[]> = {};
  for (const r of releases) {
    const status = r.status || 'planned';
    if (!byStatus[status]) byStatus[status] = [];
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

function formatReleaseDetail(release: Release): string {
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

export const tools: ToolModule = {
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
