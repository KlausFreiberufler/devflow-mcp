# DevFlow — Codex CLI Plugin

Structured AI development workflows for OpenAI Codex CLI. Provides 19 skills, blocking hooks, slash commands, and MCP integration with the DevFlow backend.

## Status

**Scaffold (DF-336, shipped 2026-05-06).** Format-compatibility with Codex CLI v0.128+ to be verified on first install. Sister-flow: DF-337 (Gemini-Plugin).

## Installation

### Via Codex Plugin Marketplace (when available)
```bash
codex plugin install @dev-flow-tech/devflow
```

### Manual Install (via npm + symlink)
```bash
npm install -g @dev-flow-tech/mcp-server
mkdir -p ~/.codex/plugins
ln -s "$(npm root -g)/@dev-flow-tech/mcp-server/.codex-plugin" ~/.codex/plugins/devflow
```

After install, restart Codex CLI and run `codex plugin list` to verify.

## What's inside

| Component | Path | Purpose |
|---|---|---|
| Skills | `skills/` | 19 auto-invoked workflows (TDD, knowledge-completer, ...) |
| Hooks | `hooks/hooks.json` | BeforeTool gating for `apply_patch` + `flow_update` |
| MCP-Servers | `.mcp.json` | `devflow-flows` (workflow) + `devflow-wiki` (knowledge) |
| Commands | `commands/` | Slash-commands `/devflow-start`, `/devflow-status`, etc. |

## Skills are pulled from `packages/skills/` at build time

Source-of-Truth ist `packages/skills/skills/` (DF-335). `scripts/build-codex-plugin.js` kopiert sie in `.codex-plugin/skills/` beim Build.

## Hook-Adapter

Codex's `BeforeTool` event wird auf die existierenden Claude-Plugin-Scripts umgeleitet:
- `hooks/pre-tool-use.sh` → `scripts/check-active-flow.sh`
- `hooks/pre-flow-update.sh` → `scripts/pre-flow-update-knowledge-auto-resolve.js`

Die DevFlow-Logik ist Plugin-agnostic — die Hook-Wrapper sind dünne Bash-Layer.

## Setup

1. Ensure DevFlow backend is reachable (default: `https://api.app.dev-flow.tech`)
2. Run `codex login` if not authenticated
3. First MCP-call (`devflow_status`) opens browser für DevFlow-Auth
4. `flow_create({ summary: "..." })` to start a flow

## Setup auf Deutsch

1. DevFlow-Backend erreichbar (Default: `https://api.app.dev-flow.tech`)
2. `codex login` falls noch nicht angemeldet
3. Erster MCP-Call (`devflow_status`) öffnet Browser für DevFlow-Auth
4. `flow_create({ summary: "..." })` zum Starten eines Flows

## Related

- Parent-Decision: DF-327 (Multi-Client Plugin-Strategie)
- Sister-Plugins: `.claude-plugin/` (Claude Code), gemini-extension.json (DF-337)
- Voraussetzungen: DF-334 (MCP-Server-Split), DF-335 (Skills-Mono-Repo)
