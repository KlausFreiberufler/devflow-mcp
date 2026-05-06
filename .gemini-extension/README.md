# DevFlow — Gemini CLI Extension

Structured AI development workflows for Google Gemini CLI. Provides 19 skills, blocking hooks, slash commands, and MCP integration with the DevFlow backend.

## Status

**Scaffold (DF-337, shipped 2026-05-06).** 80% reuse from `.codex-plugin/` (DF-336). Format-compatibility with current Gemini CLI to be verified on first install.

## Installation

### Via Gemini Extensions Catalog (when available)
```bash
gemini extensions install https://github.com/KlausFreiberufler/devflow-mcp
```

### Manual Install
```bash
npm install -g @dev-flow-tech/mcp-server
mkdir -p ~/.gemini/extensions
ln -s "$(npm root -g)/@dev-flow-tech/mcp-server/.gemini-extension" ~/.gemini/extensions/devflow
```

After install, restart Gemini CLI.

## What's inside

| Component | Path | Purpose |
|---|---|---|
| Manifest | `gemini-extension.json` | Extension config + MCP-server-refs (combined into manifest, no separate .mcp.json) |
| Context | `GEMINI.md` | Quick-start hint loaded into Gemini's context |
| Skills | `skills/` | 19 auto-invoked workflows |
| Hooks | `hooks/hooks.json` | BeforeTool gating |
| Commands | `commands/` | Slash-commands |

## Hook-Adapter

Gemini's `BeforeTool` event is forwarded to the same Bash-wrapper scripts as Codex (DF-336). DevFlow-Logik ist plugin-agnostic.

## Setup auf Deutsch

1. DevFlow-Backend erreichbar (Default: `https://api.app.dev-flow.tech`)
2. Erster MCP-Call (`devflow_status`) öffnet Browser für DevFlow-Auth
3. `flow_create({summary: "..."})` zum Starten

## Out of Scope (Phase 2)

- BeforeModel/PreCompress hooks (Gemini bietet 11 events, MVP nutzt nur BeforeTool)
- TOML-conversion für slash-commands (md-fallback ok für scaffold)
- Catalog-Submit zu geminicli.com/extensions
- Lokale Gemini-CLI-Validierung

## Related

- Parent-Decision: DF-327 (Multi-Client Plugin-Strategie)
- Sister-Plugin: `.codex-plugin/` (DF-336)
- Voraussetzungen: DF-334 (MCP-Server-Split), DF-335 (Skills-Mono-Repo)
