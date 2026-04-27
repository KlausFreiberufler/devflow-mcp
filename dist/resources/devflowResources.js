/**
 * MCP Resources (DF-240)
 *
 * URI-Schema: `devflow://project/{projectId}/...`
 *  - /adr/{number}          → ADR content as text/markdown
 *  - /flow/{displayId}      → flow + plan + agent_summary
 *  - /graph                 → graph summary (nodes/edges counts, top-connected)
 *  - /search?q=...          → full-text search results
 */
import { devFlowClient } from '../api/client.js';
export async function listResources() {
    const projectId = devFlowClient.getLinkedProjectId();
    if (!projectId)
        return [];
    return [
        {
            uri: `devflow://project/${projectId}/graph`,
            name: 'Project Knowledge Graph',
            description: 'Summary of all wiki assets + links in the linked project',
            mimeType: 'text/markdown'
        }
    ];
}
function parseUri(uri) {
    const m = uri.match(/^devflow:\/\/project\/([^/]+)\/([^/?]+)(?:\/([^?]+))?(?:\?(.*))?$/);
    if (!m)
        return null;
    const query = {};
    if (m[4]) {
        for (const pair of m[4].split('&')) {
            const [k, v] = pair.split('=');
            if (k)
                query[decodeURIComponent(k)] = decodeURIComponent(v || '');
        }
    }
    return { projectId: m[1], kind: m[2], arg: m[3], query };
}
export async function readResource(uri) {
    const p = parseUri(uri);
    if (!p)
        throw new Error(`Invalid URI: ${uri}`);
    switch (p.kind) {
        case 'adr': {
            if (!p.arg)
                throw new Error('adr resource needs a number');
            const r = await devFlowClient.fetchAdr(p.projectId, p.arg);
            if (!r.success || !r.data)
                throw new Error(r.error || 'ADR not found');
            const a = r.data;
            return {
                uri,
                mimeType: 'text/markdown',
                text: `# ADR-${a.number}: ${a.title}\n\n**Status:** ${a.status}\n\n${a.content || '(no content)'}`
            };
        }
        case 'flow': {
            if (!p.arg)
                throw new Error('flow resource needs a displayId');
            // flow_get-equivalent via flow_list + filter (no direct by-displayId endpoint)
            const list = await devFlowClient.listFlows(p.projectId);
            if (!list.success || !list.data)
                throw new Error(list.error || 'Flow list failed');
            const flow = list.data.find(f => f.displayId === p.arg || f.id === p.arg);
            if (!flow)
                throw new Error(`Flow ${p.arg} not found`);
            return {
                uri,
                mimeType: 'text/markdown',
                text: [
                    `# ${flow.displayId}: ${flow.ticketSummary || flow.summary || '(no summary)'}`,
                    `**State:** ${flow.currentState}`,
                    '',
                    flow.implementationPlan ? `## Plan\n\n${flow.implementationPlan}` : '',
                    flow.agentSummary ? `## Agent Summary\n\n${flow.agentSummary}` : ''
                ].filter(Boolean).join('\n\n')
            };
        }
        case 'graph': {
            const r = await devFlowClient.fetchGraph(p.projectId);
            if (!r.success || !r.data)
                throw new Error(r.error || 'Graph failed');
            const g = r.data;
            const byType = g.nodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
            return {
                uri,
                mimeType: 'text/markdown',
                text: [
                    '# Project Knowledge Graph',
                    `**Total:** ${g.nodes.length} nodes · ${g.edges.length} edges`,
                    '',
                    '## Assets by type',
                    ...Object.entries(byType).map(([t, n]) => `- ${t}: ${n}`)
                ].join('\n')
            };
        }
        case 'search': {
            const q = p.query?.q || '';
            if (!q)
                throw new Error('search resource needs ?q=...');
            const r = await devFlowClient.searchWiki(p.projectId, q, 20);
            if (!r.success || !r.data)
                throw new Error(r.error || 'Search failed');
            const hits = r.data;
            return {
                uri,
                mimeType: 'text/markdown',
                text: [
                    `# Search: "${q}"`,
                    `${hits.length} hit(s)`,
                    '',
                    ...hits.map(h => `- ${h.assetType} **${h.title}**${h.snippet ? ` — ${h.snippet}` : ''}`)
                ].join('\n')
            };
        }
        default:
            throw new Error(`Unknown resource kind: ${p.kind}`);
    }
}
