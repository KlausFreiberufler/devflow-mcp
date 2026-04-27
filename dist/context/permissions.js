/**
 * State-Permission Map
 *
 * Defines which tools work without init (discovery) and block messages.
 *
 * Permissions are now solely determined by the backend via `allowedActions`
 * returned during session init and next-step resolution.
 */
import { getConfig } from '../config/sync.js';
/** Tools that work WITHOUT devflow_init (discovery mode) */
export const DISCOVERY_TOOLS = new Set([
    'flow_list',
    'flow_create',
    'devflow_init',
    'devflow_status',
    'devflow_connect',
    'devflow_disconnect',
    'project_guidelines_get',
]);
/**
 * NEXT_STEP_GUIDANCE - Proxy that reads from active config.
 * Existing code (init.ts, flow.ts) can use NEXT_STEP_GUIDANCE[state] as before,
 * but the values come from the remote config when available.
 */
export const NEXT_STEP_GUIDANCE = new Proxy({}, {
    get(_target, prop) {
        return getConfig().nextStepGuidance[prop];
    },
    has(_target, prop) {
        return prop in getConfig().nextStepGuidance;
    },
    ownKeys() {
        return Object.keys(getConfig().nextStepGuidance);
    },
    getOwnPropertyDescriptor(_target, prop) {
        const guidance = getConfig().nextStepGuidance;
        if (prop in guidance) {
            return { configurable: true, enumerable: true, value: guidance[prop] };
        }
        return undefined;
    },
});
export function buildNoContextMessage(toolName) {
    return [
        `⛔ Kein aktiver Flow-Context. Tool '${toolName}' ist blockiert.`,
        '',
        'Starte deine Arbeit mit einem dieser Schritte:',
        '1. flow_list() → Finde einen freien Flow',
        '2. devflow_init({ flowId: "<id>" }) → Beanspruche ihn',
        '   ODER',
        '3. flow_create({ summary: "..." }) → Erstelle einen neuen Flow',
        '',
        'Ohne aktiven Context sind keine weiteren Tools verfuegbar.',
    ].join('\n');
}
export function buildStateBlockMessage(toolName, flowSummary, flowId, currentState, allowedActions) {
    const allowed = allowedActions || [];
    const nextStep = getConfig().nextStepGuidance[currentState] || 'Pruefe den Flow-Status.';
    return [
        `⛔ Aktion '${toolName}' nicht erlaubt im State '${currentState}'.`,
        '',
        `Flow: '${flowSummary}' (${flowId})`,
        `Aktueller State: ${currentState}`,
        `Erlaubte Aktionen: ${allowed.length > 0 ? allowed.join(', ') : 'keine'}`,
        '',
        `Naechster Schritt: ${nextStep}`,
    ].join('\n');
}
