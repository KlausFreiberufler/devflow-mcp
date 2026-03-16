# DevFlow MCP Server

MCP-Server für die Integration von [DevFlow](https://github.com/KlausFreiberufler/devflow) mit KI-Code-Assistenten.

Ermöglicht KI-Agents (Claude Code, Cursor, Gemini CLI, Windsurf u.a.), Flows und Tasks direkt zu verwalten — mit strukturiertem Planungs- und Review-Prozess.

## Kompatible Clients

| Client | MCP Support | Status |
|--------|-------------|--------|
| [Claude Code](https://claude.com/claude-code) | Native | Vollständig unterstützt |
| [Cursor](https://cursor.sh) | MCP | Unterstützt |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | MCP | Unterstützt |
| [Windsurf](https://codeium.com/windsurf) | MCP | Unterstützt |
| [Codex](https://github.com/openai/codex) | Noch nicht | Geplant |

## Installation

### Voraussetzungen

- Node.js >= 18
- Ein MCP-kompatibler KI-Client
- Zugang zum GitHub-Repo

### Claude Code

```bash
npx github:KlausFreiberufler/devflow-mcp setup
```

### Cursor

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client cursor
```

Oder manuell in `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/pfad/zu/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "https://api.app.dev-flow.tech"
      }
    }
  }
}
```

### Gemini CLI

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client gemini
```

Oder manuell in `~/.gemini/settings.json` als MCP-Server hinzufügen.

### Eigene Backend-URL verwenden

```bash
npx github:KlausFreiberufler/devflow-mcp setup --url https://api.app.dev-flow.tech
```

**Danach den KI-Client neu starten.**

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

## Pipeline Integration (v3.2)

Projekte mit Pipeline-Konfiguration erhalten erweiterte Features:

### Pipeline-Modell

Jeder Pipeline-Step hat vier unabhängige Dimensionen:

| Feld | Beschreibung | Werte |
|------|-------------|-------|
| `actor` | Wer arbeitet in diesem Step? | `human`, `agent`, `both`, `auto`, `skip` |
| `transitionPolicy` | Wer darf den Step abschließen? | `human_only`, `agent_only`, `human_or_agent`, `auto` |
| `kind` | Semantischer Step-Typ | `work`, `review`, `handoff`, `terminal` |
| `skippable` | Kann der Step übersprungen werden? | `true`, `false` |

### Standard-Pipeline (Strict)

| Step | actor | transitionPolicy | kind |
|------|-------|------------------|------|
| Idea | human | human_or_agent | handoff |
| Planning | agent | human_or_agent | work |
| Approval | human | human_only | review |
| Ready | auto | auto | terminal |
| Execution | agent | human_or_agent | work |
| Review | both | human_or_agent | work |
| Testing | human | human_only | review |
| Done | auto | auto | terminal |

### Pipeline-Kontext bei Init

`devflow_init` zeigt automatisch:
- **Aktueller Pipeline-Step** mit `actor`, `kind`, `transitionPolicy`
- **Zugewiesener Skill** (z.B. "Brainstorming", "Code Reviewer")
- **Gate-Info** wenn der Step eine bestimmte `transitionPolicy` hat
- **Retry-Info** bei Ablehnungen (Feedback vom letzten Review)

### Erlaubte Aktionen

Das **Backend ist die einzige Source of Truth** für Permissions. Der MCP-Server hat keine eigene Permission-Logik — er gibt die `allowedActions` vom Backend 1:1 weiter.

### Gate-Handling

Gates werden über `transitionPolicy` gesteuert:
- `human_only` → Agent wird blockiert (403), Human muss in der UI handeln
- `agent_only` → Nur Agent darf weiter
- `human_or_agent` → Beide dürfen den Step abschließen
- `auto` → System-Transition, kein Akteur nötig

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
| `project_guidelines_get` | Holt Projekt-Richtlinien |
| `release_list` | Listet Releases eines Projekts |
| `release_get` | Holt Release-Details |
| `release_create` | Erstellt neues Release |
| `release_update` | Updated Release-Status/Details |
| `search` | Sucht Flows, Tasks und Projekte nach Stichwort |

## Manuelle Konfiguration

Falls du das Setup-Script nicht verwenden möchtest:

### Claude Code

In `~/.claude/settings.json` (global) oder `.claude/settings.json` (pro Projekt):

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/pfad/zu/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "https://api.app.dev-flow.tech"
      }
    }
  }
}
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/pfad/zu/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "https://api.app.dev-flow.tech"
      }
    }
  }
}
```

### Umgebungsvariablen

| Variable | Beschreibung | Default |
|----------|--------------|---------|
| `DEVFLOW_URL` | Backend-URL | `https://api.app.dev-flow.tech` |
| `DEVFLOW_TOKEN` | Auth-Token (überspringt Browser-Auth) | - |
| `DEVFLOW_PROJECT_ID` | Projekt-Scoping | aus `.devflow.json` |

## Changelog

### v3.2.0
- **Pipeline Architecture Refactor:** `executor` → `actor` + `transitionPolicy` + `kind` + `skippable`
- **Backend als Source of Truth:** `statePermissions` entfernt, keine eigene Permission-Logik im MCP
- **Neue API-Methode:** `getNextStep()` für Permission-Refresh nach Auto-Advance
- **Session-Context:** `stepKind` und `transitionPolicy` werden gespeichert

### v3.1.0
- Pipeline Phase 2: Skills-Enforcement, Phase-Tracking (pre/action/after)
- Reject/Retry Loops mit Escalation

### v3.0.0
- Pipeline Integration: Gate-Handling, Skill-Zuordnung, next-step API

## Entwicklung

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Setup und Workflow bei der Weiterentwicklung.
