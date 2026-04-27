/**
 * DF-255 — flow_seal_backfill MCP tool.
 * Runs sealFlow on every done-flow in the project (idempotent).
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
const def = {
    name: 'flow_seal_backfill',
    description: `One-shot: run flow_seal on every done-flow of a project. Idempotent —
re-running just refreshes reconciliations and merges new intents. Returns counts
(processed, drafts, intents, reconciliations, errors).`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string', description: 'Project ID (defaults to linked project).' }
        }
    }
};
async function handle(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    if (!projectId)
        return 'Error: projectId required (or link a project first via devflow_status action=link).';
    const r = await devFlowClient.flowSealBackfill?.(projectId) ??
        await devFlowClient.request?.('POST', `/api/projects/${projectId}/flow-seal-backfill`);
    if (!r?.success || !r?.data)
        return `Error: ${r?.error || 'backfill failed'}`;
    const d = r.data;
    return `✓ Backfill complete — processed ${d.processed} flows · drafts +${d.drafts} · intents +${d.intents} · reconciliations ${d.reconciliations} · errors ${d.errors}`;
}
export const tools = {
    flow_seal_backfill: { definition: def, handler: withErrorHandling('flow_seal_backfill', handle) }
};
