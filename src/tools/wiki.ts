/**
 * Wiki MCP Tools (DF-226)
 * Read-only tools for the Knowledge Wiki — wiki_search, wiki_backlinks, wiki_graph, etc.
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

function resolveProjectId(args: Record<string, unknown>): string | null {
  return (args.projectId as string | undefined) || devFlowClient.getLinkedProjectId();
}

// ============ Tool Definitions ============

const wikiSearchDef = {
  name: 'wiki_search',
  description: `Full-text search over all wiki assets (flows, doc_pages, reviews, releases).
Uses SQLite FTS5 with prefix matching. Returns hits with title + snippet.

Use this when the user asks "what do we know about X?" or to find relevant ADRs/Patterns/Runbooks before planning.`,
  inputSchema: {
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
    properties: {
      projectId: { type: 'string' }
    }
  }
};

// ============ Handlers ============

async function handleWikiSearch(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const q = args.q as string;
  const limit = (args.limit as number) || 20;
  const r = await devFlowClient.searchWiki(projectId, q, limit);
  if (!r.success || !r.data) return `Error: ${r.error || 'Search failed'}`;
  if (r.data.length === 0) return `No hits for "${q}".`;
  return r.data.map((h: any) => `- ${h.assetType} · ${h.title}\n  ${h.snippet || ''}`).join('\n\n');
}

async function handleWikiGetPage(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const raw = args.raw as string;
  const res = await devFlowClient.resolveWikiLink(projectId, raw);
  if (!res.success || !res.data) return `Not found: ${raw}`;
  const ref = res.data as { type: string; id: string };
  const backlinks = await devFlowClient.getBacklinks(ref.type, ref.id);
  const outgoing = await devFlowClient.getOutgoing(ref.type, ref.id);
  const bl = (backlinks.data || []) as any[];
  const og = (outgoing.data || []) as any[];
  return [
    `# Resolved: ${ref.type}:${ref.id}`,
    ``,
    `**Backlinks (${bl.length}):**`,
    ...bl.slice(0, 10).map((b: any) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField}) × ${b.mentions}`),
    ``,
    `**Outgoing (${og.length}):**`,
    ...og.slice(0, 10).map((o: any) => `- → ${o.targetType || 'unresolved'} ${o.targetId || o.targetRaw}`)
  ].join('\n');
}

async function handleWikiListByType(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const documentType = args.documentType as string;
  const graph = await devFlowClient.fetchGraph(projectId, [documentType]);
  if (!graph.success || !graph.data) return `Error: ${graph.error}`;
  const nodes = ((graph.data as any).nodes || []) as any[];
  if (nodes.length === 0) return `No ${documentType} pages found.`;
  return nodes.map(n => `- ${n.label} (${n.id})`).join('\n');
}

async function handleWikiBacklinks(args: Record<string, unknown>): Promise<string> {
  const r = await devFlowClient.getBacklinks(args.assetType as string, args.assetId as string);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  if (r.data.length === 0) return 'No backlinks.';
  return r.data.map((b: any) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField}) × ${b.mentions}`).join('\n');
}

async function handleWikiGraphNeighbors(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const r = await devFlowClient.fetchGraph(projectId, args.types as string[], args.tags as string[]);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const g = r.data as { nodes: any[]; edges: any[] };
  return `Graph: ${g.nodes.length} nodes · ${g.edges.length} edges\n\n` +
    `**Nodes (first 15):**\n` +
    g.nodes.slice(0, 15).map(n => `- ${n.type}: ${n.label}`).join('\n');
}

async function handleWikiGetFlowContext(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const [backlinks, outgoing] = await Promise.all([
    devFlowClient.getBacklinks('flow', flowId),
    devFlowClient.getOutgoing('flow', flowId)
  ]);
  const bl = (backlinks.data || []) as any[];
  const og = (outgoing.data || []) as any[];
  return [
    `# Flow ${flowId} Context`,
    ``,
    `**Outgoing wiki references (${og.length}):**`,
    ...og.map((o: any) => `- ${o.sourceField}: [[${o.targetRaw}]]${o.targetId ? '' : ' ⚠ unresolved'}`),
    ``,
    `**Backlinks from other assets (${bl.length}):**`,
    ...bl.map((b: any) => `- ${b.sourceType} ${b.sourceId} (${b.sourceField})`)
  ].join('\n');
}

async function handleWikiGetProjectContext(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const r = await devFlowClient.fetchGraph(projectId);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const g = r.data as { nodes: any[]; edges: any[] };
  const byType = g.nodes.reduce<Record<string, number>>((acc, n) => {
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

// ============ DF-310 + DF-312 — LLM-Wiki Phase 1 + 2 ============

const wikiGetBriefingDef = {
  name: 'wiki_get_briefing',
  description: `DF-310 — Per-flow LLM-Wiki briefing. Returns the curated set of related ADRs, related patterns/runbooks/intents, parallel work in scope, and open knowledge gaps for a specific flow. This is the same data the Knowledge-Tab in the UI renders via WikiBriefingPanel.

Use this in planning + before review→done to make sure the flow's plan + implementation respect the existing wiki and to find gaps that the agent should close (preferably via 'extend', see knowledge_check_resolve).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: { type: 'string', description: 'Flow id to build the briefing for' }
    },
    required: ['flowId']
  }
};

const wikiGetIndexDef = {
  name: 'wiki_get_index',
  description: `DF-312 — Hierarchical TOC of the project's wiki, grouped by lifecycle_stage (release / plan / idea / superseded / deprecated). Each entry has id, displayId, title, lifecycleStage, documentType, tags, updatedAt.

Use this for "what does the wiki actually contain" — global counterpart to wiki_get_briefing (which is per-flow).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project id (defaults to linked project)' }
    }
  }
};

const wikiGetLogDef = {
  name: 'wiki_get_log',
  description: `DF-312 — Chronological mutation feed of the wiki: ADR/doc_page creates, extends, supersedes, deprecates within a time window. Default window: 30 days. Use 'days' to widen up to 365.

Useful for "what's been happening to the wiki recently" — drives the Activity-Tab in the UI.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string' },
      days: { type: 'number', description: 'Window in days (default 30, max 365)' }
    }
  }
};

const ideasGetDef = {
  name: 'ideas_get',
  description: `DF-315 — Idea-Backlog: aggregates 5 organic idea sources from the wiki into one curated pipeline:

- Open intents (forward-deferred topics from past flows)
- Stale ADRs (>90d old, still cited — refresh candidates)
- Orphan pages (no in/out wiki-links — reconnect candidates)
- Contradictions (deprecated/superseded ADRs still cited — refactor candidates)
- Hotspot topics (resolved 2+ times across flows — strategic-review candidates)

Each item has a prefilledSummary + prefilledDescription ready to feed into flow_create. Use this to pick the next thing to work on without staring at a blank page — the wiki itself is the idea backlog.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project id (defaults to linked project)' }
    }
  }
};

const wikiGetLintDef = {
  name: 'wiki_get_lint',
  description: `DF-312 — Health-report of the wiki: stale (release-stage entries older than N days that are still cited), orphan (entries with no in/out wiki-links), contradictions (deprecated/superseded ADRs that newer sources still cite).

Use periodically (or before a major refactor) to keep the wiki clean. Resolve findings via the devflow-wiki-lint skill — never delete entries, always extend / cross-link / re-classify.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string' },
      staleDays: { type: 'number', description: 'Days before a release entry counts as stale (default 90)' }
    }
  }
};

async function handleWikiGetBriefing(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  if (!flowId) return 'Error: flowId required';
  const r = await devFlowClient.fetchWikiContext(flowId);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleWikiGetIndex(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const r = await devFlowClient.fetchWikiIndex(projectId);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleWikiGetLog(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const days = (args.days as number) || 30;
  const r = await devFlowClient.fetchWikiLog(projectId, days);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleWikiGetLint(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const staleDays = (args.staleDays as number) || 90;
  const r = await devFlowClient.fetchWikiLint(projectId, staleDays);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleIdeasGet(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const r = await devFlowClient.fetchIdeasBacklog(projectId);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  wiki_search:              { definition: wikiSearchDef,            handler: withErrorHandling('wiki_search', handleWikiSearch) },
  wiki_get_page:            { definition: wikiGetPageDef,           handler: withErrorHandling('wiki_get_page', handleWikiGetPage) },
  wiki_list_by_type:        { definition: wikiListByTypeDef,        handler: withErrorHandling('wiki_list_by_type', handleWikiListByType) },
  wiki_backlinks:           { definition: wikiBacklinksDef,         handler: withErrorHandling('wiki_backlinks', handleWikiBacklinks) },
  wiki_graph_neighbors:     { definition: wikiGraphNeighborsDef,    handler: withErrorHandling('wiki_graph_neighbors', handleWikiGraphNeighbors) },
  wiki_get_flow_context:    { definition: wikiGetFlowContextDef,    handler: withErrorHandling('wiki_get_flow_context', handleWikiGetFlowContext) },
  wiki_get_project_context: { definition: wikiGetProjectContextDef, handler: withErrorHandling('wiki_get_project_context', handleWikiGetProjectContext) },
  // DF-310 + DF-312 — LLM-Wiki Phase 1 + 2
  wiki_get_briefing:        { definition: wikiGetBriefingDef,       handler: withErrorHandling('wiki_get_briefing', handleWikiGetBriefing) },
  wiki_get_index:           { definition: wikiGetIndexDef,          handler: withErrorHandling('wiki_get_index', handleWikiGetIndex) },
  wiki_get_log:             { definition: wikiGetLogDef,            handler: withErrorHandling('wiki_get_log', handleWikiGetLog) },
  wiki_get_lint:            { definition: wikiGetLintDef,           handler: withErrorHandling('wiki_get_lint', handleWikiGetLint) },
  // DF-315 — Idea-Backlog
  ideas_get:                { definition: ideasGetDef,              handler: withErrorHandling('ideas_get', handleIdeasGet) }
};
