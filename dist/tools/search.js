/**
 * Search MCP Tools
 * Tools for searching across flows, tasks, and projects in DevFlow
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
// ============ Tool Definitions ============
const searchDef = {
    name: 'search',
    description: `Search across flows, tasks, and projects in DevFlow.
Use this to find items by keyword, title, or content.
Supports filtering by type (flow, task, project).

Returns matching items with their type, title, and a content snippet.`,
    inputSchema: {
        type: 'object',
        properties: {
            q: {
                type: 'string',
                description: 'Search query string'
            },
            type: {
                type: 'string',
                enum: ['flow', 'task', 'project'],
                description: 'Optional: filter results by type'
            }
        },
        required: ['q']
    }
};
// ============ Tool Handlers ============
async function handleSearch(args) {
    const q = args.q;
    const type = args.type;
    const result = await devFlowClient.search(q, type);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Search failed'}`;
    }
    const results = result.data;
    if (results.length === 0) {
        return `No results found for "${q}".`;
    }
    return formatSearchResults(q, results);
}
// ============ Formatters ============
function formatSearchResults(query, results) {
    const lines = [
        `# Search Results for "${query}"`,
        '',
        `**${results.length} result${results.length !== 1 ? 's' : ''} found**\n`,
    ];
    const typeEmoji = {
        flow: '🔄',
        task: '✅',
        project: '📁',
    };
    // Group by type
    const byType = {};
    for (const r of results) {
        const type = r.type || 'other';
        if (!byType[type])
            byType[type] = [];
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
export const tools = {
    search: {
        definition: searchDef,
        handler: withErrorHandling('search', handleSearch),
    },
};
