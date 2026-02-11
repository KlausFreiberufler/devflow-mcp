/**
 * Remote Config Types
 *
 * Defines the shape of project configuration loaded from the DevFlow backend.
 * The server falls back to hardcoded defaults if the backend doesn't support
 * the config endpoint yet.
 */

export interface RemoteConfig {
  /** Version hash for sync-check */
  version: string;

  /** State-permission map: state -> allowed tool names */
  statePermissions: Record<string, string[]>;

  /** Next step guidance per state */
  nextStepGuidance: Record<string, string>;

  /** Required fields for state transitions */
  requiredFields: Record<string, {
    fields: string[];
    message: string;
  }>;

  /** Blocked transitions (user-only via UI) */
  blockedTransitions: Record<string, {
    target: string;
    reason: string;
  }[]>;
}

/**
 * Default config matching the hardcoded Phase 1 values.
 * Used as fallback when the backend doesn't support the config endpoint.
 */
export const DEFAULT_CONFIG: RemoteConfig = {
  version: 'hardcoded-v5.0',
  statePermissions: {
    idea: ['flow_update', 'flow_get'],
    planning: ['flow_update', 'flow_get', 'flow_get_feedback', 'project_guidelines_get'],
    approval: ['flow_get', 'flow_get_feedback'],
    ready: ['flow_update', 'flow_get', 'task_list', 'project_guidelines_get'],
    in_progress: [
      'flow_update', 'flow_get', 'task_list', 'task_create', 'task_update',
      'project_knowledge_get', 'project_knowledge_update',
      'project_guidelines_get', 'project_guidelines_update',
    ],
    review: ['flow_get', 'flow_get_feedback', 'task_list', 'project_guidelines_get'],
    done: ['flow_get', 'task_list', 'project_guidelines_get'],
  },
  nextStepGuidance: {
    idea: 'Wechsle den Flow zu "planning" mit flow_update({ currentState: "planning" }) und beginne die Analyse.',
    planning: 'Analysiere die Anforderungen, erstelle einen Implementation-Plan und reiche ihn ein mit flow_update({ implementationPlan: "...", currentState: "approval" }).',
    approval: 'Warte auf User-Feedback zum Plan. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
    ready: 'Der Plan wurde genehmigt. Wechsle zu "in_progress" mit flow_update({ currentState: "in_progress" }) und beginne mit der Implementierung.',
    in_progress: 'Erstelle Tasks aus dem Plan und beginne mit der Implementierung. Wenn fertig: Self-Review durchfuehren (Diff pruefen, Findings fixen, sauber committen). Testing-Instructions erstellen → flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "review" }).',
    review: 'Warte auf User-Review-Ergebnis. Nutze flow_get_feedback() um zu pruefen ob Feedback vorliegt.',
    done: 'Dieser Flow ist abgeschlossen. Waehle einen anderen Flow mit flow_list().',
  },
  requiredFields: {
    approval: {
      fields: ['implementationPlan'],
      message: 'implementationPlan ist Pflicht beim Uebergang zu approval. Schreibe einen Plan bevor du den State wechselst.',
    },
    review: {
      fields: ['agentSummary', 'testingInstructions'],
      message: 'agentSummary und testingInstructions sind Pflicht beim Uebergang zu review. Beschreibe was implementiert wurde und was der User testen soll.',
    },
  },
  blockedTransitions: {
    approval: [
      { target: 'ready', reason: 'Der User muss den Plan zuerst in der UI freigeben. Warte auf Freigabe in approval.' },
    ],
    review: [
      { target: 'done', reason: 'Der User muss das Review zuerst in der UI abschliessen. Warte auf Freigabe in review.' },
    ],
  },
};
