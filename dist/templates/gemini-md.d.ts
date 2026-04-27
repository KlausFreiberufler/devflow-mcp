/**
 * GEMINI.md Template Generator
 *
 * Generates project-specific GEMINI.md content with DevFlow rules.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const GEMINI_MARKER_START = "<!-- DEVFLOW-RULES-START -->";
export declare const GEMINI_MARKER_END = "<!-- DEVFLOW-RULES-END -->";
/**
 * Generate GEMINI.md content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md (markdown format, same markers).
 */
export declare function generateGeminiMdContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
