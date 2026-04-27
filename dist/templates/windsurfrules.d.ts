/**
 * .windsurfrules Template Generator
 *
 * Generates project-specific .windsurfrules content with DevFlow rules.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const WINDSURFRULES_MARKER_START = "# --- DEVFLOW-RULES-START ---";
export declare const WINDSURFRULES_MARKER_END = "# --- DEVFLOW-RULES-END ---";
/**
 * Generate .windsurfrules content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md but with windsurfrules-compatible markers.
 */
export declare function generateWindsurfrulesContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
