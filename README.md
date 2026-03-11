# DevFlow MCP Server

MCP-Server für die Integration von [DevFlow](https://github.com/KlausFreiberufler/devflow) mit Claude Code.

Ermöglicht Claude Code, Flows und Tasks direkt zu verwalten - mit strukturiertem Planungs- und Review-Prozess.

## Installation

### Voraussetzungen

- Node.js >= 18
- [Claude Code](https://claude.com/claude-code) CLI installiert
- Zugang zum GitHub-Repo (privates Paket)

### Ein-Befehl-Installation

```bash
npx github:KlausFreiberufler/devflow-mcp setup
```

Das war's. Das Script:
1. Baut den MCP-Server automatisch
2. Registriert ihn bei Claude Code (user scope)
3. Verbindet mit `https://api.flow.dev`

**Danach Claude Code neu starten.**

### Eigene Backend-URL verwenden

```bash
npx github:KlausFreiberufler/devflow-mcp setup --url http://localhost:6011
```

## Projekt verknüpfen

Beim ersten Aufruf von `flow_list` oder `devflow_init` in einem Projekt:
1. Browser öffnet sich zur Authentifizierung
2. In DevFlow einloggen
3. Projekt auswählen
4. `.devflow.json` wird im Projektordner erstellt

Ab jetzt werden nur Flows dieses Projekts angezeigt.

## Update

```bash
npx github:KlausFreiberufler/devflow-mcp setup
```

Das Setup erkennt vorhandene Registrierungen und aktualisiert sie.

## Flow-Prozess

```
idea → planning → approval → ready → in_progress → review → done
```

Review-States (`approval`, `review`) sind Wartezustände.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.

### Pflichtfelder bei State-Transitions

| Transition | Pflichtfelder |
|------------|--------------|
| → `approval` | `implementationPlan` |
| → `review` | `agentSummary`, `testingInstructions` |

## Pipeline Integration (v3.0)

Projekte mit Pipeline-Konfiguration erhalten erweiterte Features:

### Pipeline-Kontext bei Init

`devflow_init` zeigt automatisch:
- **Aktueller Pipeline-Step** (z.B. "Code Review")
- **Zugewiesener Skill** (z.B. "Code Reviewer")
- **Gate-Warnung** wenn der Step auf menschliche Aktion wartet
- **Retry-Info** bei Ablehnungen (Feedback vom letzten Review)

### Erlaubte Aktionen

Wenn eine Pipeline konfiguriert ist, bestimmt der **Pipeline-Orchestrator** welche Tools erlaubt sind (`allowedActions`). Ohne Pipeline gelten die Standard-Permissions basierend auf dem Flow-State.

### Gate-Handling

Versucht der Agent eine State-Transition die einen Human-Gate erfordert, gibt das Backend einen 403-Fehler zurück. Der MCP-Server erkennt dies und zeigt eine klare Meldung — ohne Retry-Versuche.

## Verfügbare MCP-Tools

### Init & Flows

| Tool | Beschreibung |
|------|--------------|
| `devflow_init` | **Pflicht vor allen anderen Tools.** Startet eine Flow-Session |
| `flow_list` | Listet Flows (automatisch nach Projekt gefiltert) |
| `flow_get` | Holt Flow-Details inkl. Plan und Audit-Trail |
| `flow_create` | Erstellt neuen Flow |
| `flow_update` | Updated Status, Plan, Agent-Nachrichten |
| `flow_get_feedback` | Holt User-Feedback zu Plan oder Code |

### Tasks

| Tool | Beschreibung |
|------|--------------|
| `task_list` | Listet Tasks eines Flows |
| `task_create` | Erstellt neuen Task |
| `task_update` | Updated Task oder markiert als erledigt |

### Agent Sessions

| Tool | Beschreibung |
|------|--------------|
| `agent_session_create` | Erstellt neue Agent-Session (Tracking) |
| `agent_session_log` | Loggt Fortschritt in eine Session |
| `agent_session_complete` | Schließt eine Agent-Session ab |
| `agent_session_list` | Listet Sessions eines Flows |

### Projekte & Wissen

| Tool | Beschreibung |
|------|--------------|
| `project_knowledge_get` | Holt Projekt-Wissensbasis |
| `project_knowledge_update` | Aktualisiert Projekt-Dokumentation |
| `release_list` | Listet Releases eines Projekts |
| `release_get` | Holt Release-Details |
| `release_create` | Erstellt neues Release |
| `release_update` | Updated Release-Status/Details |
| `search` | Sucht Flows, Tasks und Projekte nach Stichwort |

## Manuelle Konfiguration

Falls du das Setup-Script nicht verwenden möchtest:

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/pfad/zu/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "https://api.flow.dev",
        "DEVFLOW_PROJECT_ID": "<optional-projekt-id>"
      }
    }
  }
```

In `~/.claude/settings.json` (global) oder `.claude/settings.json` (pro Projekt).

### Umgebungsvariablen

| Variable | Beschreibung | Default |
|----------|--------------|---------|
| `DEVFLOW_URL` | Backend-URL | `https://api.flow.dev` |
| `DEVFLOW_TOKEN` | Auth-Token (überspringt Browser-Auth) | - |
| `DEVFLOW_PROJECT_ID` | Projekt-Scoping | aus `.devflow.json` |

## Entwicklung

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Setup und Workflow bei der Weiterentwicklung.
