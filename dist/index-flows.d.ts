#!/usr/bin/env node
/**
 * DevFlow MCP Server — Flows entry-point (DF-334).
 *
 * Workflow-Domain only: ~25 tools (under Cursor's 40-tool/server cap).
 *
 * Companion: index-wiki.ts (knowledge-domain).
 * Combined entry-point with all tools: index.ts.
 *
 * Subcommands (`setup`, `uninstall`) delegate to the combined index — these
 * configure the user's mcp.json regardless of which bin runs them.
 */
export {};
