/**
 * .cursorrules Template Generator
 *
 * Generates project-specific .cursorrules content with DevFlow rules.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const CURSORRULES_MARKER_START = "# --- DEVFLOW-RULES-START ---";
export declare const CURSORRULES_MARKER_END = "# --- DEVFLOW-RULES-END ---";
/**
 * Generate .cursorrules content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md but with cursorrules-compatible markers.
 */
export declare function generateCursorrulesContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
