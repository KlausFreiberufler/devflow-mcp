/**
 * GEMINI.md Template Generator
 *
 * Generates project-specific GEMINI.md content with DevFlow rules.
 */
import { generateClaudeMdContent } from './claude-md.js';
export const GEMINI_MARKER_START = '<!-- DEVFLOW-RULES-START -->';
export const GEMINI_MARKER_END = '<!-- DEVFLOW-RULES-END -->';
/**
 * Generate GEMINI.md content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md (markdown format, same markers).
 */
export function generateGeminiMdContent(projectName, techStack, strictness) {
    return generateClaudeMdContent(projectName, techStack, strictness);
}
