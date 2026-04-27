/**
 * Planning Context MCP Tool (DF-253)
 *
 * One-call bundle for Claude at the start of flow planning:
 * related ADRs, parallel open flows, similar done flows, forward-intents,
 * architecture-module excerpts, drift warnings. Priority-scored and budgeted
 * to stay under ~5500 tokens.
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
const planningContextDef = {
    name: 'planning_context',
    description: `Get a compact context bundle for planning a flow.
Returns related ADRs, parallel open flows, similar done flows, forward-intents,
architecture-module excerpts and drift warnings — all in one call, priority-
scored, budgeted under ~5500 tokens.

Call this AT THE START of planning instead of scattering wiki_search/adr_list/
flow_list calls. Use the markdown output directly as context; use the JSON
sections if you want to cross-reference specific items.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: { type: 'string', description: 'Flow ID (or display ID like DF-251 — resolved server-side).' }
        },
        required: ['flowId']
    }
};
async function handlePlanningContext(args) {
    const flowId = args.flowId;
    if (!flowId)
        return 'Error: flowId required';
    const r = await devFlowClient.fetchPlanningContext(flowId);
    if (!r.success || !r.data)
        return `Error: ${r.error || 'no context available'}`;
    const d = r.data;
    const header = `_Token estimate: ${d.tokenEstimate ?? '?'} · ${d.relatedAdrs?.length || 0} ADR(s), ` +
        `${d.parallelFlows?.length || 0} parallel, ${d.referenceFlows?.length || 0} reference, ` +
        `${d.forwardIntents?.length || 0} intent(s), ${d.architectureExcerpts?.length || 0} arch-page(s)._`;
    return `${header}\n\n${d.markdown || '_No context._'}`;
}
export const tools = {
    planning_context: {
        definition: planningContextDef,
        handler: withErrorHandling('planning_context', handlePlanningContext)
    }
};
