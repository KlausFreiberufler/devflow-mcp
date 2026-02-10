# DevFlow v3 - Hard Enforcement & Reliable AI Development

**Datum:** 2026-02-10
**Status:** Design
**Autor:** Klaus + Claude (Brainstorming)

---

## Zusammenfassung

DevFlow wird von einem "Regelwerk in CLAUDE.md" zu einem **technisch erzwungenen Entwicklungsprozess** umgebaut. Der MCP-Server wird zum Gatekeeper: Ohne aktiven Workflow-Context kann der Agent keine Tools nutzen. Alles wird automatisch protokolliert. Pro User ist nur ein aktiver Agent erlaubt.

### Kernprobleme (aktuell)

1. **KI ignoriert Regeln** - Prozess steht in CLAUDE.md, wird aber nicht zuverlässig befolgt
2. **Kein technisches Enforcement** - Regeln sind Empfehlungen, keine Pflicht
3. **Schlechtes Logging** - Sessions/Tasks werden nicht sauber gepflegt

### Design-Entscheidungen

| Entscheidung | Gewählt |
|---|---|
| Architektur | **Hybrid** - Init-Gate + Auto-Logging |
| Enforcement | **Hard** - Server blockt alles was nicht dem Prozess entspricht |
| Konsequenzen bei Verstoß | **Block + Anleitung** - Ablehnung + nächster korrekter Schritt |
| Scope | **Vollständige Kontrolle** - Kein Freistil möglich |
| Flow-Locking | **Exklusiv** - Ein Agent pro Flow |
| Agent-Status | **Automatisch abgeleitet** aus Tool-Calls |
| Config-Quelle | **Remote** - DevFlow-Backend ist Source of Truth |
| Auth | **Browser-basiert** - wie GitHub CLI, kein Plugin |
| Agent-Slots | **1 pro User** (erweiterbar über Lizenzen) |
| Zielgruppe | **Internes Team** (2-5 Entwickler) |

---

## 1. Architektur: Hybrid Init-Gate

### Konzept

Jede Arbeitssession beginnt mit `devflow_init`. Dieses Tool:
- Validiert den Workflow
- Erstellt intern eine Agent-Session
- Setzt den Server-Context (aktiver Workflow + Session)
- Sperrt den Flow für diesen Agent (exklusives Locking)
- Prüft und belegt den Agent-Slot des Users
- Gibt den vollständigen Kontext zurück

### Tool-Verfügbarkeit

**Ohne Init (Discovery-Modus):**

| Tool | Zweck |
|---|---|
| `flow_list` | Freie Workflows finden |
| `flow_create` | Neuen Workflow erstellen (inittet automatisch) |
| `devflow_init` | Bestehenden Workflow beanspruchen |

**Alle anderen Tools blockiert** bis `devflow_init` erfolgreich war.

### devflow_init Response

```json
{
  "workflow": {
    "id": "abc123",
    "summary": "API-Caching implementieren",
    "description": "...",
    "acceptanceCriteria": ["..."],
    "implementationPlan": "... (falls vorhanden)"
  },
  "state": "planning",
  "previousState": "plan_review",
  "feedback": {
    "type": "plan_rejected",
    "from": "klaus",
    "message": "Plan berücksichtigt Edge-Cases nicht",
    "at": "2026-02-10T14:30:00Z"
  },
  "tasks": [
    { "id": "t1", "summary": "Cache-Layer", "isCompleted": false }
  ],
  "allowedActions": ["flow_update", "task_create", "task_update"],
  "nextStep": "Lies das Feedback und überarbeite den Plan.",
  "session": {
    "id": "sess-789",
    "startedAt": "2026-02-10T15:00:00Z"
  }
}
```

Der Agent bekommt beim Start:
1. **Was ist der Auftrag** (Workflow-Details, Plan, Acceptance Criteria)
2. **Was ist passiert** (vorheriger State, Feedback)
3. **Was er tun darf** (erlaubte Tools)
4. **Was er tun soll** (nächster korrekter Schritt)

### Blockade-Nachricht (ohne Init)

```
⛔ Kein aktiver Workflow-Context.

Starte deine Arbeit mit einem dieser Schritte:
1. flow_list() → Finde einen freien Workflow
2. devflow_init({ flowId: '<id>' }) → Beanspruche ihn
   ODER
3. flow_create({ summary: '...' }) → Erstelle einen neuen Workflow

Ohne aktiven Context sind keine weiteren Tools verfügbar.
```

---

## 2. State-basierte Zugriffskontrolle

### State-Matrix

| Workflow-State | Erlaubte Tools | Blockiert |
|---|---|---|
| **idea** | `flow_update` (→ planning) | Alles andere |
| **planning** | `flow_update` (Plan setzen → plan_review) | task_create, task_update |
| **plan_review** | `flow_get_feedback` | Alles Schreibende - Agent MUSS warten |
| **progress** | `task_create`, `task_update`, `flow_update` (→ code_review), `knowledge_update` | State-Sprünge |
| **code_review** | `flow_get_feedback` | Alles Schreibende - Agent MUSS warten |
| **testing** | `flow_get_feedback` | Code-Änderungen |
| **done** | Nur Lesen | Alles Schreibende |

### Blockade-Nachricht (State-Verstoß)

```
⛔ Aktion 'task_create' nicht erlaubt im State 'plan_review'.

Workflow: 'API-Caching' (abc123)
Aktueller State: plan_review
Erlaubte Aktionen: flow_get_feedback

Nächster Schritt: Warte auf User-Feedback zum Plan.
Nutze flow_get_feedback() um zu prüfen ob Feedback vorliegt.
```

### Pflichtfelder bei State-Transitions

| Transition | Pflichtfelder | Blockade-Nachricht |
|---|---|---|
| → `plan_review` | `implementationPlan` | "Schreibe einen Implementation-Plan bevor du ihn zur Review einreichst." |
| → `code_review` | `agentSummary`, `testingInstructions` | "Beschreibe was du implementiert hast und wie der User testen kann." |

### Blockierte Transitions (nur User über UI)

| Von | Nach | Grund |
|---|---|---|
| `plan_review` | `progress` | User muss Plan genehmigen |
| `code_review` | `testing`/`done` | User muss Code genehmigen |
| `testing` | `done` | User muss Testing abschließen |

---

## 3. Auto-Logging

### Konzept

Jeder Tool-Call wird automatisch in die Agent-Session geloggt. Der Agent muss sich nicht darum kümmern.

### Was wird geloggt

| Event | Beispiel |
|---|---|
| Tool-Call | `task_create("Cache-Layer einbauen")` - Erfolg |
| State-Transition | `planning → plan_review` |
| Verstoß | `task_create blockiert in State 'plan_review'` |
| Session-Start | `devflow_init(WF-43)` von User klaus |
| Session-Ende | `flow_update → code_review`, Session abgeschlossen |

### Automatische agentStatus-Ableitung

Der Server leitet den Agent-Status aus den Tool-Calls ab:

| Tool-Call | Abgeleiteter agentStatus |
|---|---|
| `devflow_init` | `analyzing` |
| `flow_update(implementationPlan)` | `planning` |
| `task_create` | `planning` |
| `task_update(completed)` | `implementing` |
| `flow_update(→ code_review)` | `idle` |
| `flow_get_feedback` | `reviewing` |
| Blockierter Call | Bleibt unverändert |

Der Agent muss `agentStatus` und `agentMessage` NICHT mehr manuell setzen.

### Session-Timeline in DevFlow-UI

Das Team sieht pro Workflow eine chronologische Timeline:
```
15:00 - Agent gestartet (klaus)
15:01 - Plan gelesen, Feedback analysiert
15:05 - Plan überarbeitet und eingereicht
15:06 - Session pausiert (warte auf Review)
...
16:30 - Agent gestartet (neue Session)
16:31 - Plan genehmigt - Tasks erstellt (3)
16:32 - Task 1: "Cache-Layer" - gestartet
16:45 - Task 1: abgeschlossen
16:46 - Task 2: "Cache-Invalidation" - gestartet
...
17:30 - Code-Review eingereicht
17:30 - Session abgeschlossen
```

---

## 4. Flow-Locking

### Exklusives Locking

- `devflow_init` sperrt den Flow für den aktuellen Agent
- Kein anderer Agent kann denselben Flow beanspruchen
- In `flow_list` erscheinen gesperrte Flows als "in Bearbeitung"

### Lock-Freigabe

Der Lock wird freigegeben wenn:
1. Agent schließt die Session ab (flow_update → code_review/done)
2. User trennt den Agent manuell in der DevFlow-UI
3. MCP-Server-Prozess endet (graceful shutdown)

### Lock-Anzeige in flow_list

```
Workflows:

🔨 Progress (1)
- WF-43: API-Caching [🔒 klaus - seit 14:30]

💡 Idea (2)
- WF-44: Dark Mode (frei)
- WF-45: E-Mail Notifications (frei)
```

---

## 5. Agent-Slots & API-Zugang

### Konzept

Pro User ist nur **ein aktiver Agent** gleichzeitig erlaubt.

### Enforcement

- `devflow_init` prüft: Hat der User einen freien Agent-Slot?
- Wenn belegt:
  ```
  ⛔ Dein Agent-Slot ist bereits belegt.

  Aktiver Agent:
    Workflow: WF-43 (API-Caching)
    Status: implementing
    Seit: 10.02.2026 14:30

  Trenne den aktiven Agent in DevFlow → Einstellungen → API-Zugang,
  oder warte bis die aktuelle Session endet.
  ```

### DevFlow-UI: Einstellungen → API-Zugang

```
┌─────────────────────────────────────────┐
│ API-Zugang                              │
├─────────────────────────────────────────┤
│ Agent-Slots: 1 / 1 (Free)              │
│                                         │
│ Aktiver Agent:                          │
│   Projekt: MyApp                        │
│   Workflow: WF-43 (API-Caching)         │
│   Status: implementing                  │
│   Seit: 10.02.2026 14:30                │
│                                         │
│   [Agent trennen]  [Session-Log]        │
│                                         │
│ API-Token: df_****_abc123               │
│ [Neuen Token generieren]                │
└─────────────────────────────────────────┘
```

### Zukünftige Erweiterung

- Mehr Agent-Slots über Lizenz-Upgrades
- Teamleads sehen alle aktiven Agents im Projekt
- Agent-Slot-Verwaltung pro Team

---

## 6. Remote-Config & Auto-Sync

### Source of Truth: DevFlow-Backend

Alle Konfiguration wird zentral im DevFlow-Backend gespeichert und verwaltet.

### Was konfigurierbar ist (in DevFlow-UI → Projekt-Einstellungen)

- **Workflow-States**: Welche States, welche Transitions
- **Tool-Berechtigungen pro State**: State-Matrix (siehe Abschnitt 2)
- **Pflichtfelder**: Welche Felder bei welcher Transition
- **CLAUDE.md-Template**: Inhalt der generierten CLAUDE.md
- **Team-Policies**: z.B. "Tests pflicht vor code_review"

### Auto-Sync bei Server-Start

```
MCP Server startet
  → Liest .devflow/config.version (lokal)
  → GET /api/projects/{id}/config?version={hash}
  → 304 Not Modified → Config aktuell, weiter
  → 200 + neue Config → Lokal updaten:
      .devflow/config.json → neue Regeln
      .devflow/config.version → neuer Hash
      CLAUDE.md → aktualisieren (zwischen Markern)
  → Server bereit
```

### Lokale Dateien

```
.devflow/
├── project.json       # Projekt-Link (ID, Name) - erstellt bei Setup
├── config.json        # Aktuelle Regeln vom Backend
├── config.version     # Hash für Sync-Check
└── .gitignore         # session.json ignorieren
```

`project.json` und `config.json` werden ins Git eingecheckt (Team teilt Config).
`session.json` (Runtime-State) wird gitignored.

---

## 7. Setup-Prozess

### Erstinstallation (einmalig pro Rechner)

```bash
npx devflow-mcp setup
```

1. Build des MCP-Servers
2. Fragt nach DevFlow-URL
3. Registriert MCP-Server bei Claude Code (user scope)

### Projekt-Linking (einmalig pro Projekt)

```
Terminal                          Browser
────────                          ───────
$ npx devflow-mcp setup
  → Startet lokalen Callback-Server
  → Öffnet Browser                      → DevFlow Login
                                        → User authentifiziert sich
                                        → User wählt Projekt
                                        → User sieht Config-Übersicht
                                        → Klickt "Verbinden"
                                        → Redirect zu localhost:callback
  ← Token + Projekt-Config empfangen
  → .devflow/ Ordner erstellt
  → config.json geschrieben
  → CLAUDE.md erstellt/aktualisiert
  → "Setup abgeschlossen!"
```

### Auth-Methode

- **Browser-basiert** wie GitHub CLI (`gh auth login`)
- Kein Chrome-Plugin nötig
- MCP-Setup startet lokalen HTTP-Server auf freiem Port
- Browser bekommt URL mit `redirect_uri=http://localhost:{port}/callback`
- Nach Auth redirected DevFlow zum Callback
- Token + Config werden empfangen
- Lokaler Server schließt sich

### Fehlerbehandlung

```
$ npx devflow-mcp setup
  → "Öffne Browser für Auth..."
  → ... Timeout nach 2 Minuten ...
  → "❌ Auth fehlgeschlagen."
  → "Erneut versuchen? (j/n)"
  → j → Startet Prozess neu
```

---

## 8. Neue CLAUDE.md (schlank)

Die CLAUDE.md wird drastisch kürzer, weil der Server die Regeln erzwingt:

```markdown
<!-- DEVFLOW-RULES-START -->
# DevFlow

Dieses Projekt nutzt DevFlow für strukturierte KI-Entwicklung.

## Arbeitsstart

BEVOR du mit der Arbeit beginnst:

1. `flow_list()` → Finde einen freien Workflow
2. `devflow_init({ flowId: '<id>' })` → Starte deine Session
   ODER
3. `flow_create({ summary: '...' })` → Erstelle einen neuen Workflow

Ohne `devflow_init` sind alle Tools blockiert.

## Prozess

Der Server gibt dir bei jedem Schritt Anweisungen was als nächstes zu tun ist.
Folge den `nextStep`-Anweisungen aus den Tool-Responses.

Erlaubte Aktionen hängen vom Workflow-State ab und werden vom Server erzwungen.
<!-- DEVFLOW-RULES-END -->
```

Statt ~250 Zeilen nur noch ~20 Zeilen. Der Server ist die Autorität, nicht die CLAUDE.md.

---

## 9. End-to-End Beispiel

### Szenario: Agent nimmt zurückgeschickten Flow auf

```
1. flow_list()
   → WF-43: "API-Caching" (planning, frei, hat Feedback)
   → WF-44: "Dark Mode" (idea, frei)

2. devflow_init({ flowId: "WF-43" })
   → "Flow WF-43 beansprucht. Agent-Slot belegt."
   → state: planning
   → previousState: plan_review
   → feedback: "Plan berücksichtigt Edge-Cases nicht"
   → nextStep: "Überarbeite den Plan basierend auf dem Feedback."
   → allowedActions: [flow_update]

3. Agent analysiert Codebase, überarbeitet Plan

4. flow_update({ flowId: "WF-43", implementationPlan: "..." })
   → Server setzt automatisch: state → plan_review
   → Server setzt automatisch: agentStatus → idle
   → Session-Log: "Plan überarbeitet und eingereicht"
   → "Plan eingereicht. Warte auf User-Review."
   → Flow-Lock bleibt bestehen

--- User reviewed in DevFlow-UI, genehmigt Plan ---

5. devflow_init({ flowId: "WF-43" })  // Neue Session
   → state: progress
   → previousState: plan_review
   → feedback: null (Plan genehmigt)
   → nextStep: "Erstelle Tasks aus dem Plan und beginne mit der Implementierung."
   → implementationPlan: "..." (der genehmigte Plan)

6. task_create({ summary: "Cache-Layer einbauen" })
7. task_create({ summary: "Cache-Invalidation" })
8. task_create({ summary: "Tests schreiben" })
   → Server: agentStatus → planning (automatisch)

9. task_update({ taskId: "t1", isCompleted: true })
   → Server: agentStatus → implementing (automatisch)

10. task_update({ taskId: "t2", isCompleted: true })
11. task_update({ taskId: "t3", isCompleted: true })

12. flow_update({
      flowId: "WF-43",
      agentSummary: "Cache-Layer mit Redis implementiert...",
      testingInstructions: "1. npm run test\n2. Cache-Hit prüfen..."
    })
    → Server setzt: state → code_review, agentStatus → idle
    → Session abgeschlossen
    → Flow-Lock freigegeben
    → "Code-Review eingereicht. Warte auf User-Review."
```

---

## 10. Benötigte Änderungen

### MCP-Server (dieses Repo)

| Bereich | Änderung |
|---|---|
| **Neues Tool: `devflow_init`** | Init-Gate mit Context-Setup, Locking, Slot-Check |
| **Middleware: Context-Guard** | Prüft bei jedem Tool-Call ob Context aktiv ist |
| **Middleware: State-Guard** | Prüft ob Tool im aktuellen State erlaubt ist |
| **Auto-Logging** | Jeder Tool-Call wird automatisch geloggt |
| **Auto-Status** | agentStatus wird aus Aktionen abgeleitet |
| **Config-Sync** | Beim Start Config vom Backend laden |
| **Setup überarbeiten** | Browser-Auth mit Callback-Server |
| **CLAUDE.md v2** | Schlankes Template, Server erzwingt Regeln |
| **flow_list anpassen** | Lock-Status anzeigen, nur freie Flows |
| **flow_create anpassen** | Auto-Init nach Erstellung |
| **project_list entfernen** | Nur noch im Setup-Modus verfügbar |

### DevFlow-Backend (separates Repo)

| Bereich | Änderung |
|---|---|
| **Config-API** | `GET /api/projects/{id}/config` mit Versionierung |
| **Agent-Slot-API** | Slot claim/release/status Endpoints |
| **Flow-Lock-API** | Lock/Unlock Endpoints |
| **Auth-Callback** | OAuth-artiger Callback-Flow für Setup |
| **UI: API-Zugang** | Settings-Seite mit Agent-Slot-Übersicht |
| **UI: Projekt-Config** | Konfigurierbare Regeln, State-Matrix, Policies |
| **UI: Session-Timeline** | Chronologische Ansicht aller Agent-Aktionen |

---

## 11. Migrations-Strategie

### Phase 1: Core Enforcement (MVP)
- `devflow_init` Tool
- Context-Guard Middleware
- State-Guard Middleware
- Flow-Locking (einfach, ohne Timeout)
- Schlanke CLAUDE.md

### Phase 2: Auto-Logging & Config
- Auto-Logging in Agent-Sessions
- Auto-Status-Ableitung
- Remote-Config-Sync
- Setup mit Browser-Auth

### Phase 3: Agent-Slots & UI
- Agent-Slot-System
- DevFlow-UI: API-Zugang Seite
- DevFlow-UI: Session-Timeline
- DevFlow-UI: Projekt-Config Editor

### Phase 4: Polish & Erweiterungen
- Konfigurier bare State-Matrix
- Team-Policies
- Lizenz-System für Agent-Slots
- Offline-Fallback
