/**
 * .windsurfrules Template Generator
 *
 * Generates project-specific .windsurfrules content with DevFlow rules.
 */

import { type StrictnessConfig } from '../config/types.js';
import { generateClaudeMdContent, MARKER_START, MARKER_END } from './claude-md.js';

export const WINDSURFRULES_MARKER_START = '# --- DEVFLOW-RULES-START ---';
export const WINDSURFRULES_MARKER_END = '# --- DEVFLOW-RULES-END ---';

/**
 * Generate .windsurfrules content with DevFlow rules.
 * Uses the same core rules as CLAUDE.md but with windsurfrules-compatible markers.
 */
export function generateWindsurfrulesContent(
  projectName: string,
  techStack?: string,
  strictness?: StrictnessConfig,
): string {
  const coreContent = generateClaudeMdContent(projectName, techStack, strictness);
  return coreContent
    .replace(MARKER_START, WINDSURFRULES_MARKER_START)
    .replace(MARKER_END, WINDSURFRULES_MARKER_END);
}
