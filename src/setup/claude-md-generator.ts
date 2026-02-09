/**
 * CLAUDE.md Generator
 *
 * Creates or updates CLAUDE.md in the project working directory
 * with DevFlow workflow rules.
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { generateClaudeMdContent, MARKER_START, MARKER_END } from '../templates/claude-md.js';

/**
 * Setup CLAUDE.md in the working directory
 *
 * - If no CLAUDE.md exists: creates new file with workflow rules
 * - If CLAUDE.md exists without markers: appends workflow rules
 * - If CLAUDE.md exists with markers: updates the rules section
 */
export async function setupClaudeMd(
  workingDir: string,
  projectName: string,
  techStack?: string
): Promise<void> {
  const claudeMdPath = join(workingDir, 'CLAUDE.md');
  const rulesContent = generateClaudeMdContent(projectName, techStack);

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
