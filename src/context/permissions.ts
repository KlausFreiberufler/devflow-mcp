/**
 * State-Permission Map
 *
 * Defines which tools are allowed in which workflow state,
 * which tools work without init (discovery), and block messages.
 *
 * Uses remote config when available, falls back to hardcoded defaults.
 */

import { getConfig } from '../config/sync.js';

/** Tools that work WITHOUT devflow_init (discovery mode) */
export const DISCOVERY_TOOLS: ReadonlySet<string> = new Set([
  'flow_list',
  'flow_create',
  'devflow_init',
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

export function buildNoContextMessage(toolName: string): string {
  return [
    `⛔ Kein aktiver Workflow-Context. Tool '${toolName}' ist blockiert.`,
    '',
    'Starte deine Arbeit mit einem dieser Schritte:',
    '1. flow_list() → Finde einen freien Workflow',
    '2. devflow_init({ flowId: "<id>" }) → Beanspruche ihn',
    '   ODER',
    '3. flow_create({ summary: "..." }) → Erstelle einen neuen Workflow',
    '',
    'Ohne aktiven Context sind keine weiteren Tools verfuegbar.',
  ].join('\n');
}

export function buildStateBlockMessage(
  toolName: string,
  workflowSummary: string,
  workflowId: string,
  currentState: string,
): string {
  const config = getConfig();
  const allowed = config.statePermissions[currentState] || [];
  const nextStep = config.nextStepGuidance[currentState] || 'Pruefe den Workflow-Status.';

  return [
    `⛔ Aktion '${toolName}' nicht erlaubt im State '${currentState}'.`,
    '',
    `Workflow: '${workflowSummary}' (${workflowId})`,
    `Aktueller State: ${currentState}`,
    `Erlaubte Aktionen: ${allowed.length > 0 ? allowed.join(', ') : 'keine'}`,
    '',
    `Naechster Schritt: ${nextStep}`,
  ].join('\n');
}

export function getAllowedTools(state: string): string[] {
  const config = getConfig();
  return [...(config.statePermissions[state] || [])];
}
