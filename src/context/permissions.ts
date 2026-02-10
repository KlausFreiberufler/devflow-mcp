/**
 * State-Permission Map
 *
 * Defines which tools are allowed in which workflow state,
 * which tools work without init (discovery), and block messages.
 */

/** Tools that work WITHOUT devflow_init (discovery mode) */
export const DISCOVERY_TOOLS: ReadonlySet<string> = new Set([
  'flow_list',
  'flow_create',
  'devflow_init',
]);

/** Tools allowed per workflow state */
export const STATE_PERMISSIONS: Record<string, readonly string[]> = {
  idea: [
    'flow_update',
    'flow_get',
  ],
  planning: [
    'flow_update',
    'flow_get',
    'flow_get_feedback',
  ],
  plan_review: [
    'flow_get',
    'flow_get_feedback',
  ],
  progress: [
    'flow_update',
    'flow_get',
    'task_list',
    'task_create',
    'task_update',
    'project_knowledge_get',
    'project_knowledge_update',
    'agent_session_log',
  ],
  code_review: [
    'flow_get',
    'flow_get_feedback',
  ],
  testing: [
    'flow_get',
    'flow_get_feedback',
    'task_list',
  ],
  done: [
    'flow_get',
    'task_list',
    'agent_session_list',
  ],
};

/** Next step guidance per state */
export const NEXT_STEP_GUIDANCE: Record<string, string> = {
  idea: 'Wechsle den Workflow zu "planning" mit flow_update({ currentState: "planning" }) und beginne die Analyse.',
  planning: 'Analysiere die Anforderungen, erstelle einen Implementation-Plan und reiche ihn ein mit flow_update({ implementationPlan: "...", currentState: "plan_review" }).',
  plan_review: 'Warte auf User-Feedback zum Plan. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  progress: 'Erstelle Tasks aus dem Plan und beginne mit der Implementierung. Wenn fertig: flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "code_review" }).',
  code_review: 'Warte auf User-Feedback zum Code. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  testing: 'Warte auf User-Testing-Ergebnis. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
  done: 'Dieser Workflow ist abgeschlossen. Waehle einen anderen Workflow mit flow_list().',
};

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
  const allowed = STATE_PERMISSIONS[currentState] || [];
  const nextStep = NEXT_STEP_GUIDANCE[currentState] || 'Pruefe den Workflow-Status.';

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
  return [...(STATE_PERMISSIONS[state] || [])];
}
