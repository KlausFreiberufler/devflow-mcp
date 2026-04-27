/**
 * Remote Config Types
 *
 * Defines the shape of project configuration loaded from the DevFlow backend.
 * The server falls back to hardcoded defaults if the backend doesn't support
 * the config endpoint yet.
 */
export interface StrictnessConfig {
    flowRequired: number;
    planRequired: number;
    taskTracking: number;
    gitDiscipline: number;
    reviewRequired: number;
    docsUpdate: number;
}
export declare const DEFAULT_STRICTNESS: StrictnessConfig;
export declare const STRICTNESS_LABELS: Record<number, {
    emoji: string;
    label: string;
}>;
export declare function formatStrictnessLevel(level: number): string;
export interface RemoteConfig {
    /** Version hash for sync-check */
    version: string;
    /** Whether git workflow is enabled for this project */
    gitEnabled: boolean;
    /** Next step guidance per state */
    nextStepGuidance: Record<string, string>;
    /** Required fields for state transitions */
    requiredFields: Record<string, {
        fields: string[];
        message: string;
    }>;
    /** Strictness configuration (derives requiredFields) */
    strictness: StrictnessConfig;
}
/**
 * Default config matching the hardcoded Phase 1 values.
 * Used as fallback when the backend doesn't support the config endpoint.
 */
export declare const DEFAULT_CONFIG: RemoteConfig;
/**
 * Derive requiredFields from strictness levels.
 * This is the core logic that makes strictness sliders control the process.
 *
 * Note: blockedTransitions have been removed — the backend pipeline gate
 * system is the sole authority for transition blocking.
 */
export declare function deriveEnforcementFromStrictness(s: StrictnessConfig): {
    requiredFields: RemoteConfig['requiredFields'];
};
