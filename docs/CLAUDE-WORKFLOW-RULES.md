# WorkFlow Pro - Workflow-Regeln für Claude Code

Dieses Projekt ist mit WorkFlow Pro verbunden. Du hast MCP-Tools um Workflows zu bearbeiten.

## Verfügbare MCP-Tools (21 Tools)

### Projekte & Workflows

| Tool | Beschreibung |
|------|--------------|
| `project_list` | Listet alle Projekte |
| `project_get` | Holt Projekt-Details inkl. Tech-Stack |
| `workflow_list` | Listet Workflows, optional gefiltert |
| `workflow_get` | Holt Workflow-Details inkl. vollem Plan und Audit-Trail |
| `workflow_update` | Updated Status, Plan, Agent-Nachrichten (mit Pflichtfeld-Guardrails) |
| `workflow_get_feedback` | Holt User-Feedback zu Plan oder Code |

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

## Pflichtfeld-Guardrails

Der MCP Server erzwingt bestimmte Felder bei State-Transitions:

| Transition | Pflichtfelder |
|------------|--------------|
| → `plan_review` | `implementationPlan` muss gesetzt sein |
| → `code_review` | `agentSummary` und `testingInstructions` müssen gesetzt sein |

Ohne diese Felder wird die Transition abgelehnt.

## Workflow States

```
idea → planning → plan_review → progress → code_review → testing → done
```

| State | Bedeutung |
|-------|-----------|
| `idea` | Neue Idee, noch kein Plan |
| `planning` | Agent erstellt Plan |
| `plan_review` | User reviewed den Plan |
| `progress` | Implementierung läuft |
| `code_review` | User reviewed den Code |
| `testing` | Tests laufen |
| `done` | Abgeschlossen |

## PFLICHT-PROZESS: Workflow bearbeiten

**WICHTIG:** Dieser Prozess MUSS bei JEDEM Workflow befolgt werden!

### FEHLER DIE NICHT WIEDERHOLT WERDEN DÜRFEN
- NIEMALS von plan_review direkt auf progress springen ohne User-Freigabe
- IMMER implementationPlan im workflow_update setzen BEVOR plan_review
- Plan muss in der UI sichtbar sein - ohne implementationPlan sieht der User nichts
- WARTEN heißt WARTEN - nicht einfach weitermachen

---

### Szenario A: Workflow ist "idea" → Plan erstellen

Wenn der User sagt **"Plane Workflow WF-123"** oder der Workflow auf `idea` steht:

**Phase 1: Analyse**
```
workflow_get <id>                    → Details lesen
workflow_update                      → currentState: "planning", agentStatus: "analyzing"
```

**Phase 2: Plan erstellen**

Der Plan kann erstellt werden mit:
- Direkt hier analysieren und schreiben
- Mit `/superpowers:writing-plans` Skill (empfohlen für komplexe Features)
- Manuell vom User/Entwickler

```
workflow_update                      → agentStatus: "planning", agentMessage: "Erstelle Plan"
... Plan schreiben (Markdown) ...
workflow_update                      → implementationPlan: "<plan>", currentState: "plan_review"
workflow_update                      → agentStatus: "idle"
```

**Phase 3: User Review**

Der User sieht den Plan in der Web-App und kann:
- Genehmigen → Workflow geht auf `progress`
- Feedback geben → `planFeedback` wird gesetzt, Workflow bleibt auf `planning`

Bei Feedback: `workflow_get` erneut aufrufen, `planFeedback` lesen, Plan überarbeiten.

---

### Szenario B: Plan existiert → Plan ausführen

Wenn der User sagt **"Führe Workflow WF-123 aus"** oder der Workflow auf `progress` steht:

**Phase 1: Plan laden**
```
workflow_get <id>                    → implementationPlan lesen!
workflow_update                      → agentStatus: "analyzing", agentMessage: "Lese Plan"
```

**Phase 2: Tasks aus Plan erstellen**
```
workflow_update                      → agentStatus: "planning", agentMessage: "Erstelle Tasks"
task_create (für jeden Schritt)      → Tasks in WorkFlow Pro anlegen
```

**Phase 3: Implementierung (pro Task)**
```
workflow_update                      → agentStatus: "implementing", agentMessage: "Arbeite an: <task>"
... Code schreiben ...
task_update <taskId>                 → isCompleted: true
```

**Phase 4: Test**
```
workflow_update                      → agentStatus: "testing", agentMessage: "Build-Test"
npm run build                        → Prüfen ob alles kompiliert
```

**Phase 5: Code Review anfordern**
```
workflow_update                      → currentState: "code_review"
                                     → agentSummary: "Was wurde implementiert..."
                                     → testingInstructions: "Wie man testet..."
                                     → agentStatus: "idle"
```
**WICHTIG:** `agentSummary` UND `testingInstructions` sind Pflichtfelder für `code_review`!

**Phase 6: User Review**

Der User reviewed den Code und kann:
- Genehmigen → Workflow geht auf `done`
- Feedback geben → `codeFeedback` wird gesetzt, Workflow geht auf `progress`

Bei Feedback: `workflow_get` erneut aufrufen, `codeFeedback` lesen, Code überarbeiten.

---

### Szenario C: Bestehenden Plan überarbeiten oder neu erstellen

Wenn der User sagt **"Überarbeite den Plan"** oder **"Erstelle einen neuen Plan"**:

**Option 1: Plan überarbeiten**
```
workflow_get <id>                    → Bestehenden Plan lesen
workflow_update                      → currentState: "planning", agentStatus: "planning"
... Plan verbessern basierend auf bestehendem Plan ...
workflow_update                      → implementationPlan: "<verbesserter-plan>", currentState: "plan_review"
workflow_update                      → agentStatus: "idle"
```

**Option 2: Plan komplett neu erstellen**
```
workflow_get <id>                    → Nur Anforderungen lesen, Plan ignorieren
workflow_update                      → currentState: "planning", agentStatus: "analyzing"
... Komplett neuen Plan erstellen ...
workflow_update                      → implementationPlan: "<neuer-plan>", currentState: "plan_review"
workflow_update                      → agentStatus: "idle"
```

**Wann welche Option?**

| User sagt | Aktion |
|-----------|--------|
| "Überarbeite den Plan" | Option 1 - bestehenden Plan als Basis nehmen |
| "Der Plan ist gut, aber X fehlt" | Option 1 - gezielt ergänzen |
| "Erstelle einen neuen Plan" | Option 2 - von vorne anfangen |
| "Der Plan ist falsch" | Option 2 - komplett neu |

---

## Checkliste vor Abschluss

- [ ] Plan aus workflow_get gelesen (wenn vorhanden)?
- [ ] Alle Tasks auf `isCompleted: true` gesetzt?
- [ ] Build erfolgreich (`npm run build`)?
- [ ] `agentSummary` geschrieben (was wurde gemacht)?
- [ ] Workflow auf `currentState: "code_review"` oder `"done"` gesetzt?
- [ ] Agent auf `agentStatus: "idle"` gesetzt?
- [ ] Commit gemacht (wenn gewünscht)?

**Der User verlässt sich darauf, dass der Workflow-Status korrekt ist!**

---

## Workflow-Status melden

```
workflow_update <id> --agentStatus=implementing --agentMessage="Erstelle API-Endpoint"
```

Der User sieht in Echtzeit was du tust!

## Integration mit anderen Tools

Der Plan kann auch mit anderen Tools erstellt werden:

| Tool | Verwendung |
|------|------------|
| `/superpowers:writing-plans` | Komplexe Features planen |
| `/superpowers:brainstorming` | Ideen sammeln vor der Planung |
| Manuell | User schreibt Plan selbst |

Nach Plan-Erstellung mit externem Tool:
```
workflow_update <id> --implementationPlan="<plan>" --currentState="plan_review"
```
