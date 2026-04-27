/**
 * Agent Session MCP Tools
 * Tools for creating, logging, completing, and listing agent sessions in DevFlow
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
// ============ Tool Definitions ============
const agentSessionCreateDef = {
    name: 'agent_session_create',
    description: `Create a new agent session for a flow.
An agent session tracks a unit of work performed by the AI agent.
Use this at the start of a work session to log what you're doing.

Returns the created session with its ID for subsequent log and complete calls.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: {
                type: 'string',
                description: 'The flow ID this session belongs to'
            },
            type: {
                type: 'string',
                description: 'Type of session (e.g., "planning", "implementing", "reviewing"). Optional.'
            }
        },
        required: ['flowId']
    }
};
const agentSessionLogDef = {
    name: 'agent_session_log',
    description: `Log a message to an active agent session.
Use this to record progress, decisions, or issues during a work session.

Supports different log levels:
- info: General progress updates (default)
- warn: Potential issues or concerns
- error: Errors encountered during work`,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'The agent session ID to log to'
            },
            message: {
                type: 'string',
                description: 'The log message to record'
            },
            level: {
                type: 'string',
                enum: ['info', 'warn', 'error'],
                description: 'Log level (default: info)'
            }
        },
        required: ['id', 'message']
    }
};
const agentSessionCompleteDef = {
    name: 'agent_session_complete',
    description: `Complete an active agent session.
Use this when you're done with a unit of work to mark the session as finished.
Optionally provide a summary of what was accomplished.`,
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'The agent session ID to complete'
            },
            summary: {
                type: 'string',
                description: 'Summary of what was accomplished during this session'
            }
        },
        required: ['id']
    }
};
const agentSessionListDef = {
    name: 'agent_session_list',
    description: `List agent sessions for a flow.
Returns all sessions with their status, timing, and summary.
Use this to review past work sessions on a flow.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: {
                type: 'string',
                description: 'The flow ID to list sessions for'
            }
        },
        required: ['flowId']
    }
};
// ============ Tool Handlers ============
async function handleAgentSessionCreate(args) {
    const flowId = args.flowId;
    const type = args.type;
    const result = await devFlowClient.createAgentSession({ flowId: flowId, type });
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to create agent session'}`;
    }
    return `Agent session created successfully.\n\n${formatSessionDetail(result.data)}`;
}
async function handleAgentSessionLog(args) {
    const id = args.id;
    const message = args.message;
    const level = args.level || 'info';
    const result = await devFlowClient.logAgentSession(id, { message, level });
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to log to agent session'}`;
    }
    const log = result.data;
    return `Log entry added.\n\n**Level:** ${log.level}\n**Message:** ${log.message}\n**Time:** ${new Date(log.createdAt).toLocaleString()}`;
}
async function handleAgentSessionComplete(args) {
    const id = args.id;
    const summary = args.summary;
    const result = await devFlowClient.completeAgentSession(id, summary ? { summary } : undefined);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to complete agent session'}`;
    }
    return `Agent session completed.\n\n${formatSessionDetail(result.data)}`;
}
async function handleAgentSessionList(args) {
    const flowId = args.flowId;
    const result = await devFlowClient.listAgentSessions(flowId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to list agent sessions'}`;
    }
    const sessions = result.data;
    if (sessions.length === 0) {
        return 'No agent sessions found for this flow.';
    }
    return formatSessionList(sessions);
}
// ============ Formatters ============
function formatSessionList(sessions) {
    const lines = ['# Agent Sessions\n'];
    const active = sessions.filter((s) => !s.completedAt);
    const completed = sessions.filter((s) => s.completedAt);
    if (active.length > 0) {
        lines.push(`## Active (${active.length})\n`);
        for (const s of active) {
            const type = s.type ? ` [${s.type}]` : '';
            lines.push(`- **${s.id}**${type}`);
            lines.push(`  Started: ${new Date(s.createdAt).toLocaleString()}`);
        }
        lines.push('');
    }
    if (completed.length > 0) {
        lines.push(`## Completed (${completed.length})\n`);
        for (const s of completed) {
            const type = s.type ? ` [${s.type}]` : '';
            lines.push(`- **${s.id}**${type}`);
            lines.push(`  Started: ${new Date(s.createdAt).toLocaleString()}`);
            if (s.completedAt) {
                lines.push(`  Completed: ${new Date(s.completedAt).toLocaleString()}`);
            }
            if (s.summary) {
                lines.push(`  Summary: ${s.summary.substring(0, 150)}${s.summary.length > 150 ? '...' : ''}`);
            }
        }
        lines.push('');
    }
    return lines.join('\n');
}
function formatSessionDetail(session) {
    const lines = [
        `## Agent Session`,
        '',
        `**ID:** ${session.id}`,
        `**Flow:** ${session.flowId}`,
        `**Status:** ${session.status}`,
    ];
    if (session.type) {
        lines.push(`**Type:** ${session.type}`);
    }
    lines.push(`**Started:** ${new Date(session.createdAt).toLocaleString()}`);
    if (session.completedAt) {
        lines.push(`**Completed:** ${new Date(session.completedAt).toLocaleString()}`);
    }
    if (session.summary) {
        lines.push('');
        lines.push('### Summary');
        lines.push(session.summary);
    }
    return lines.join('\n');
}
// ============ Tool Registry Export ============
export const tools = {
    agent_session_create: {
        definition: agentSessionCreateDef,
        handler: withErrorHandling('agent_session_create', handleAgentSessionCreate),
    },
    agent_session_log: {
        definition: agentSessionLogDef,
        handler: withErrorHandling('agent_session_log', handleAgentSessionLog),
    },
    agent_session_complete: {
        definition: agentSessionCompleteDef,
        handler: withErrorHandling('agent_session_complete', handleAgentSessionComplete),
    },
    agent_session_list: {
        definition: agentSessionListDef,
        handler: withErrorHandling('agent_session_list', handleAgentSessionList),
    },
};
