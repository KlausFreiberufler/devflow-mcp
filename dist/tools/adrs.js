/**
 * ADR MCP Tools (DF-226)
 * Architecture Decision Records — list, get, accept (from decision.md), update status
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
function resolveProjectId(args) {
    return args.projectId || devFlowClient.getLinkedProjectId();
}
const adrListDef = {
    name: 'adr_list',
    description: `List all Architecture Decision Records for a project.
Optional status filter (proposed | accepted | deprecated | superseded).
Returns ADR-###, title, status, decided_at.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            status: { type: 'string', description: 'Filter by status' }
        }
    }
};
const adrGetDef = {
    name: 'adr_get',
    description: `Get a single ADR by its number. Returns full content, status, supersedes chain, originated flow.
Use this to pull the full rationale of a specific decision before planning changes.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            number: { type: 'number', description: 'ADR number (1-based)' }
        },
        required: ['number']
    }
};
const adrAcceptDef = {
    name: 'adr_accept',
    description: `Accept a decision.md flow-attachment as an official ADR.
Auto-assigns the next ADR number for this project, copies frontmatter, links back to the flow.
Idempotent: re-calling with the same attachmentId returns the existing ADR.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            attachmentId: { type: 'string', description: 'ID of the decision.md attachment' },
            supersedesId: { type: 'string', description: 'Optional — ID of an ADR this one supersedes' },
            status: { type: 'string', description: 'Optional override (default: accepted)' }
        },
        required: ['attachmentId']
    }
};
const adrGetAuditLogDef = {
    name: 'adr_get_audit_log',
    description: `Get the audit log (status change history) for an ADR.
Returns the full timeline of status transitions with user, timestamp and optional note.
Use this to understand why a decision moved from proposed → accepted or was later deprecated/superseded.`,
    inputSchema: {
        type: 'object',
        properties: {
            adrId: { type: 'string', description: 'Internal ADR id (not the display number)' }
        },
        required: ['adrId']
    }
};
const adrUpdateStatusDef = {
    name: 'adr_update_status',
    description: `Change an ADR's status (proposed → accepted → deprecated → superseded).
Use when an architectural decision is formally accepted, deprecated, or replaced.`,
    inputSchema: {
        type: 'object',
        properties: {
            adrId: { type: 'string' },
            status: { type: 'string', description: 'proposed | accepted | deprecated | superseded' }
        },
        required: ['adrId', 'status']
    }
};
// ============ Handlers ============
async function handleAdrList(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const r = await devFlowClient.fetchAdrs(projectId, args.status);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    if (r.data.length === 0)
        return 'No ADRs yet.';
    return r.data.map((a) => `- **${a.displayId}** · ${a.title} [${a.status}] — ${a.decidedAt?.slice(0, 10)}`).join('\n');
}
async function handleAdrGet(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const r = await devFlowClient.fetchAdr(projectId, args.number);
    if (!r.success || !r.data)
        return `ADR not found: ${args.number}`;
    const a = r.data;
    const fm = a.frontmatter || {};
    return [
        `# ${a.displayId} · ${a.title}`,
        `**Status:** ${a.status}`,
        a.supersedesId ? `**Supersedes:** ${a.supersedes?.displayId || a.supersedesId}` : '',
        a.supersededById ? `**Superseded by:** ${a.supersededBy?.displayId || a.supersededById}` : '',
        a.originatedFlowId ? `**Originated in flow:** ${a.originatedFlowId}` : '',
        ``,
        fm.context ? `## Context\n${fm.context}` : '',
        fm.decision ? `## Decision\n${fm.decision}` : '',
        Array.isArray(fm.consequences) && fm.consequences.length > 0
            ? `## Consequences\n${fm.consequences.map((c) => `- ${c}`).join('\n')}`
            : ''
    ].filter(Boolean).join('\n\n');
}
async function handleAdrAccept(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const attachmentId = args.attachmentId;
    const r = await devFlowClient.acceptAdrFromAttachment(projectId, attachmentId, {
        supersedesId: args.supersedesId,
        status: args.status
    });
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const a = r.data;
    return `✓ ADR accepted: **${a.displayId}** · ${a.title} [${a.status}]`;
}
async function handleAdrGetAuditLog(args) {
    const r = await devFlowClient.fetchAdrAuditLog(args.adrId);
    if (!r.success || !r.data)
        return `Error: ${r.error || 'audit log not available'}`;
    const entries = r.data;
    if (entries.length === 0)
        return 'No audit entries yet.';
    return entries
        .map((e) => {
        const who = e.userName || e.userId || 'unknown';
        const when = (e.createdAt || '').slice(0, 19).replace('T', ' ');
        const note = e.note ? ` — ${e.note}` : '';
        return `- ${when} · ${who}: ${e.oldStatus || '∅'} → ${e.newStatus}${note}`;
    })
        .join('\n');
}
async function handleAdrUpdateStatus(args) {
    const r = await devFlowClient.updateAdrStatus(args.adrId, args.status);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const a = r.data;
    return `✓ ${a.displayId} → status: ${a.status}`;
}
export const tools = {
    adr_list: { definition: adrListDef, handler: withErrorHandling('adr_list', handleAdrList) },
    adr_get: { definition: adrGetDef, handler: withErrorHandling('adr_get', handleAdrGet) },
    adr_accept: { definition: adrAcceptDef, handler: withErrorHandling('adr_accept', handleAdrAccept) },
    adr_update_status: { definition: adrUpdateStatusDef, handler: withErrorHandling('adr_update_status', handleAdrUpdateStatus) },
    adr_get_audit_log: { definition: adrGetAuditLogDef, handler: withErrorHandling('adr_get_audit_log', handleAdrGetAuditLog) }
};
