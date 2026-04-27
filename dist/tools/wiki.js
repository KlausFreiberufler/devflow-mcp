/**
 * Wiki MCP Tools (DF-226)
 * Read-only tools for the Knowledge Wiki — wiki_search, wiki_backlinks, wiki_graph, etc.
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
function resolveProjectId(args) {
    return args.projectId || devFlowClient.getLinkedProjectId();
}
// ============ Tool Definitions ============
const wikiSearchDef = {
    name: 'wiki_search',
    description: `Full-text search over all wiki assets (flows, doc_pages, reviews, releases).
Uses SQLite FTS5 with prefix matching. Returns hits with title + snippet.

Use this when the user asks "what do we know about X?" or to find relevant ADRs/Patterns/Runbooks before planning.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string', description: 'Project ID (defaults to linked project)' },
            q: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default 20)' }
        },
        required: ['q']
    }
};
const wikiGetPageDef = {
    name: 'wiki_get_page',
    description: `Resolve a wiki reference to a concrete asset and return it with backlinks.
The raw can be a slug (e.g. "adr-014"), a doc_page title, or a flow display_id.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            raw: { type: 'string', description: 'Slug, title, or display_id to resolve' }
        },
        required: ['raw']
    }
};
const wikiListByTypeDef = {
    name: 'wiki_list_by_type',
    description: `List all wiki assets of a specific document_type (adr | pattern | runbook | customer_context | glossary).
Returns a summary (id, title, slug, verified_state).`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            documentType: { type: 'string', description: 'e.g. adr, pattern, runbook' }
        },
        required: ['documentType']
    }
};
const wikiBacklinksDef = {
    name: 'wiki_backlinks',
    description: `Find all assets that link TO a given asset (reverse lookup).
Useful to see where an ADR or Pattern is referenced.`,
    inputSchema: {
        type: 'object',
        properties: {
            assetType: { type: 'string', description: 'flow | doc_page | review | release' },
            assetId: { type: 'string' }
        },
        required: ['assetType', 'assetId']
    }
};
const wikiGraphNeighborsDef = {
    name: 'wiki_graph_neighbors',
    description: `Return the local knowledge graph around a project (nodes + edges).
Optional type filter to limit which asset types appear.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            types: { type: 'array', items: { type: 'string' }, description: 'Filter by asset types' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' }
        }
    }
};
const wikiGetFlowContextDef = {
    name: 'wiki_get_flow_context',
    description: `Return a compact context briefing for a flow: outgoing wiki links + backlinks + tags.
Use this before writing a plan to pull relevant ADRs/Patterns automatically.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: { type: 'string' }
        },
        required: ['flowId']
    }
};
const wikiGetProjectContextDef = {
    name: 'wiki_get_project_context',
    description: `Return a brief overview of the project knowledge: number of assets per type,
top-tagged categories, and recent updates. Useful as a project primer.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' }
        }
    }
};
// ============ Handlers ============
async function handleWikiSearch(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const q = args.q;
    const limit = args.limit || 20;
    const r = await devFlowClient.searchWiki(projectId, q, limit);
    if (!r.success || !r.data)
        return `Error: ${r.error || 'Search failed'}`;
    if (r.data.length === 0)
        return `No hits for "${q}".`;
    return r.data.map((h) => `- ${h.assetType} · ${h.title}\n  ${h.snippet || ''}`).join('\n\n');
}
async function handleWikiGetPage(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const raw = args.raw;
    const res = await devFlowClient.resolveWikiLink(projectId, raw);
    if (!res.success || !res.data)
        return `Not found: ${raw}`;
    const ref = res.data;
    const backlinks = await devFlowClient.getBacklinks(ref.type, ref.id);
    const outgoing = await devFlowClient.getOutgoing(ref.type, ref.id);
    const bl = (backlinks.data || []);
    const og = (outgoing.data || []);
    return [
        `# Resolved: ${ref.type}:${ref.id}`,
        ``,
        `**Backlinks (${bl.length}):**`,
        ...bl.slice(0, 10).map((b) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField}) × ${b.mentions}`),
        ``,
        `**Outgoing (${og.length}):**`,
        ...og.slice(0, 10).map((o) => `- → ${o.targetType || 'unresolved'} ${o.targetId || o.targetRaw}`)
    ].join('\n');
}
async function handleWikiListByType(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const documentType = args.documentType;
    const graph = await devFlowClient.fetchGraph(projectId, [documentType]);
    if (!graph.success || !graph.data)
        return `Error: ${graph.error}`;
    const nodes = (graph.data.nodes || []);
    if (nodes.length === 0)
        return `No ${documentType} pages found.`;
    return nodes.map(n => `- ${n.label} (${n.id})`).join('\n');
}
async function handleWikiBacklinks(args) {
    const r = await devFlowClient.getBacklinks(args.assetType, args.assetId);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    if (r.data.length === 0)
        return 'No backlinks.';
    return r.data.map((b) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField}) × ${b.mentions}`).join('\n');
}
async function handleWikiGraphNeighbors(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const r = await devFlowClient.fetchGraph(projectId, args.types, args.tags);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const g = r.data;
    return `Graph: ${g.nodes.length} nodes · ${g.edges.length} edges\n\n` +
        `**Nodes (first 15):**\n` +
        g.nodes.slice(0, 15).map(n => `- ${n.type}: ${n.label}`).join('\n');
}
async function handleWikiGetFlowContext(args) {
    const flowId = args.flowId;
    const [backlinks, outgoing] = await Promise.all([
        devFlowClient.getBacklinks('flow', flowId),
        devFlowClient.getOutgoing('flow', flowId)
    ]);
    const bl = (backlinks.data || []);
    const og = (outgoing.data || []);
    return [
        `# Flow ${flowId} Context`,
        ``,
        `**Outgoing wiki references (${og.length}):**`,
        ...og.map((o) => `- ${o.sourceField}: [[${o.targetRaw}]]${o.targetId ? '' : ' ⚠ unresolved'}`),
        ``,
        `**Backlinks from other assets (${bl.length}):**`,
        ...bl.map((b) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField})`)
    ].join('\n');
}
async function handleWikiGetProjectContext(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const r = await devFlowClient.fetchGraph(projectId);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const g = r.data;
    const byType = g.nodes.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
    }, {});
    return [
        `# Project Knowledge Overview`,
        ``,
        `**Asset counts:**`,
        ...Object.entries(byType).map(([t, n]) => `- ${t}: ${n}`),
        ``,
        `**Total: ${g.nodes.length} assets, ${g.edges.length} links**`
    ].join('\n');
}
// ============ Tool Registry Export ============
export const tools = {
    wiki_search: { definition: wikiSearchDef, handler: withErrorHandling('wiki_search', handleWikiSearch) },
    wiki_get_page: { definition: wikiGetPageDef, handler: withErrorHandling('wiki_get_page', handleWikiGetPage) },
    wiki_list_by_type: { definition: wikiListByTypeDef, handler: withErrorHandling('wiki_list_by_type', handleWikiListByType) },
    wiki_backlinks: { definition: wikiBacklinksDef, handler: withErrorHandling('wiki_backlinks', handleWikiBacklinks) },
    wiki_graph_neighbors: { definition: wikiGraphNeighborsDef, handler: withErrorHandling('wiki_graph_neighbors', handleWikiGraphNeighbors) },
    wiki_get_flow_context: { definition: wikiGetFlowContextDef, handler: withErrorHandling('wiki_get_flow_context', handleWikiGetFlowContext) },
    wiki_get_project_context: { definition: wikiGetProjectContextDef, handler: withErrorHandling('wiki_get_project_context', handleWikiGetProjectContext) }
};
