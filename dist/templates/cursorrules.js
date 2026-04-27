/**
 * .cursorrules Template Generator
 *
 * Generates project-specific .cursorrules content with DevFlow rules.
 */
import { generateClaudeMdContent, MARKER_START, MARKER_END } from './claude-md.js';
export const CURSORRULES_MARKER_START = '# --- DEVFLOW-RULES-START ---';
export const CURSORRULES_MARKER_END = '# --- DEVFLOW-RULES-END ---';
/**
 * Generate .cursorrules content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md but with cursorrules-compatible markers.
 */
export function generateCursorrulesContent(projectName, techStack, strictness) {
    // Generate core content using claude-md generator, then replace markers
    const coreContent = generateClaudeMdContent(projectName, techStack, strictness);
    return coreContent
        .replace(MARKER_START, CURSORRULES_MARKER_START)
        .replace(MARKER_END, CURSORRULES_MARKER_END);
}
