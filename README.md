# WorkFlow Pro MCP Server

MCP-Server für die Integration von [WorkFlow Pro](https://github.com/klausfreiberufler/jira-worklog) mit Claude Code.

Ermöglicht Claude Code, Workflows und Tasks direkt zu verwalten - mit strukturiertem Planungs- und Review-Prozess.

## Quick Start

```bash
git clone <repo-url>
cd workflow-pro-mcp
npm run setup
```

Das Setup-Script:
1. Baut den MCP-Server (`npm install && npm run build`)
2. Konfiguriert Claude Code global (`~/.claude/settings.json`)
3. Verlinkt die Workflow-Regeln (`~/.claude/CLAUDE.md` via Symlink)

**Danach Claude Code neu starten.**

## Projekt verknüpfen

Beim ersten Aufruf von `workflow_list` in einem Projekt:
1. Browser öffnet sich zur Authentifizierung
2. In WorkFlow Pro einloggen
3. Projekt auswählen
4. `.workflow-pro.json` wird im Projektordner erstellt

Ab jetzt werden nur Workflows dieses Projekts angezeigt.

## Update

```bash
cd workflow-pro-mcp
git pull
npm run build
```

Die Workflow-Regeln (`CLAUDE-WORKFLOW-RULES.md`) werden automatisch aktualisiert - sie sind per Symlink verknüpft.

## Verfügbare MCP-Tools

| Tool | Beschreibung |
|------|--------------|
| `project_list` | Listet alle Projekte |
| `project_get` | Holt Projekt-Details |
| `workflow_list` | Listet Workflows (automatisch nach Projekt gefiltert) |
| `workflow_get` | Holt Workflow-Details inkl. Plan und Akzeptanzkriterien |
| `workflow_update` | Updated Status, Plan, Agent-Nachrichten |
| `workflow_get_feedback` | Holt User-Feedback |
| `task_list` | Listet Tasks eines Workflows |
| `task_create` | Erstellt neuen Task |
| `task_update` | Updated Task oder markiert als erledigt |

## Workflow-Prozess

```
idea → planning → plan_review → progress → code_review → testing → done
```

Der vollständige Prozess ist in [`docs/CLAUDE-WORKFLOW-RULES.md`](docs/CLAUDE-WORKFLOW-RULES.md) dokumentiert.

## Manuelle Konfiguration

Falls du das Setup-Script nicht verwenden möchtest:

### 1. MCP-Server in Claude Code eintragen

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "workflow-pro": {
      "command": "node",
      "args": ["/pfad/zu/workflow-pro-mcp/dist/index.js"],
      "env": {
        "WORKFLOW_PRO_URL": "http://localhost:6011"
      }
    }
  }
}
```

### 2. Workflow-Regeln verlinken

```bash
ln -s /pfad/zu/workflow-pro-mcp/docs/CLAUDE-WORKFLOW-RULES.md ~/.claude/CLAUDE.md
```

## Voraussetzungen

- Node.js >= 18
- Claude Code CLI
- WorkFlow Pro Backend (lokal oder remote)
