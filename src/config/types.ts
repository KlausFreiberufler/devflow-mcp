/**
 * Remote Config Types
 *
 * Defines the shape of project configuration loaded from the DevFlow backend.
 * The server falls back to hardcoded defaults if the backend doesn't support
 * the config endpoint yet.
 */

// ============ Strictness Config ============

export interface StrictnessConfig {
  flowRequired: number;   // 1-5
  planRequired: number;   // 1-5
  taskTracking: number;   // 1-5
  gitDiscipline: number;  // 1-5
  reviewRequired: number; // 1-5
  docsUpdate: number;     // 1-5
}

export const DEFAULT_STRICTNESS: StrictnessConfig = {
  flowRequired: 3,
  planRequired: 3,
  taskTracking: 3,
  gitDiscipline: 3,
  reviewRequired: 3,
  docsUpdate: 1,
};

export const STRICTNESS_LABELS: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '🏖️', label: 'Chill' },
  2: { emoji: '🤙', label: 'Locker' },
  3: { emoji: '⚖️', label: 'Balanced' },
  4: { emoji: '🧑‍✈️', label: 'Streng' },
  5: { emoji: '🔒', label: 'Paranoid' },
};

export function formatStrictnessLevel(level: number): string {
  const info = STRICTNESS_LABELS[level] || STRICTNESS_LABELS[3];
  return `${info.emoji}${level}`;
}

// ============ Remote Config ============

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

  /** Strictness configuration (derives requiredFields + blockedTransitions) */
  strictness: StrictnessConfig;
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
  requiredFields: {},
  blockedTransitions: {},
  strictness: DEFAULT_STRICTNESS,
};

// ============ Strictness → Enforcement Derivation ============

/**
 * Derive requiredFields and blockedTransitions from strictness levels.
 * This is the core logic that makes strictness sliders control the process.
 */
export function deriveEnforcementFromStrictness(s: StrictnessConfig): {
  requiredFields: RemoteConfig['requiredFields'];
  blockedTransitions: RemoteConfig['blockedTransitions'];
} {
  const requiredFields: RemoteConfig['requiredFields'] = {};
  const blockedTransitions: RemoteConfig['blockedTransitions'] = {};

  // --- Plan enforcement ---
  if (s.planRequired >= 4) {
    requiredFields.approval = {
      fields: ['implementationPlan'],
      message: `⛔ Strictness ${formatStrictnessLevel(s.planRequired)} erfordert einen Plan.\nErstelle einen Plan: flow_update({ implementationPlan: "...", currentState: "approval" }).`,
    };
    blockedTransitions.approval = [
      { target: 'ready', reason: `Der User muss den Plan in der UI genehmigen (Strictness: ${formatStrictnessLevel(s.planRequired)}).` },
    ];
  }

  // --- Review enforcement ---
  if (s.reviewRequired >= 4) {
    requiredFields.review = {
      fields: ['agentSummary', 'testingInstructions'],
      message: `⛔ Strictness ${formatStrictnessLevel(s.reviewRequired)} erfordert agentSummary + testingInstructions.\nBeschreibe was du implementiert hast und wie der User testen soll.`,
    };
    blockedTransitions.review = [
      { target: 'done', reason: `Der User muss das Review in der UI abschliessen (Strictness: ${formatStrictnessLevel(s.reviewRequired)}).` },
    ];
  }

  return { requiredFields, blockedTransitions };
}
