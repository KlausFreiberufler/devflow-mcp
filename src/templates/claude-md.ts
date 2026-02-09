/**
 * CLAUDE.md Template Generator
 *
 * Generates project-specific CLAUDE.md content with DevFlow rules.
 * The template includes all workflow states, mandatory processes, and guardrails.
 */

export const MARKER_START = '<!-- DEVFLOW-RULES-START -->';
export const MARKER_END = '<!-- DEVFLOW-RULES-END -->';

/**
 * Generate CLAUDE.md content with project-specific information
 */
export function generateClaudeMdContent(projectName: string, techStack?: string): string {
  const techStackLine = techStack
    ? `**Tech-Stack:** ${techStack}\n`
    : '';

  return `${MARKER_START}
# DevFlow - Workflow-Regeln für Claude Code

**Projekt:** ${projectName}
${techStackLine}
Dieses Projekt ist mit DevFlow verbunden. Du hast MCP-Tools um Workflows zu bearbeiten.

## Verfügbare MCP-Tools (21 Tools)

### Projekte & Workflows

| Tool | Beschreibung |
|------|--------------|
| \`project_list\` | Listet alle Projekte |
| \`project_get\` | Holt Projekt-Details inkl. Tech-Stack |
| \`flow_list\` | Listet Workflows, optional gefiltert |
| \`flow_get\` | Holt Workflow-Details inkl. vollem Plan und Audit-Trail |
| \`flow_update\` | Updated Status, Plan, Agent-Nachrichten (mit Pflichtfeld-Guardrails) |
| \`flow_get_feedback\` | Holt User-Feedback zu Plan oder Code |

### Tasks

| Tool | Beschreibung |
|------|--------------|
| \`task_list\` | Listet Tasks eines Workflows |
| \`task_create\` | Erstellt neuen Task |
| \`task_update\` | Updated Task oder markiert als erledigt |

### Agent Sessions

| Tool | Beschreibung |
|------|--------------|
| \`agent_session_create\` | Erstellt neue Agent-Session (Tracking) |
| \`agent_session_log\` | Loggt Fortschritt in eine Session |
| \`agent_session_complete\` | Schließt eine Agent-Session ab |
| \`agent_session_list\` | Listet Sessions eines Workflows |

### Knowledge & Releases

| Tool | Beschreibung |
|------|--------------|
| \`project_knowledge_get\` | Holt Projekt-Wissensbasis |
| \`project_knowledge_update\` | Aktualisiert Projekt-Dokumentation |
| \`release_list\` | Listet Releases eines Projekts |
| \`release_get\` | Holt Release-Details |
| \`release_create\` | Erstellt neues Release |
| \`release_update\` | Updated Release-Status/Details |

### Suche

| Tool | Beschreibung |
|------|--------------|
| \`search\` | Sucht Workflows, Tasks und Projekte nach Stichwort |

## Pflichtfeld-Guardrails

Der MCP Server erzwingt bestimmte Felder bei State-Transitions:

| Transition | Pflichtfelder |
|------------|--------------|
| → \`plan_review\` | \`implementationPlan\` muss gesetzt sein |
| → \`code_review\` | \`agentSummary\` und \`testingInstructions\` müssen gesetzt sein |

Ohne diese Felder wird die Transition abgelehnt.

## Workflow States

\`\`\`
idea → planning → plan_review → progress → code_review → testing → done
\`\`\`

| State | Bedeutung |
|-------|-----------|
| \`idea\` | Neue Idee, noch kein Plan |
| \`planning\` | Agent erstellt Plan |
| \`plan_review\` | User reviewed den Plan |
| \`progress\` | Implementierung läuft |
| \`code_review\` | User reviewed den Code |
| \`testing\` | Tests laufen |
| \`done\` | Abgeschlossen |

## PFLICHT-PROZESS: Workflow bearbeiten

**WICHTIG:** Dieser Prozess MUSS bei JEDEM Workflow befolgt werden!

### FEHLER DIE NICHT WIEDERHOLT WERDEN DÜRFEN
- NIEMALS von plan_review direkt auf progress springen ohne User-Freigabe
- IMMER implementationPlan im flow_update setzen BEVOR plan_review
- Plan muss in der UI sichtbar sein - ohne implementationPlan sieht der User nichts
- WARTEN heißt WARTEN - nicht einfach weitermachen

---

### Szenario A: Workflow ist "idea" → Plan erstellen

Wenn der User sagt **"Plane Workflow WF-123"** oder der Workflow auf \`idea\` steht:

**Phase 1: Analyse**
\`\`\`
flow_get <id>                        → Details lesen
flow_update                          → currentState: "planning", agentStatus: "analyzing"
\`\`\`

**Phase 2: Plan erstellen**

Der Plan kann erstellt werden mit:
- Direkt hier analysieren und schreiben
- Mit \`/superpowers:writing-plans\` Skill (empfohlen für komplexe Features)
- Manuell vom User/Entwickler

\`\`\`
flow_update                          → agentStatus: "planning", agentMessage: "Erstelle Plan"
... Plan schreiben (Markdown) ...
flow_update                          → implementationPlan: "<plan>", currentState: "plan_review"
flow_update                          → agentStatus: "idle"
\`\`\`

**Phase 3: User Review**

Der User sieht den Plan in der Web-App und kann:
- Genehmigen → Workflow geht auf \`progress\`
- Feedback geben → \`planFeedback\` wird gesetzt, Workflow bleibt auf \`planning\`

Bei Feedback: \`flow_get\` erneut aufrufen, \`planFeedback\` lesen, Plan überarbeiten.

---

### Szenario B: Plan existiert → Plan ausführen

Wenn der User sagt **"Führe Workflow WF-123 aus"** oder der Workflow auf \`progress\` steht:

**Phase 1: Plan laden**
\`\`\`
flow_get <id>                        → implementationPlan lesen!
flow_update                          → agentStatus: "analyzing", agentMessage: "Lese Plan"
\`\`\`

**Phase 2: Tasks aus Plan erstellen**
\`\`\`
flow_update                          → agentStatus: "planning", agentMessage: "Erstelle Tasks"
task_create (für jeden Schritt)      → Tasks in DevFlow anlegen
\`\`\`

**Phase 3: Implementierung (pro Task)**
\`\`\`
flow_update                          → agentStatus: "implementing", agentMessage: "Arbeite an: <task>"
... Code schreiben ...
task_update <taskId>                 → isCompleted: true
\`\`\`

**Phase 4: Test**
\`\`\`
flow_update                          → agentStatus: "testing", agentMessage: "Build-Test"
npm run build                        → Prüfen ob alles kompiliert
\`\`\`

**Phase 5: Code Review anfordern**
\`\`\`
flow_update                          → currentState: "code_review"
                                     → agentSummary: "Was wurde implementiert..."
                                     → testingInstructions: "Wie man testet..."
                                     → agentStatus: "idle"
\`\`\`
**WICHTIG:** \`agentSummary\` UND \`testingInstructions\` sind Pflichtfelder für \`code_review\`!

**Phase 6: User Review**

Der User reviewed den Code und kann:
- Genehmigen → Workflow geht auf \`done\`
- Feedback geben → \`codeFeedback\` wird gesetzt, Workflow geht auf \`progress\`

Bei Feedback: \`flow_get\` erneut aufrufen, \`codeFeedback\` lesen, Code überarbeiten.

---

### Szenario C: Bestehenden Plan überarbeiten oder neu erstellen

Wenn der User sagt **"Überarbeite den Plan"** oder **"Erstelle einen neuen Plan"**:

**Option 1: Plan überarbeiten**
\`\`\`
flow_get <id>                        → Bestehenden Plan lesen
flow_update                          → currentState: "planning", agentStatus: "planning"
... Plan verbessern basierend auf bestehendem Plan ...
flow_update                          → implementationPlan: "<verbesserter-plan>", currentState: "plan_review"
flow_update                          → agentStatus: "idle"
\`\`\`

**Option 2: Plan komplett neu erstellen**
\`\`\`
flow_get <id>                        → Nur Anforderungen lesen, Plan ignorieren
flow_update                          → currentState: "planning", agentStatus: "analyzing"
... Komplett neuen Plan erstellen ...
flow_update                          → implementationPlan: "<neuer-plan>", currentState: "plan_review"
flow_update                          → agentStatus: "idle"
\`\`\`

**Wann welche Option?**

| User sagt | Aktion |
|-----------|--------|
| "Überarbeite den Plan" | Option 1 - bestehenden Plan als Basis nehmen |
| "Der Plan ist gut, aber X fehlt" | Option 1 - gezielt ergänzen |
| "Erstelle einen neuen Plan" | Option 2 - von vorne anfangen |
| "Der Plan ist falsch" | Option 2 - komplett neu |

---

## Checkliste vor Abschluss

- [ ] Plan aus flow_get gelesen (wenn vorhanden)?
- [ ] Alle Tasks auf \`isCompleted: true\` gesetzt?
- [ ] Build erfolgreich (\`npm run build\`)?
- [ ] \`agentSummary\` geschrieben (was wurde gemacht)?
- [ ] Workflow auf \`currentState: "code_review"\` oder \`"done"\` gesetzt?
- [ ] Agent auf \`agentStatus: "idle"\` gesetzt?
- [ ] Commit gemacht (wenn gewünscht)?

**Der User verlässt sich darauf, dass der Workflow-Status korrekt ist!**

---

## Workflow-Status melden

\`\`\`
flow_update <id> --agentStatus=implementing --agentMessage="Erstelle API-Endpoint"
\`\`\`

Der User sieht in Echtzeit was du tust!

## Integration mit anderen Tools

Der Plan kann auch mit anderen Tools erstellt werden:

| Tool | Verwendung |
|------|------------|
| \`/superpowers:writing-plans\` | Komplexe Features planen |
| \`/superpowers:brainstorming\` | Ideen sammeln vor der Planung |
| Manuell | User schreibt Plan selbst |

Nach Plan-Erstellung mit externem Tool:
\`\`\`
flow_update <id> --implementationPlan="<plan>" --currentState="plan_review"
\`\`\`
${MARKER_END}
`;
}
