/**
 * CLAUDE.md Generator
 *
 * Creates or updates CLAUDE.md in the project working directory
 * with DevFlow flow rules.
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  generateClaudeMdContent,
  generateGuidelinesBlock,
  MARKER_START,
  MARKER_END,
  GUIDELINES_MARKER_START,
  GUIDELINES_MARKER_END,
} from '../templates/claude-md.js';
import type { StrictnessConfig } from '../config/types.js';

/**
 * Setup CLAUDE.md in the working directory
 *
 * - If no CLAUDE.md exists: creates new file with flow rules
 * - If CLAUDE.md exists without markers: appends flow rules
 * - If CLAUDE.md exists with markers: updates the rules section
 */
export async function setupClaudeMd(
  workingDir: string,
  projectName: string,
  techStack?: string,
  strictness?: StrictnessConfig
): Promise<void> {
  const claudeMdPath = join(workingDir, 'CLAUDE.md');
  const rulesContent = generateClaudeMdContent(projectName, techStack, strictness);

  let existingContent: string | null = null;
  try {
    existingContent = await readFile(claudeMdPath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  if (existingContent === null) {
    // No CLAUDE.md exists - create new
    await writeFile(claudeMdPath, rulesContent);
    console.error(`CLAUDE.md created in ${workingDir}`);
    return;
  }

  // CLAUDE.md exists - check for existing markers
  const hasMarkers =
    existingContent.includes(MARKER_START) &&
    existingContent.includes(MARKER_END);

  if (hasMarkers) {
    // Replace existing rules section between markers
    const startIdx = existingContent.indexOf(MARKER_START);
    const endIdx = existingContent.indexOf(MARKER_END) + MARKER_END.length;
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx);
    const updatedContent = before + rulesContent + after;
    await writeFile(claudeMdPath, updatedContent);
    console.error(`CLAUDE.md updated in ${workingDir} (rules section replaced)`);
    return;
  }

  // No markers - append rules at the end
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
  const updatedContent = existingContent + separator + rulesContent;
  await writeFile(claudeMdPath, updatedContent);
  console.error(`CLAUDE.md updated in ${workingDir} (rules appended)`);
}

/**
 * Sync project guidelines into CLAUDE.md
 *
 * - If guidelines empty/null: remove existing block (if present)
 * - If guidelines present + markers exist: replace block between markers
 * - If guidelines present + no markers: append block after DevFlow rules block
 */
export async function syncProjectGuidelines(
  workingDir: string,
  guidelines: string,
): Promise<void> {
  const claudeMdPath = join(workingDir, 'CLAUDE.md');

  let existingContent: string;
  try {
    existingContent = await readFile(claudeMdPath, 'utf-8');
  } catch {
    // No CLAUDE.md exists - nothing to sync into
    return;
  }

  const hasMarkers =
    existingContent.includes(GUIDELINES_MARKER_START) &&
    existingContent.includes(GUIDELINES_MARKER_END);

  const guidelinesBlock = generateGuidelinesBlock(guidelines);

  if (hasMarkers) {
    // Replace or remove existing guidelines block
    const startIdx = existingContent.indexOf(GUIDELINES_MARKER_START);
    const endIdx = existingContent.indexOf(GUIDELINES_MARKER_END) + GUIDELINES_MARKER_END.length;
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx);

    // Clean up whitespace: trim trailing newlines from before, then add appropriate spacing
    const trimmedBefore = before.replace(/\n+$/, '');
    const trimmedAfter = after.replace(/^\n+/, '');

    let updatedContent: string;
    if (guidelinesBlock) {
      updatedContent = trimmedBefore + '\n\n' + guidelinesBlock + (trimmedAfter ? '\n' + trimmedAfter : '\n');
    } else {
      // Remove the block entirely
      updatedContent = trimmedBefore + (trimmedAfter ? '\n\n' + trimmedAfter : '\n');
    }

    await writeFile(claudeMdPath, updatedContent);
    console.error(`CLAUDE.md updated (guidelines ${guidelinesBlock ? 'replaced' : 'removed'})`);
    return;
  }

  // No markers yet - append after DevFlow rules block if guidelines present
  if (!guidelinesBlock) return;

  if (existingContent.includes(MARKER_END)) {
    // Insert after the DevFlow rules end marker
    const endIdx = existingContent.indexOf(MARKER_END) + MARKER_END.length;
    const before = existingContent.substring(0, endIdx);
    const after = existingContent.substring(endIdx);
    const updatedContent = before + '\n\n' + guidelinesBlock + after;
    await writeFile(claudeMdPath, updatedContent);
  } else {
    // No DevFlow markers at all - append at end
    const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(claudeMdPath, existingContent + separator + guidelinesBlock);
  }

  console.error('CLAUDE.md updated (guidelines added)');
}

/**
 * Fetch project tech stack from the backend
 */
export async function fetchProjectTechStack(
  baseUrl: string,
  token: string,
  projectId: string
): Promise<string | undefined> {
  try {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return undefined;

    const data = await response.json() as {
      success: boolean;
      data?: { tech_stack?: string };
    };

    if (data.success && data.data?.tech_stack) {
      return data.data.tech_stack;
    }

    return undefined;
  } catch {
    // Backend not reachable - continue without tech stack
    return undefined;
  }
}
