/**
 * Auto-Status - Derives agentStatus from tool calls.
 *
 * The agent no longer needs to manually set agentStatus/agentMessage.
 * The server infers the status from which tools are called.
 */
import { devFlowClient } from '../api/client.js';
import { sessionContext } from './session.js';
/**
 * Derive agentStatus from a successful tool call.
 * Returns null if no status change is needed.
 */
export function deriveStatus(toolName, args) {
    switch (toolName) {
        case 'flow_update': {
            const targetState = args.currentState;
            const hasPlan = Boolean(args.implementationPlan);
            const hasSummary = Boolean(args.agentSummary);
            // Transition to review → idle
            if (targetState === 'approval' || targetState === 'review') {
                return {
                    agentStatus: 'idle',
                    agentMessage: targetState === 'approval'
                        ? 'Plan eingereicht'
                        : 'Review eingereicht',
                };
            }
            // Transition to planning → analyzing
            if (targetState === 'planning') {
                return { agentStatus: 'analyzing', agentMessage: 'Analyse gestartet' };
            }
            // Submitting plan without state change
            if (hasPlan && !targetState) {
                return { agentStatus: 'planning', agentMessage: 'Plan wird erstellt' };
            }
            // Submitting summary without state change
            if (hasSummary && !targetState) {
                return { agentStatus: 'implementing', agentMessage: 'Zusammenfassung geschrieben' };
            }
            // Explicit agentStatus set → don't override
            if (args.agentStatus)
                return null;
            return null;
        }
        case 'task_create':
            return { agentStatus: 'planning', agentMessage: 'Tasks erstellen' };
        case 'task_update': {
            if (args.isCompleted === true) {
                return { agentStatus: 'implementing', agentMessage: 'Implementierung' };
            }
            return null;
        }
        case 'flow_get_feedback':
            return { agentStatus: 'reviewing', agentMessage: 'Feedback pruefen' };
        case 'project_knowledge_update':
            return { agentStatus: 'implementing', agentMessage: 'Wissensbasis aktualisieren' };
        default:
            return null;
    }
}
/**
 * Apply derived status to the backend.
 * Non-blocking: errors are silently ignored.
 */
export function applyDerivedStatus(toolName, args) {
    const flowId = sessionContext.getFlowId();
    if (!flowId)
        return;
    const derived = deriveStatus(toolName, args);
    if (!derived)
        return;
    // Don't update if flow_update already includes explicit agentStatus
    if (toolName === 'flow_update' && args.agentStatus)
        return;
    // Fire-and-forget
    devFlowClient.updateFlow(flowId, {
        agentStatus: derived.agentStatus,
        agentMessage: derived.agentMessage,
    }).catch(() => { });
}
