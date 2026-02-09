# DevFlow MCP Server

MCP-Server für die Integration von [DevFlow](https://github.com/klausfreiberufler/jira-worklog) mit Claude Code.

Ermöglicht Claude Code, Workflows und Tasks direkt zu verwalten - mit strukturiertem Planungs- und Review-Prozess.

## Quick Start

```bash
git clone <repo-url>
cd devflow-mcp
npm run setup
```

Das Setup-Script:
1. Baut den MCP-Server (`npm install && npm run build`)
2. Konfiguriert Claude Code global (`~/.claude/settings.json`)
3. Verlinkt die Workflow-Regeln (`~/.claude/CLAUDE.md` via Symlink)

**Danach Claude Code neu starten.**

## Projekt verknüpfen

Beim ersten Aufruf von `flow_list` in einem Projekt:
1. Browser öffnet sich zur Authentifizierung
2. In DevFlow einloggen
3. Projekt auswählen
4. `.devflow.json` wird im Projektordner erstellt

Ab jetzt werden nur Workflows dieses Projekts angezeigt.

## Update

```bash
cd devflow-mcp
git pull
npm run build
```

Die Workflow-Regeln (`CLAUDE-WORKFLOW-RULES.md`) werden automatisch aktualisiert - sie sind per Symlink verknüpft.

## Verfügbare MCP-Tools (20 Tools)

### Projekte & Workflows

| Tool | Beschreibung |
|------|--------------|
| `project_list` | Listet alle Projekte |
| `project_get` | Holt Projekt-Details inkl. Tech-Stack |
| `flow_list` | Listet Workflows (automatisch nach Projekt gefiltert) |
| `flow_get` | Holt Workflow-Details inkl. vollem Plan und Audit-Trail |
| `flow_update` | Updated Status, Plan, Agent-Nachrichten (mit Pflichtfeld-Guardrails) |
| `flow_get_feedback` | Holt User-Feedback zu Plan oder Code |

### Tasks

| Tool | Beschreibung |
|------|--------------|
| `task_list` | Listet Tasks eines Workflows |
| `task_create` | Erstellt neuen Task |
| `task_update` | Updated Task oder markiert als erledigt |

### Agent Sessions

| Tool | Beschreibung |
|------|--------------|
| `agent_session_create` | Erstellt neue Agent-Session (Tracking) |
| `agent_session_log` | Loggt Fortschritt in eine Session |
| `agent_session_complete` | Schließt eine Agent-Session ab |
| `agent_session_list` | Listet Sessions eines Workflows |

### Knowledge & Releases

| Tool | Beschreibung |
|------|--------------|
| `project_knowledge_get` | Holt Projekt-Wissensbasis |
| `project_knowledge_update` | Aktualisiert Projekt-Dokumentation |
| `release_list` | Listet Releases eines Projekts |
| `release_get` | Holt Release-Details |
| `release_create` | Erstellt neues Release |
| `release_update` | Updated Release-Status/Details |

### Suche

| Tool | Beschreibung |
|------|--------------|
| `search` | Sucht Workflows, Tasks und Projekte nach Stichwort |

## Workflow-Prozess

```
idea → planning → plan_review → progress → code_review → testing → done
```

### Pflichtfeld-Guardrails

Der MCP Server erzwingt bestimmte Felder bei State-Transitions:

| Transition | Pflichtfelder |
|------------|--------------|
| → `plan_review` | `implementationPlan` |
| → `code_review` | `agentSummary`, `testingInstructions` |

### Audit-Trail

Alle wichtigen Aktionen werden automatisch getrackt:

- **Plan erstellt von** (Agent/User) + Zeitstempel
- **Plan genehmigt von** (User) + Zeitstempel
- **Code genehmigt von** (User) + Zeitstempel

Diese Felder werden in `flow_get` angezeigt.

Der vollständige Prozess ist in [`docs/CLAUDE-WORKFLOW-RULES.md`](docs/CLAUDE-WORKFLOW-RULES.md) dokumentiert.

## Manuelle Konfiguration

Falls du das Setup-Script nicht verwenden möchtest:

### 1. MCP-Server in Claude Code eintragen

In `~/.claude/settings.json` (global) oder `.claude/settings.json` (pro Projekt):

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/pfad/zu/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "http://localhost:6011",
        "DEVFLOW_PROJECT_ID": "<optional-projekt-id>"
      }
    }
  }
}
```

### Projekt-Scoping

Über `DEVFLOW_PROJECT_ID` kann der MCP Server auf ein bestimmtes Projekt eingeschränkt werden. Das ist nützlich, wenn man pro Repo eine eigene `.claude/settings.json` hat. Ohne diese Variable wird das verlinkte Projekt aus `.devflow.json` verwendet.

### 2. Workflow-Regeln verlinken

```bash
ln -s /pfad/zu/devflow-mcp/docs/CLAUDE-WORKFLOW-RULES.md ~/.claude/CLAUDE.md
```

## Voraussetzungen

- Node.js >= 18
- Claude Code CLI
- DevFlow Backend (lokal oder remote)
