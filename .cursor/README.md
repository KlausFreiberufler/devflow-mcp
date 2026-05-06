# DevFlow — Cursor Bundle

Manual-install bundle for Cursor 2.4+. Provides 19 skills, blocking hooks, slash commands, MCP integration, and MDC-rules.

## Status

**Scaffold (DF-338, shipped 2026-05-06).** Tier-2 plugin per DF-327. Cursor has no plugin-bundle-format yet — install via setup-script.

## Installation

### Quick install (one-line)
```bash
curl -fsSL https://raw.githubusercontent.com/KlausFreiberufler/devflow-mcp/main/scripts/setup-cursor.sh | bash
```

### Manual install
```bash
cd /path/to/your-project
git clone https://github.com/KlausFreiberufler/devflow-mcp /tmp/devflow-mcp
cp -r /tmp/devflow-mcp/.cursor .
# Restart Cursor — it picks up .cursor/{mcp.json, hooks.json, rules/, skills/}
```

After install, restart Cursor.

## What's inside

| Component | Path | Purpose |
|---|---|---|
| Rules | `rules/devflow.mdc` | MDC-Frontmatter + alwaysApply enforcement guidance |
| MCP-Servers | `mcp.json` | `devflow-flows` + `devflow-wiki` (40-tool-cap-compliant via DF-334) |
| Hooks | `hooks.json` | PreToolUse gating (4 events available; MVP uses 1) |
| Skills | `skills/` | 19 auto-invoked workflows (build-time copy) |
| Commands | `commands/` | Slash-commands (build-time copy) |

## Setup auf Deutsch

```bash
# Schnell-Install
curl -fsSL https://raw.githubusercontent.com/KlausFreiberufler/devflow-mcp/main/scripts/setup-cursor.sh | bash

# Manuell
cd /pfad/zu/deinem-projekt
git clone https://github.com/KlausFreiberufler/devflow-mcp /tmp/devflow-mcp
cp -r /tmp/devflow-mcp/.cursor .
# Cursor neu starten
```

## Out of Scope (Phase 2)

- Cursor-Marketplace-Submit (gibt's noch nicht für Plugins, nur für MCPs)
- Conditional skills via MDC-globs (alwaysApply works for MVP)
- Watch-Item: Cursor "Agent Plugins"-FR — falls shipped, migrate zum offiziellen Bundle-Format

## Related

- Parent-Decision: DF-327
- Sister-Plugins: `.codex-plugin/` (DF-336), `.gemini-extension/` (DF-337)
- Voraussetzungen: DF-334 (MCP-Split, Cursor 40-tool-cap), DF-335 (Skills-Mono-Repo)
