/**
 * CLAUDE.md Template Generator
 *
 * Generates project-specific CLAUDE.md content with DevFlow rules.
 * The template includes all flow states, mandatory processes, and guardrails.
 * Strictness levels control the rule text that gets generated.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const MARKER_START = "<!-- DEVFLOW-RULES-START -->";
export declare const MARKER_END = "<!-- DEVFLOW-RULES-END -->";
export declare const GUIDELINES_MARKER_START = "<!-- PROJECT-GUIDELINES-START -->";
export declare const GUIDELINES_MARKER_END = "<!-- PROJECT-GUIDELINES-END -->";
/**
 * Generate CLAUDE.md content with project-specific information
 */
export declare function generateClaudeMdContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
/**
 * Generate a guidelines block wrapped in markers.
 * Returns empty string if guidelines are empty/null.
 */
export declare function generateGuidelinesBlock(guidelines: string): string;
