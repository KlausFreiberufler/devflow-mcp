/**
 * Knowledge Drafts MCP Tools (DF-245)
 *
 * MCP-first path: Claude reads project context, classifies flows itself, and writes
 * drafts back via these tools. No server-side LLM, no API-key management. The backend
 * is a pure data-and-instruction provider; the thinking happens in Claude.
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from '../tools/registry.js';
import { withErrorHandling } from '../utils/errors.js';

function resolveProjectId(args: Record<string, unknown>): string | null {
  return (args.projectId as string | undefined) || devFlowClient.getLinkedProjectId();
}

// ============ Tool Definitions ============

const backfillRequestDef = {
  name: 'knowledge_backfill_request',
  description: `Prepare a knowledge backfill run for a project. Returns done-flows + existing ADRs + structured instructions that YOU (Claude) must follow to classify and propose knowledge drafts.

This is the MCP-first alternative to the keyword heuristic. Workflow:
1. Call this tool → receive flows, existing ADRs, and the ruleset
2. Read the flows, decide which qualify as ADR / Pattern / Runbook / Lessons-Learned
3. Skip anything already covered by existing ADRs
4. Group similar flows into ONE draft with multiple sourceFlowIds
5. For each draft: call knowledge_draft_create with the payload

Be conservative. Only propose drafts you are confident about. Better few high-quality drafts than many noisy ones.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project ID (defaults to linked project)' },
      limit: { type: 'number', description: 'Max flows to include (default 50, max 100)' }
    }
  }
};

const draftCreateDef = {
  name: 'knowledge_draft_create',
  description: `Create a new knowledge draft. Called by YOU (Claude) after classifying flows via knowledge_backfill_request, or standalone when you identify a flow worth documenting.

Dedup is automatic — if a draft with the same (projectId, draftType, title) already exists in any status, the existing draft is returned and sourceFlowIds are merged. You can safely call this repeatedly.

Rules:
- draftType: one of adr | pattern | runbook | lessons_learned
- title: deklarativ, max 60 chars, no prefix like "ADR candidate:"
- body: 2–6 short markdown paragraphs, the consumable form of the knowledge
- rationale: one sentence why this matters
- sourceFlowIds: all flow ids that contributed to this draft (grouping)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project ID (defaults to linked project)' },
      draftType: {
        type: 'string',
        enum: ['adr', 'pattern', 'runbook', 'lessons_learned'],
        description: 'The type of knowledge this draft represents'
      },
      title: { type: 'string', description: 'Declarative title, max 60 chars' },
      body: { type: 'string', description: 'Markdown body, 2-6 paragraphs' },
      rationale: { type: 'string', description: 'One sentence why this is worth capturing' },
      sourceFlowIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Flow ids that contributed to this draft'
      }
    },
    required: ['draftType', 'title']
  }
};

const draftListDef = {
  name: 'knowledge_draft_list',
  description: `List knowledge drafts for a project. Optional status filter (pending | accepted | rejected). Useful before proposing new drafts — check what is already queued so you don't duplicate your own suggestions.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] }
    }
  }
};

const draftAcceptDef = {
  name: 'knowledge_draft_accept',
  description: `Accept a draft. Creates the corresponding ADR or doc_page and marks the draft accepted. This is the commit step — use only when you are certain the draft is good to merge. Normally users accept via the UI; this tool exists for autonomous workflows.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'Draft id' }
    },
    required: ['id']
  }
};

const draftRejectDef = {
  name: 'knowledge_draft_reject',
  description: `Reject a draft with optional reviewer notes. Rejected drafts are remembered — dedup will not propose the same title again.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' },
      notes: { type: 'string', description: 'Why this draft was rejected' }
    },
    required: ['id']
  }
};

// ============ Handlers ============

async function handleBackfillRequest(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const limit = (args.limit as number | undefined) ?? 50;
  const r = await devFlowClient.prepareKnowledgeBackfill(projectId, limit);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  // Return the structured payload as JSON so Claude can reason over it
  return JSON.stringify(r.data, null, 2);
}

async function handleDraftCreate(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const draftType = args.draftType as 'adr' | 'pattern' | 'runbook' | 'lessons_learned';
  const title = args.title as string;
  if (!draftType || !title) return 'Error: draftType and title required';
  const r = await devFlowClient.createKnowledgeDraft({
    projectId,
    draftType,
    title,
    body: args.body as string | undefined,
    rationale: args.rationale as string | undefined,
    sourceFlowIds: args.sourceFlowIds as string[] | undefined,
    frontmatter: args.frontmatter as Record<string, unknown> | undefined
  });
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const d = r.data as { id: string; title: string; draftType: string; status: string };
  return `Draft created: ${d.id}\nType: ${d.draftType}\nTitle: ${d.title}\nStatus: ${d.status}`;
}

async function handleDraftList(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required';
  const r = await devFlowClient.listKnowledgeDrafts(projectId, args.status as string | undefined);
  if (!r.success || !r.data) return `Error: ${r.error}`;
  const rows = r.data as Array<{ id: string; draftType: string; title: string; status: string; sourceFlowIds: string[] }>;
  if (rows.length === 0) return 'No drafts.';
  return rows.map(d => `- [${d.status}] ${d.draftType}: ${d.title} (${d.id}) · sources: ${d.sourceFlowIds.length}`).join('\n');
}

async function handleDraftAccept(args: Record<string, unknown>): Promise<string> {
  const r = await devFlowClient.acceptKnowledgeDraft(args.id as string);
  if (!r.success) return `Error: ${r.error}`;
  return `Draft ${args.id} accepted.`;
}

async function handleDraftReject(args: Record<string, unknown>): Promise<string> {
  const r = await devFlowClient.rejectKnowledgeDraft(args.id as string, args.notes as string | undefined);
  if (!r.success) return `Error: ${r.error}`;
  return `Draft ${args.id} rejected.`;
}

// ============ Tool Registry Export ============

export const tools: ToolModule = {
  knowledge_backfill_request: { definition: backfillRequestDef, handler: withErrorHandling('knowledge_backfill_request', handleBackfillRequest) },
  knowledge_draft_create:     { definition: draftCreateDef,     handler: withErrorHandling('knowledge_draft_create',     handleDraftCreate) },
  knowledge_draft_list:       { definition: draftListDef,       handler: withErrorHandling('knowledge_draft_list',       handleDraftList) },
  knowledge_draft_accept:     { definition: draftAcceptDef,     handler: withErrorHandling('knowledge_draft_accept',     handleDraftAccept) },
  knowledge_draft_reject:     { definition: draftRejectDef,     handler: withErrorHandling('knowledge_draft_reject',     handleDraftReject) }
};
