/**
 * MCP Prompts (DF-240) — guided knowledge workflows.
 *
 * Each prompt packages project context + a task instruction into a ready-to-run
 * conversation. Claude receives the prepared messages and can answer without
 * further tool calls for the common cases.
 */

import { devFlowClient } from '../api/client.js';

export interface PromptDescriptor {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
}

export const prompts: PromptDescriptor[] = [
  {
    name: 'ask_project',
    description: 'Load ADRs + recent done-flows as context and answer a free-form project question.',
    arguments: [
      { name: 'query', description: 'What do you want to know about the project?', required: true }
    ]
  },
  {
    name: 'plan_with_project_knowledge',
    description: 'Prepare a planning prompt for a flow that includes all relevant ADRs + related done-flows.',
    arguments: [
      { name: 'flowId', description: 'The flow you are planning', required: true }
    ]
  },
  {
    name: 'review_with_drift_check',
    description: 'Prepare a review prompt for a flow that includes drift warnings + missing knowledge suggestions.',
    arguments: [
      { name: 'flowId', description: 'The flow you are reviewing', required: true }
    ]
  }
];

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface PromptResult {
  description: string;
  messages: PromptMessage[];
}

async function loadProjectContext(projectId: string): Promise<string> {
  const [adrsRes, flowsRes] = await Promise.all([
    devFlowClient.fetchAdrs(projectId),
    devFlowClient.listFlows(projectId)
  ]);
  const adrs = (adrsRes.data as any[] | undefined) || [];
  const flows = ((flowsRes.data as any[] | undefined) || []).filter(f => f.currentState === 'done').slice(0, 10);
  return [
    `## Existing ADRs (${adrs.length})`,
    ...adrs.slice(0, 30).map(a => `- ADR-${a.number} (${a.status}): ${a.title}`),
    '',
    `## Recent done-flows (${flows.length})`,
    ...flows.map(f => `- ${f.displayId}: ${f.ticketSummary || f.summary || ''}`)
  ].join('\n');
}

export async function getPrompt(name: string, args: Record<string, string> = {}): Promise<PromptResult> {
  const projectId = devFlowClient.getLinkedProjectId();
  if (!projectId) {
    return {
      description: 'No linked project.',
      messages: [{ role: 'user', content: { type: 'text', text: 'Please link a DevFlow project first (devflow_connect).' } }]
    };
  }

  switch (name) {
    case 'ask_project': {
      const query = args.query || '(no query provided)';
      const ctx = await loadProjectContext(projectId);
      return {
        description: `Answering: ${query}`,
        messages: [
          { role: 'user', content: { type: 'text', text: `${ctx}\n\n---\n\n${query}\n\nUse the context above. If you need more detail, call wiki_search or read a resource at devflow://project/${projectId}/adr/<number>.` } }
        ]
      };
    }
    case 'plan_with_project_knowledge': {
      const flowId = args.flowId;
      if (!flowId) throw new Error('flowId required');
      const ctx = await loadProjectContext(projectId);
      return {
        description: `Plan for ${flowId} with project knowledge`,
        messages: [
          { role: 'user', content: { type: 'text', text: `You are planning flow ${flowId}.\n\n${ctx}\n\n---\n\nRead the ADRs that are likely relevant (use the wiki_search tool or read devflow://project/${projectId}/adr/<number>). Then propose an implementation plan that respects the existing decisions. Flag any conflict or update needed.` } }
        ]
      };
    }
    case 'review_with_drift_check': {
      const flowId = args.flowId;
      if (!flowId) throw new Error('flowId required');
      const checkRes = await devFlowClient.prepareKnowledgeCheck(flowId);
      const checkData = checkRes.success ? JSON.stringify(checkRes.data, null, 2) : `(check failed: ${checkRes.error})`;
      return {
        description: `Review ${flowId} with drift/missing check`,
        messages: [
          { role: 'user', content: { type: 'text', text: `You are reviewing flow ${flowId}.\n\nKnowledge-check payload:\n\`\`\`json\n${checkData}\n\`\`\`\n\n---\n\nFollow the instructions in the payload. Return { diff, missing } as specified. Be conservative.` } }
        ]
      };
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
