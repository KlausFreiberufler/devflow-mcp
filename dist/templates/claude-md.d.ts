/**
 * CLAUDE.md Template Generator
 *
 * DF-326: This template is no longer used for the Claude Code client (the plugin
 * covers rules via skills + hooks). It remains the canonical source for the other
 * AI clients (Cursor, Codex/AGENTS.md, Gemini, Windsurf) until DF-327 introduces
 * dedicated plugin bundles per client.
 *
 * Strictness levels control the rule text that gets generated.
 */
import { type StrictnessConfig } from '../config/types.js';
export declare const MARKER_START = "<!-- DEVFLOW-RULES-START -->";
export declare const MARKER_END = "<!-- DEVFLOW-RULES-END -->";
export declare const GUIDELINES_MARKER_START = "<!-- PROJECT-GUIDELINES-START -->";
export declare const GUIDELINES_MARKER_END = "<!-- PROJECT-GUIDELINES-END -->";
/**
 * Generate template content with project-specific information.
 *
 * Used by cursor/codex/gemini/windsurf templates to render the same content
 * into their own rules files. NOT used for Claude Code (DF-326: plugin covers rules).
 */
export declare function generateClaudeMdContent(projectName: string, techStack?: string, strictness?: StrictnessConfig): string;
