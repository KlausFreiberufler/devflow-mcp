# DevFlow - Workflow-Regeln fuer KI-Agenten

Dieses Projekt ist mit DevFlow verbunden. Du hast MCP-Tools um Workflows zu bearbeiten.

## Unterstuetzte Editoren

| Editor | Setup-Befehl | Instruktionsdatei |
|--------|-------------|-------------------|
| Claude Code | `npx github:KlausFreiberufler/devflow-mcp setup` | `CLAUDE.md` |
| Cursor | `npx github:KlausFreiberufler/devflow-mcp setup --client cursor` | `.cursorrules` |
| Codex | `npx github:KlausFreiberufler/devflow-mcp setup --client codex` | `AGENTS.md` |
| Gemini | `npx github:KlausFreiberufler/devflow-mcp setup --client gemini` | `GEMINI.md` |
| Windsurf | `npx github:KlausFreiberufler/devflow-mcp setup --client windsurf` | `.windsurfrules` |
| Droid | `npx github:KlausFreiberufler/devflow-mcp setup --client droid` | `CLAUDE.md` |

### Projekt verknuepfen

Mit `--project-id` wird das Projekt direkt verknuepft:

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client cursor --project-id <id>
```

Dies erstellt `.devflow.json` im Projektverzeichnis.

## Verfuegbare MCP-Tools

### Projekte & Workflows

| Tool | Beschreibung |
|------|--------------|
| `devflow_status` | Verbindungsstatus pruefen, Projekte auflisten |
| `devflow_connect` | Projekt verknuepfen |
| `devflow_disconnect` | Projekt trennen (.devflow.json entfernen) |
| `devflow_init` | Work-Session starten (Pflicht vor allen anderen Tools) |
| `flow_list` | Listet Workflows, optional gefiltert |
| `flow_get` | Holt Workflow-Details inkl. vollem Plan und Audit-Trail |
| `flow_create` | Erstellt neuen Workflow (Feature, Hotfix) |
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
| `agent_session_complete` | Schliesst eine Agent-Session ab |
| `agent_session_list` | Listet Sessions eines Workflows |

### Dokumentation & Releases

| Tool | Beschreibung |
|------|--------------|
| `project_guidelines_get` | Holt Projekt-Richtlinien |
| `project_guidelines_update` | Aktualisiert Projekt-Richtlinien |
| `doc_page_list` | Listet Dokumentationsseiten |
| `doc_page_get` | Holt eine Dokumentationsseite |
| `doc_page_update` | Aktualisiert eine Dokumentationsseite |
| `doc_page_create` | Erstellt neue Dokumentationsseite |
| `release_list` | Listet Releases eines Projekts |
| `release_get` | Holt Release-Details |
| `release_create` | Erstellt neues Release |
| `release_update` | Updated Release-Status/Details |

### Suche

| Tool | Beschreibung |
|------|--------------|
| `search` | Sucht Workflows, Tasks und Projekte nach Stichwort |

## Pflichtfeld-Guardrails

Der MCP Server erzwingt bestimmte Felder bei State-Transitions:

| Transition | Pflichtfelder |
|------------|--------------|
| → `approval` | `implementationPlan` muss gesetzt sein |
| → `review` | `agentSummary` und `testingInstructions` muessen gesetzt sein |

Ohne diese Felder wird die Transition abgelehnt.

## Workflow States

```
idea → planning → approval → ready → in_progress → review → done
```

| State | Bedeutung |
|-------|-----------|
| `idea` | Neue Idee, noch kein Plan |
| `planning` | Agent erstellt Plan |
| `approval` | User reviewed den Plan |
| `ready` | Plan genehmigt, bereit fuer Implementierung |
| `in_progress` | Implementierung laeuft |
| `review` | User reviewed den Code |
| `done` | Abgeschlossen |

## PFLICHT-PROZESS: Workflow bearbeiten

**WICHTIG:** Dieser Prozess MUSS bei JEDEM Workflow befolgt werden!

### FEHLER DIE NICHT WIEDERHOLT WERDEN DUERFEN
- NIEMALS von approval direkt auf in_progress springen ohne User-Freigabe
- IMMER implementationPlan im flow_update setzen BEVOR approval
- Plan muss in der UI sichtbar sein - ohne implementationPlan sieht der User nichts
- WARTEN heisst WARTEN - nicht einfach weitermachen

---

### Szenario A: Workflow ist "idea" → Plan erstellen

Wenn der User sagt **"Plane Workflow DF-123"** oder der Workflow auf `idea` steht:

**Phase 1: Analyse**
```
flow_get <id>                        → Details lesen
flow_update                          → currentState: "planning", agentStatus: "analyzing"
```

**Phase 2: Plan erstellen**
```
flow_update                          → agentStatus: "planning", agentMessage: "Erstelle Plan"
... Plan schreiben (Markdown) ...
flow_update                          → implementationPlan: "<plan>", currentState: "approval"
flow_update                          → agentStatus: "idle"
```

**Phase 3: User Review**

Der User sieht den Plan in der Web-App und kann:
- Genehmigen → Workflow geht auf `ready` → `in_progress`
- Feedback geben → Workflow geht zurueck auf `planning`

Bei Feedback: `flow_get` erneut aufrufen, Feedback lesen, Plan ueberarbeiten.

---

### Szenario B: Plan existiert → Plan ausfuehren

Wenn der User sagt **"Fuehre Workflow DF-123 aus"** oder der Workflow auf `in_progress` steht:

**Phase 1: Plan laden**
```
flow_get <id>                        → implementationPlan lesen!
flow_update                          → agentStatus: "analyzing", agentMessage: "Lese Plan"
```

**Phase 2: Tasks aus Plan erstellen**
```
flow_update                          → agentStatus: "planning", agentMessage: "Erstelle Tasks"
task_create (fuer jeden Schritt)     → Tasks in DevFlow anlegen
```

**Phase 3: Implementierung (pro Task)**
```
flow_update                          → agentStatus: "implementing", agentMessage: "Arbeite an: <task>"
... Code schreiben ...
task_update <taskId>                 → isCompleted: true
```

**Phase 4: Test**
```
flow_update                          → agentStatus: "testing", agentMessage: "Build-Test"
npm run build                        → Pruefen ob alles kompiliert
```

**Phase 5: Code Review anfordern**
```
flow_update                          → currentState: "review"
                                     → agentSummary: "Was wurde implementiert..."
                                     → testingInstructions: "Wie man testet..."
                                     → agentStatus: "idle"
```
**WICHTIG:** `agentSummary` UND `testingInstructions` sind Pflichtfelder fuer `review`!

**Phase 6: User Review**

Der User reviewed den Code und kann:
- Genehmigen → Workflow geht auf `done`
- Feedback geben → Workflow geht auf `in_progress`

Bei Feedback: `flow_get` erneut aufrufen, Feedback lesen, Code ueberarbeiten.

---

## Checkliste vor Abschluss

- [ ] Plan aus flow_get gelesen (wenn vorhanden)?
- [ ] Alle Tasks auf `isCompleted: true` gesetzt?
- [ ] Build erfolgreich (`npm run build`)?
- [ ] `agentSummary` geschrieben (was wurde gemacht)?
- [ ] Workflow auf `currentState: "review"` gesetzt?
- [ ] Agent auf `agentStatus: "idle"` gesetzt?
- [ ] Commit gemacht (wenn gewuenscht)?
- [ ] PR erstellt und URL gemeldet?
- [ ] Docs aktualisiert?

**Der User verlaesst sich darauf, dass der Workflow-Status korrekt ist!**

---

## Workflow-Status melden

```
flow_update <id> --agentStatus=implementing --agentMessage="Erstelle API-Endpoint"
```

Der User sieht in Echtzeit was du tust!
