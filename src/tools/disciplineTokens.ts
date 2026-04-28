/**
 * Discipline-Token Tools (DF-289 + DF-292)
 *
 * Two tools that let Claude emit + list HMAC-signed discipline-tokens, the
 * proof-of-discipline mechanism that powers `agent_with_discipline` self-approval:
 *
 *   - devflow_token_emit  — emit a fresh signed token for a skill on a flow
 *   - devflow_tokens_list — list active (non-expired) tokens for a flow
 *
 * Tokens are returned ONCE on emit (the backend stores only a hash). Claude
 * should keep the signed token in session memory and pass it to flow_update
 * when transitioning under `agent_with_discipline`.
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';

// ============ Definitions ============

const tokenEmitDef = {
  name: 'devflow_token_emit',
  description: `Emit a discipline-token for a flow + skill (DF-289 backend, DF-292 gate-check).

A discipline-token is an HMAC-signed proof that a discipline-skill ran successfully. The signed token is returned ONLY once — the backend stores only the hash. Keep the signed token in session memory.

Use this at the END of a discipline-skill run (devflow-tdd, devflow-verification-gate, devflow-adr-compliance, devflow-collision-acknowledged, ...) once all iron-laws of the skill are satisfied.

Pass the token later to flow_update when transitioning under \`agent_with_discipline\` policy:
  flow_update({ flowId, currentState: 'done', selfApproved: true, disciplineTokens: [token] })

The backend verifies all required tokens before allowing the transition. Without an opt-in project (project_configs.allow_agent_self_approval=1) and matching pipeline_steps.required_skills, the gate-check rejects.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: { type: 'string', description: 'Flow id this token belongs to' },
      skillName: { type: 'string', description: 'Discipline-skill name (e.g. "devflow-verification-gate")' },
      evidence: {
        type: 'object',
        description: 'Optional structured evidence (cycles, hashes, criteria results — kept verbatim for audit)',
        additionalProperties: true
      }
    },
    required: ['flowId', 'skillName']
  }
};

const tokensListDef = {
  name: 'devflow_tokens_list',
  description: `List active (non-expired) discipline-tokens for a flow. Does NOT return raw tokens — only metadata (id, skillName, createdAt, expiresAt, evidence). Use this to check what a flow already has before deciding whether to emit a fresh one.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: { type: 'string', description: 'Flow id' }
    },
    required: ['flowId']
  }
};

// ============ Handlers ============

async function handleTokenEmit(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  const skillName = args.skillName as string;
  if (!flowId || !skillName) return 'Error: flowId and skillName are required';
  const r = await devFlowClient.emitDisciplineToken(flowId, {
    skillName,
    evidence: args.evidence ?? null
  });
  if (!r.success || !r.data) return `Error: ${r.error || 'failed to emit token'}`;
  return JSON.stringify(
    {
      id: r.data.id,
      skillName: r.data.skillName,
      token: r.data.token,
      createdAt: r.data.createdAt,
      expiresAt: r.data.expiresAt,
      _hint: 'Store this token in session memory. The backend keeps only a hash — you cannot re-fetch the raw token.'
    },
    null,
    2
  );
}

async function handleTokensList(args: Record<string, unknown>): Promise<string> {
  const flowId = args.flowId as string;
  if (!flowId) return 'Error: flowId is required';
  const r = await devFlowClient.listActiveDisciplineTokens(flowId);
  if (!r.success || !r.data) return `Error: ${r.error || 'failed'}`;
  return JSON.stringify(r.data, null, 2);
}

// ============ Registry ============

export const tools: ToolModule = {
  devflow_token_emit: {
    definition: tokenEmitDef,
    handler: withErrorHandling('devflow_token_emit', handleTokenEmit)
  },
  devflow_tokens_list: {
    definition: tokensListDef,
    handler: withErrorHandling('devflow_tokens_list', handleTokensList)
  }
};
