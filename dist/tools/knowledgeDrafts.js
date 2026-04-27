/**
 * Knowledge Drafts MCP Tools (DF-245)
 *
 * MCP-first path: Claude reads project context, classifies flows itself, and writes
 * drafts back via these tools. No server-side LLM, no API-key management. The backend
 * is a pure data-and-instruction provider; the thinking happens in Claude.
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
function resolveProjectId(args) {
    return args.projectId || devFlowClient.getLinkedProjectId();
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
        type: 'object',
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
        type: 'object',
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
        type: 'object',
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
        type: 'object',
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
        type: 'object',
        properties: {
            id: { type: 'string' },
            notes: { type: 'string', description: 'Why this draft was rejected' }
        },
        required: ['id']
    }
};
const harvestDef = {
    name: 'knowledge_harvest',
    description: `Harvest knowledge from a single done-flow. Call this right after flow_update transitions a flow to done (the server's nextStep will remind you). Returns the flow + existing ADRs + related drafts + instructions. Decide: does this flow warrant a new draft? If yes, call knowledge_draft_create. If the theme is already covered, skip.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: { type: 'string', description: 'Flow id to harvest (must be in done state)' }
        },
        required: ['flowId']
    }
};
const checkDriftDef = {
    name: 'knowledge_check_drift',
    description: `Check whether an ADR has drifted from the actual codebase.

Returns the ADR content + its affects_paths (glob patterns). YOU THEN:
1. Use your own Glob/Read/Grep tools to inspect the files under those paths in the user's workspace
2. Compare the ADR's claims/decisions to what the code actually does
3. Return a structured drift report: { drifts: [{ claim, evidence, severity }] } or {} if no drift.

If affectsPaths is empty, tell the user: "ADR-N has no affects_paths configured — ask them to add glob patterns via the UI".`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string' },
            adrNumber: { type: 'number', description: 'ADR number to check' }
        },
        required: ['adrNumber']
    }
};
const checkFlowDef = {
    name: 'knowledge_check_flow',
    description: `Run a knowledge check on a flow: spot drift against existing ADRs and identify missing knowledge (topics without an asset). Returns flow text + ADR snapshots + instructions. YOU return the analysis — no draft creation in this tool. Use before submitting a flow to review.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: { type: 'string' }
        },
        required: ['flowId']
    }
};
// ============ Handlers ============
async function handleBackfillRequest(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const limit = args.limit ?? 50;
    const r = await devFlowClient.prepareKnowledgeBackfill(projectId, limit);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    // Return the structured payload as JSON so Claude can reason over it
    return JSON.stringify(r.data, null, 2);
}
async function handleDraftCreate(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const draftType = args.draftType;
    const title = args.title;
    if (!draftType || !title)
        return 'Error: draftType and title required';
    const r = await devFlowClient.createKnowledgeDraft({
        projectId,
        draftType,
        title,
        body: args.body,
        rationale: args.rationale,
        sourceFlowIds: args.sourceFlowIds,
        frontmatter: args.frontmatter
    });
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const d = r.data;
    return `Draft created: ${d.id}\nType: ${d.draftType}\nTitle: ${d.title}\nStatus: ${d.status}`;
}
async function handleDraftList(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const r = await devFlowClient.listKnowledgeDrafts(projectId, args.status);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const rows = r.data;
    if (rows.length === 0)
        return 'No drafts.';
    return rows.map(d => `- [${d.status}] ${d.draftType}: ${d.title} (${d.id}) · sources: ${d.sourceFlowIds.length}`).join('\n');
}
async function handleDraftAccept(args) {
    const r = await devFlowClient.acceptKnowledgeDraft(args.id);
    if (!r.success)
        return `Error: ${r.error}`;
    return `Draft ${args.id} accepted.`;
}
async function handleDraftReject(args) {
    const r = await devFlowClient.rejectKnowledgeDraft(args.id, args.notes);
    if (!r.success)
        return `Error: ${r.error}`;
    return `Draft ${args.id} rejected.`;
}
async function handleHarvest(args) {
    const flowId = args.flowId;
    if (!flowId)
        return 'Error: flowId required';
    const r = await devFlowClient.prepareKnowledgeHarvest(flowId);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    return JSON.stringify(r.data, null, 2);
}
async function handleCheckDrift(args) {
    const projectId = resolveProjectId(args);
    if (!projectId)
        return 'Error: projectId required';
    const adrNumber = args.adrNumber;
    if (!adrNumber)
        return 'Error: adrNumber required';
    const r = await devFlowClient.fetchAdr(projectId, adrNumber);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    const adr = r.data;
    return JSON.stringify({
        adr: {
            number: adr.number,
            title: adr.title,
            status: adr.status,
            content: adr.content,
            affectsPaths: adr.affectsPaths || []
        },
        instructions: {
            task: 'Inspect the files under affectsPaths (your own Glob/Read/Grep tools) and compare with ADR content.',
            output: 'Return { drifts: [{ claim, evidence, severity: "info"|"warn"|"critical" }], summary } or {} if no drift.',
            rules: [
                'If affectsPaths is empty: report back that the user should configure them',
                'Be conservative — only flag contradictions you can point to with a file+line',
                'Ignore trivial wording differences'
            ]
        }
    }, null, 2);
}
async function handleCheckFlow(args) {
    const flowId = args.flowId;
    if (!flowId)
        return 'Error: flowId required';
    const r = await devFlowClient.prepareKnowledgeCheck(flowId);
    if (!r.success || !r.data)
        return `Error: ${r.error}`;
    return JSON.stringify(r.data, null, 2);
}
// ============ Tool Registry Export ============
export const tools = {
    knowledge_backfill_request: { definition: backfillRequestDef, handler: withErrorHandling('knowledge_backfill_request', handleBackfillRequest) },
    knowledge_draft_create: { definition: draftCreateDef, handler: withErrorHandling('knowledge_draft_create', handleDraftCreate) },
    knowledge_draft_list: { definition: draftListDef, handler: withErrorHandling('knowledge_draft_list', handleDraftList) },
    knowledge_draft_accept: { definition: draftAcceptDef, handler: withErrorHandling('knowledge_draft_accept', handleDraftAccept) },
    knowledge_draft_reject: { definition: draftRejectDef, handler: withErrorHandling('knowledge_draft_reject', handleDraftReject) },
    knowledge_harvest: { definition: harvestDef, handler: withErrorHandling('knowledge_harvest', handleHarvest) },
    knowledge_check_flow: { definition: checkFlowDef, handler: withErrorHandling('knowledge_check_flow', handleCheckFlow) },
    knowledge_check_drift: { definition: checkDriftDef, handler: withErrorHandling('knowledge_check_drift', handleCheckDrift) }
};
