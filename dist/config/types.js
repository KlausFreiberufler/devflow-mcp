/**
 * Remote Config Types
 *
 * Defines the shape of project configuration loaded from the DevFlow backend.
 * The server falls back to hardcoded defaults if the backend doesn't support
 * the config endpoint yet.
 */
export const DEFAULT_STRICTNESS = {
    flowRequired: 3,
    planRequired: 3,
    taskTracking: 3,
    gitDiscipline: 3,
    reviewRequired: 3,
    docsUpdate: 1,
};
export const STRICTNESS_LABELS = {
    1: { emoji: '🏖️', label: 'Chill' },
    2: { emoji: '🤙', label: 'Locker' },
    3: { emoji: '⚖️', label: 'Balanced' },
    4: { emoji: '🧑‍✈️', label: 'Streng' },
    5: { emoji: '🔒', label: 'Paranoid' },
};
export function formatStrictnessLevel(level) {
    const info = STRICTNESS_LABELS[level] || STRICTNESS_LABELS[3];
    return `${info.emoji}${level}`;
}
/**
 * Default config matching the hardcoded Phase 1 values.
 * Used as fallback when the backend doesn't support the config endpoint.
 */
export const DEFAULT_CONFIG = {
    version: 'hardcoded-v5.0',
    gitEnabled: false,
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
    strictness: DEFAULT_STRICTNESS,
};
// ============ Strictness → Enforcement Derivation ============
/**
 * Derive requiredFields from strictness levels.
 * This is the core logic that makes strictness sliders control the process.
 *
 * Note: blockedTransitions have been removed — the backend pipeline gate
 * system is the sole authority for transition blocking.
 */
export function deriveEnforcementFromStrictness(s) {
    const requiredFields = {};
    // --- Plan enforcement ---
    if (s.planRequired >= 4) {
        requiredFields.approval = {
            fields: ['implementationPlan'],
            message: `⛔ Strictness ${formatStrictnessLevel(s.planRequired)} erfordert einen Plan.\nErstelle einen Plan: flow_update({ implementationPlan: "...", currentState: "approval" }).`,
        };
    }
    // --- Review enforcement ---
    if (s.reviewRequired >= 4) {
        requiredFields.review = {
            fields: ['agentSummary', 'testingInstructions'],
            message: `⛔ Strictness ${formatStrictnessLevel(s.reviewRequired)} erfordert agentSummary + testingInstructions.\nBeschreibe was du implementiert hast und wie der User testen soll.`,
        };
    }
    return { requiredFields };
}
