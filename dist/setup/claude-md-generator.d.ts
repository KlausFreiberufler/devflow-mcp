/**
 * CLAUDE.md Generator
 *
 * Creates or updates CLAUDE.md in the project working directory
 * with DevFlow flow rules.
 */
import type { StrictnessConfig } from '../config/types.js';
/**
 * Setup CLAUDE.md in the working directory
 *
 * - If no CLAUDE.md exists: creates new file with flow rules
 * - If CLAUDE.md exists without markers: appends flow rules
 * - If CLAUDE.md exists with markers: updates the rules section
 */
export declare function setupClaudeMd(workingDir: string, projectName: string, techStack?: string, strictness?: StrictnessConfig): Promise<void>;
/**
 * Sync project guidelines into CLAUDE.md
 *
 * - If guidelines empty/null: remove existing block (if present)
 * - If guidelines present + markers exist: replace block between markers
 * - If guidelines present + no markers: append block after DevFlow rules block
 */
export declare function syncProjectGuidelines(workingDir: string, guidelines: string): Promise<void>;
/**
 * Fetch project tech stack from the backend
 */
export declare function fetchProjectTechStack(baseUrl: string, token: string, projectId: string): Promise<string | undefined>;
