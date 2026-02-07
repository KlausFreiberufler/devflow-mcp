/**
 * Search MCP Tools
 * Tools for searching across workflows, tasks, and projects in WorkFlow Pro
 */

import { workflowProClient } from '../api/client.js';
import type { SearchResult } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Tool Definitions ============

const searchDef = {
  name: 'search',
  description: `Search across workflows, tasks, and projects in WorkFlow Pro.
Use this to find items by keyword, title, or content.
Supports filtering by type (workflow, task, project).

Returns matching items with their type, title, and a content snippet.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      q: {
        type: 'string',
        description: 'Search query string'
      },
      type: {
        type: 'string',
        enum: ['workflow', 'task', 'project'],
        description: 'Optional: filter results by type'
      }
    },
    required: ['q']
  }
};

// ============ Tool Handlers ============

async function handleSearch(args: Record<string, unknown>): Promise<string> {
  const q = args.q as string;
  const type = args.type as string | undefined;

  const result = await workflowProClient.search(q, type);

  if (!result.success || !result.data) {
    return `Error: ${result.error || 'Search failed'}`;
  }

  const results = result.data as SearchResult[];

  if (results.length === 0) {
    return `No results found for "${q}".`;
  }

  return formatSearchResults(q, results);
}

// ============ Formatters ============

function formatSearchResults(query: string, results: SearchResult[]): string {
  const lines = [
    `# Search Results for "${query}"`,
    '',
    `**${results.length} result${results.length !== 1 ? 's' : ''} found**\n`,
  ];

  const typeEmoji: Record<string, string> = {
    workflow: '🔄',
    task: '✅',
    project: '📁',
  };

  // Group by type
  const byType: Record<string, SearchResult[]> = {};
  for (const r of results) {
    const type = r.type || 'other';
    if (!byType[type]) byType[type] = [];
    byType[type].push(r);
  }

  for (const [type, typeResults] of Object.entries(byType)) {
    const emoji = typeEmoji[type] || '📌';
    const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';
    lines.push(`## ${emoji} ${label} (${typeResults.length})\n`);

    for (const r of typeResults) {
      const state = r.state ? ` [${r.state}]` : '';
      lines.push(`- **${r.id}**: ${r.title}${state}`);
      if (r.description) {
        lines.push(`  ${r.description.substring(0, 200)}${r.description.length > 200 ? '...' : ''}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  search: {
    definition: searchDef,
    handler: withErrorHandling('search', handleSearch),
  },
};
