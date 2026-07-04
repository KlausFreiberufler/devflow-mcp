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
export const DISCOVERY_TOOLS: ReadonlySet<string> = new Set([
  'flow_list',
  'flow_create',
  'devflow_init',
  'devflow_status',
  'devflow_connect',
  'devflow_disconnect',
]);

/**
 * NEXT_STEP_GUIDANCE - Proxy that reads from active config.
 * Existing code (init.ts, flow.ts) can use NEXT_STEP_GUIDANCE[state] as before,
 * but the values come from the remote config when available.
 */
export const NEXT_STEP_GUIDANCE: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_target, prop: string) {
      return getConfig().nextStepGuidance[prop];
    },
    has(_target, prop: string) {
      return prop in getConfig().nextStepGuidance;
    },
    ownKeys() {
      return Object.keys(getConfig().nextStepGuidance);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      const guidance = getConfig().nextStepGuidance;
      if (prop in guidance) {
        return { configurable: true, enumerable: true, value: guidance[prop] };
      }
      return undefined;
    },
  },
);

/**
 * DF-437 — policy-aware self-approval guidance for the two wait-states.
 * Under `agent_with_discipline` the agent must NOT wait for the user: it
 * transitions itself, carrying the DF-435 body-field evidence so the backend
 * auto-emits the required discipline-tokens.
 */
const SELF_APPROVAL_GUIDANCE: Record<string, string> = {
  approval:
    'Self-Approval ist AKTIV (agent_with_discipline) — warte NICHT auf den User. ' +
    'Pruefe flow_get_feedback() einmal auf blockierendes Feedback; wenn keins vorliegt, transitioniere selbst: ' +
    'flow_update({ currentState: "ready", testStrategy: "<Red→Green-Strategie ≥30 Zeichen>" }). ' +
    'Das Backend emittiert die Required-Skill-Tokens automatisch (DF-435); fehlt eins, nennt der 403 die Luecke.',
  review:
    'Self-Approval ist AKTIV (agent_with_discipline) — warte NICHT auf den User. ' +
    'Fuehre das Self-Review durch und transitioniere selbst: ' +
    'flow_update({ currentState: "done", acVerification: [{acId, command, output}, ...], ' +
    'planReconciliation: { perAcStatus: [{acId, status}, ...] }, filesChanged: [<paths>] }). ' +
    'Das Backend emittiert verification-gate, plan-reconciliation, adr-compliance und knowledge-completer daraus automatisch (DF-435).',
};

/**
 * Resolve the next-step guidance for a state, taking the step's
 * transitionPolicy into account (DF-437). Falls back to the configured
 * per-state guidance for every non-self-approval case.
 */
export function getGuidanceFor(state: string, transitionPolicy?: string | null): string {
  if (transitionPolicy === 'agent_with_discipline' && SELF_APPROVAL_GUIDANCE[state]) {
    return SELF_APPROVAL_GUIDANCE[state];
  }
  return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Flow-Status.';
}

export function buildNoContextMessage(toolName: string): string {
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

export function buildStateBlockMessage(
  toolName: string,
  flowSummary: string,
  flowId: string,
  currentState: string,
  allowedActions?: string[],
): string {
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
