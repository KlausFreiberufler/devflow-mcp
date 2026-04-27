/**
 * DF-257 — project_bootstrap_audit MCP tool.
 * MCP-first: returns instructions for Claude to audit the local project
 * (read code with Glob/Grep/Read, then create architecture_module pages +
 * knowledge_drafts via doc_page_create / knowledge_draft_create).
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
const def = {
    name: 'project_bootstrap_audit',
    description: `Bootstrap the knowledge base of a project by auditing its code.
Returns a structured prompt: default subsystem list (auth/data/api/frontend/realtime/billing/admin/mobile/docs/devops/testing), dedup-list
of existing ADRs/drafts/pages, and explicit instructions for Claude to read
the local repo with Glob/Grep/Read and then create architecture_module pages +
knowledge drafts.

Call this once per new project. Idempotent — re-running will skip existing
entries via the dedup-list.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: { type: 'string', description: 'Project ID (defaults to linked project).' },
            subsystems: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional custom subsystem list. If omitted, uses auto-detect defaults.'
            }
        }
    }
};
async function handle(args) {
    const projectId = args.projectId || devFlowClient.getLinkedProjectId();
    if (!projectId)
        return 'Error: projectId required (or link a project via devflow_status action=link).';
    const subsystems = args.subsystems;
    const qs = subsystems?.length ? `?subsystems=${encodeURIComponent(subsystems.join(','))}` : '';
    const r = await devFlowClient.request?.('GET', `/api/projects/${projectId}/bootstrap-audit/prepare${qs}`);
    if (!r?.success || !r?.data)
        return `Error: ${r?.error || 'prepare failed'}`;
    return r.data.instructions || 'No instructions returned.';
}
export const tools = {
    project_bootstrap_audit: { definition: def, handler: withErrorHandling('project_bootstrap_audit', handle) }
};
