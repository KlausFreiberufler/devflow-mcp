/**
 * State-aware Planning + Resolution Tools (DF-269)
 *
 * Four tools that let Claude use the backend features from DF-261/263/264:
 *   - pending_work              — 4-bucket snapshot of in-flight work
 *   - intent_resolve            — close a forward-intent page
 *   - knowledge_autotag_suggest — TF-IDF tag suggestions from existing project tags
 *   - knowledge_check_resolve   — resolve a knowledge-check warning (adr/pattern/runbook/intent_defer/dismiss)
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';

function resolveProjectId(args: Record<string, unknown>): string | null {
  return (args.projectId as string | undefined) || devFlowClient.getLinkedProjectId();
}

// ============ Definitions ============

const pendingWorkDef = {
  name: 'pending_work',
  description: `Snapshot of open work across the project. Returns four buckets:
- inFlightFlows: flows currently in planning / in_progress / review
- openIntents: forward-intent doc-pages with status != 'resolved' (from flow_seal / DF-254)
- proposedAdrs: ADRs with status='proposed' (not yet accepted)
- pendingDrafts: knowledge_drafts with status='pending'

Use this BEFORE starting planning so you don't propose something already in flight or already captured as an intent. Optional tag / path filters narrow the result to your area. Pass excludeFlowId=<current flowId> to exclude the flow you are currently planning for.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project ID (defaults to linked project)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tag (any match)' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Filter by affects-path glob (any match)' },
      excludeFlowId: { type: 'string', description: 'Flow id to exclude (your current flow)' }
    }
  }
};

const intentResolveDef = {
  name: 'intent_resolve',
  description: `Close a forward-intent page. Sets frontmatter.status='resolved' and links the resolving flow.

Forward-intents are doc_pages with document_type='intent' — written by flow_seal (DF-254) when a done-flow declared follow-up work via forward_intents frontmatter. When your current flow actually delivers that follow-up, call this tool so the loop is closed and the intent disappears from pending_work / planning_context.

flowId = the flow that is resolving the intent (typically your current flow).
pageId = the intent doc-page id (find via pending_work → openIntents).`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: { type: 'string', description: 'Flow that resolves the intent (usually your current flow)' },
      pageId: { type: 'string', description: 'Intent doc-page id' },
      note: { type: 'string', description: 'Optional resolution note' }
    },
    required: ['flowId', 'pageId']
  }
};

const autotagSuggestDef = {
  name: 'knowledge_autotag_suggest',
  description: `Suggest project tags for a piece of content using TF-IDF against the existing project tag pool. Never invents new tags — only existing ones are suggested, to avoid tag-wildwuchs.

Use when you are writing a new doc-page / ADR / flow summary and want to tag it consistently with the rest of the project. Returns suggestions ranked by confidence with matchedTokens for debuggability.

Pass existingTags so already-applied tags are excluded from suggestions.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string', description: 'Project ID (defaults to linked project)' },
      content: { type: 'string', description: 'Markdown / plain text to classify' },
      existingTags: { type: 'array', items: { type: 'string' }, description: 'Tags already set — excluded from suggestions' },
      limit: { type: 'number', description: 'Max suggestions (default 5)' }
    },
    required: ['content']
  }
};

const knowledgeCheckResolveDef = {
  name: 'knowledge_check_resolve',
  description: `Resolve a warning from knowledge_check_flow / knowledge_check_drift so it stops blocking the gate and disappears on the next check.

Five resolution types:
- 'adr'           — a new/existing ADR covers the topic (pass entityType='adr', entityId=<adrId>)
- 'pattern'       — existing pattern doc covers it (entityType='doc_page', entityId=<pageId>)
- 'runbook'       — existing runbook covers it
- 'intent_defer'  — not doing it now, but deferring as a forward-intent. Seeds an intent doc-page automatically. Optional horizon: 'next-quarter'|'later'.
- 'dismiss'       — warning is a false positive. Reason recommended.

flowId = the flow the warning is attached to. topic = the warning's topic string (e.g. 'billing', 'cache-invalidation').`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: { type: 'string', description: 'Flow id the warning belongs to' },
      topic: { type: 'string', description: 'Topic string from the warning' },
      resolutionType: {
        type: 'string',
        enum: ['adr', 'pattern', 'runbook', 'intent_defer', 'dismiss'],
        description: 'How this warning is being resolved'
      },
      entityType: { type: 'string', description: "Linked entity type ('adr' or 'doc_page')" },
      entityId: { type: 'string', description: 'Linked entity id' },
      reason: { type: 'string', description: 'Free-text note (recommended for dismiss)' },
      horizon: { type: 'string', description: "For intent_defer: 'next-quarter' | 'later'" }
    },
    required: ['flowId', 'topic', 'resolutionType']
  }
};

// ============ Handlers ============

async function handlePendingWork(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const r = await devFlowClient.fetchPendingWork(projectId, {
    tags: args.tags as string[] | undefined,
    paths: args.paths as string[] | undefined,
    excludeFlowId: args.excludeFlowId as string | undefined
  });
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleIntentResolve(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const pageId = args.pageId as string;
  if (!flowId || !pageId) return 'Error: flowId and pageId required';
  const r = await devFlowClient.resolveIntent(flowId, pageId, args.note as string | undefined);
  if (!r.success) return `Error: ${r.error || 'failed'}`;
  return `Intent ${pageId} resolved by flow ${flowId}.`;
}

async function handleAutotagSuggest(args: Record<string, unknown>): Promise<string> {
  const projectId = resolveProjectId(args);
  if (!projectId) return 'Error: projectId required (or link a project)';
  const content = args.content as string;
  if (!content || typeof content !== 'string') return 'Error: content required';
  const r = await devFlowClient.suggestAutoTags(projectId, content, {
    existingTags: args.existingTags as string[] | undefined,
    limit: args.limit as number | undefined
  });
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

async function handleKnowledgeCheckResolve(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const topic = args.topic as string;
  const resolutionType = args.resolutionType as 'adr' | 'pattern' | 'runbook' | 'intent_defer' | 'dismiss';
  if (!flowId || !topic || !resolutionType) {
    return 'Error: flowId, topic, and resolutionType are required';
  }
  const r = await devFlowClient.createKnowledgeResolution(flowId, {
    topic,
    resolutionType,
    entityType: args.entityType as string | undefined,
    entityId: args.entityId as string | undefined,
    reason: args.reason as string | undefined,
    horizon: args.horizon as string | undefined
  });
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return `Resolution created: ${resolutionType} for topic "${topic}" on flow ${flowId}.`;
}

// ============ Registry ============

export const tools: ToolModule = {
  pending_work: {
    definition: pendingWorkDef,
    handler: withErrorHandling('pending_work', handlePendingWork)
  },
  intent_resolve: {
    definition: intentResolveDef,
    handler: withErrorHandling('intent_resolve', handleIntentResolve)
  },
  knowledge_autotag_suggest: {
    definition: autotagSuggestDef,
    handler: withErrorHandling('knowledge_autotag_suggest', handleAutotagSuggest)
  },
  knowledge_check_resolve: {
    definition: knowledgeCheckResolveDef,
    handler: withErrorHandling('knowledge_check_resolve', handleKnowledgeCheckResolve)
  }
};
