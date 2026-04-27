/**
 * AGENTS.md Template Generator (Codex)
 *
 * Generates project-specific AGENTS.md content with DevFlow rules.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const AGENTS_MARKER_START = "<!-- DEVFLOW-RULES-START -->";
export declare const AGENTS_MARKER_END = "<!-- DEVFLOW-RULES-END -->";
/**
 * Generate AGENTS.md content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md (markdown format, same markers).
 */
export declare function generateAgentsMdContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
