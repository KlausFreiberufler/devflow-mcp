/**
 * ADR MCP Tools (DF-226)
 * Architecture Decision Records — list, get, accept (from decision.md), update status
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

function resolveProjectId(args: Record<string, unknown>): string | null {
  return (args.projectId as string | undefined) || devFlowClient.getLinkedProjectId();
}

const adrListDef = {
  name: 'adr_list',
  description: `List all Architecture Decision Records for a project.
Optional status filter (proposed | accepted | deprecated | superseded).
Returns ADR-###, title, status, decided_at.`,
  inputSchema: {
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
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
    type: 'object' as const,
    properties: {
      adrId: { type: 'string' },
      status: { type: 'string', description: 'proposed | accepted | deprecated | superseded' }
    },
    required: ['adrId', 'status']
  }
};

// ============ Handlers ============

async function handleAdrList(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const r = await devFlowClient.fetchAdrs(projectId, args.status as string | undefined);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  if (r.data.length === 0) return 'No ADRs yet.';
  return r.data.map((a: any) => `- **${a.displayId}** · ${a.title} [${a.status}] — ${a.decidedAt?.slice(0,10)}`).join('\n');
}

async function handleAdrGet(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const r = await devFlowClient.fetchAdr(projectId, args.number as number);
  if (!r.success || !r.data) return `ADR not found: ${args.number}`;
  const a = r.data as any;
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
      ? `## Consequences\n${fm.consequences.map((c: string) => `- ${c}`).join('\n')}`
      : ''
  ].filter(Boolean).join('\n\n');
}

async function handleAdrAccept(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const attachmentId = args.attachmentId as string;
  const r = await devFlowClient.acceptAdrFromAttachment(projectId, attachmentId, {
    supersedesId: args.supersedesId as string | undefined,
    status: args.status as string | undefined
  });
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const a = r.data as any;
  return `✓ ADR accepted: **${a.displayId}** · ${a.title} [${a.status}]`;
}

async function handleAdrGetAuditLog(args: Record<string, unknown>): Promise<string> {
  const r = await devFlowClient.fetchAdrAuditLog(args.adrId as string);
  if (!r.success || !r.data) return `Error: ${r.error || 'audit log not available'}`;
  const entries = r.data as any[];
  if (entries.length === 0) return 'No audit entries yet.';
  return entries
    .map((e: any) => {
      const who = e.userName || e.userId || 'unknown';
      const when = (e.createdAt || '').slice(0, 19).replace('T', ' ');
      const note = e.note ? ` — ${e.note}` : '';
      return `- ${when} · ${who}: ${e.oldStatus || '∅'} → ${e.newStatus}${note}`;
    })
    .join('\n');
}

async function handleAdrUpdateStatus(args: Record<string, unknown>): Promise<string> {
  const r = await devFlowClient.updateAdrStatus(args.adrId as string, args.status as string);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const a = r.data as any;
  return `✓ ${a.displayId} → status: ${a.status}`;
}

export const tools: ToolModule = {
  adr_list:          { definition: adrListDef,         handler: withErrorHandling('adr_list', handleAdrList) },
  adr_get:           { definition: adrGetDef,          handler: withErrorHandling('adr_get', handleAdrGet) },
  adr_accept:        { definition: adrAcceptDef,       handler: withErrorHandling('adr_accept', handleAdrAccept) },
  adr_update_status: { definition: adrUpdateStatusDef, handler: withErrorHandling('adr_update_status', handleAdrUpdateStatus) },
  adr_get_audit_log: { definition: adrGetAuditLogDef,  handler: withErrorHandling('adr_get_audit_log', handleAdrGetAuditLog) }
};
