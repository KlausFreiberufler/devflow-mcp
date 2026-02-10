# DevFlow Backend - Änderungen für v3 Enforcement

**Datum:** 2026-02-10
**Status:** Plan
**Kontext:** Der MCP-Server (devflow-mcp) ist auf v3.0 umgebaut. Dieses Dokument beschreibt die Backend-Änderungen die nötig sind, damit alle MCP-Features funktionieren.

---

## Übersicht: Was der MCP-Server jetzt vom Backend erwartet

### Bestehende Endpoints (funktionieren bereits)

| Method | Endpoint | Zweck |
|--------|----------|-------|
| POST | `/api/auth/cli/request` | Auth-Code anfordern |
| GET | `/api/auth/cli/token?code=` | Token abholen (Polling) |
| POST | `/api/auth/refresh` | Token erneuern |
| GET | `/api/projects` | Alle Projekte |
| GET | `/api/projects/:id` | Projekt-Details |
| GET | `/api/workflows` | Workflows (mit ?projectId Filter) |
| GET | `/api/workflows/:id` | Workflow-Details |
| POST | `/api/workflows` | Workflow erstellen |
| PATCH | `/api/workflows/:id` | Workflow updaten |
| GET | `/api/workflows/:id/feedback` | Feedback abrufen |
| GET | `/api/workflows/:id/todos` | Tasks eines Workflows |
| POST | `/api/todos` | Task erstellen |
| PATCH | `/api/todos/:id` | Task updaten |
| POST | `/api/agent-sessions` | Agent-Session erstellen |
| POST | `/api/agent-sessions/:id/log` | Session-Log-Eintrag |
| POST | `/api/agent-sessions/:id/complete` | Session abschliessen |
| GET | `/api/agent-sessions/workflow/:id` | Sessions eines Workflows |
| GET/PATCH | `/api/projects/:id/knowledge` | Wissensbasis |
| GET/POST/PATCH | `/api/releases` | Releases |
| GET | `/api/search` | Volltextsuche |

### Neue Endpoints (MCP-Server ruft sie bereits auf, Backend muss sie implementieren)

| Method | Endpoint | Zweck | Priorität |
|--------|----------|-------|-----------|
| **GET** | **`/api/projects/:id/config`** | Projekt-Config für MCP-Server | Hoch |
| **GET** | **`/api/agent-slots/status`** | Agent-Slot Status des Users | Mittel |

### Neue UI-Seiten

| Seite | Zweck | Priorität |
|-------|-------|-----------|
| **Session-Timeline** | Chronologische Ansicht aller Agent-Aktionen pro Workflow | Hoch |
| **API-Zugang** (Settings) | Agent-Slot Übersicht, Agent trennen, Token verwalten | Mittel |
| **Projekt-Config Editor** | State-Matrix, Pflichtfelder, Guidance-Texte konfigurieren | Niedrig |

---

## 1. Projekt-Config Endpoint

### `GET /api/projects/:id/config`

**Warum:** Der MCP-Server lädt beim Start die Konfiguration vom Backend. Damit können Regeln (welche Tools in welchem State erlaubt sind, Guidance-Texte, Pflichtfelder) zentral verwaltet werden, ohne den MCP-Server neu zu deployen.

**Request:**
```
GET /api/projects/abc123/config
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "version": "2026-02-10-001",
    "statePermissions": {
      "idea": ["flow_update", "flow_get"],
      "planning": ["flow_update", "flow_get", "flow_get_feedback"],
      "plan_review": ["flow_get", "flow_get_feedback"],
      "progress": [
        "flow_update", "flow_get", "task_list", "task_create", "task_update",
        "project_knowledge_get", "project_knowledge_update"
      ],
      "code_review": ["flow_get", "flow_get_feedback"],
      "testing": ["flow_get", "flow_get_feedback", "task_list"],
      "done": ["flow_get", "task_list"]
    },
    "nextStepGuidance": {
      "idea": "Wechsle den Workflow zu \"planning\" ...",
      "planning": "Analysiere die Anforderungen ...",
      "plan_review": "Warte auf User-Feedback ...",
      "progress": "Erstelle Tasks ...",
      "code_review": "Warte auf User-Feedback ...",
      "testing": "Warte auf User-Testing ...",
      "done": "Workflow abgeschlossen."
    },
    "requiredFields": {
      "plan_review": {
        "fields": ["implementationPlan"],
        "message": "implementationPlan ist Pflicht ..."
      },
      "code_review": {
        "fields": ["agentSummary", "testingInstructions"],
        "message": "agentSummary und testingInstructions sind Pflicht ..."
      }
    },
    "blockedTransitions": {
      "plan_review": [
        { "target": "progress", "reason": "User muss Plan freigeben." }
      ],
      "code_review": [
        { "target": "testing", "reason": "User muss Code freigeben." },
        { "target": "done", "reason": "User muss Code freigeben." }
      ],
      "testing": [
        { "target": "done", "reason": "User muss Testing abschliessen." }
      ]
    }
  }
}
```

**Verhalten bei 404:** MCP-Server nutzt hardcodierte Defaults. Kann also schrittweise implementiert werden.

### Datenbank-Schema

```sql
CREATE TABLE project_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  version VARCHAR(50) NOT NULL,
  state_permissions JSONB NOT NULL,
  next_step_guidance JSONB NOT NULL,
  required_fields JSONB NOT NULL,
  blocked_transitions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id)
);
```

### Implementierung

1. **Migration:** `project_configs` Tabelle anlegen
2. **Seed:** Default-Config für jedes bestehende Projekt einfügen
3. **Controller:** `GET /api/projects/:id/config` - Config laden oder Default zurückgeben
4. **Optional:** `PUT /api/projects/:id/config` - Config aktualisieren (für Config-Editor UI)

---

## 2. Agent-Slot Endpoint

### `GET /api/agent-slots/status`

**Warum:** Pro User nur ein aktiver Agent. Der MCP-Server prüft vor `devflow_init` ob der Slot frei ist.

**Request:**
```
GET /api/agent-slots/status
Authorization: Bearer <token>
```

**Response (Slot frei):**
```json
{
  "success": true,
  "data": {
    "active": false
  }
}
```

**Response (Slot belegt):**
```json
{
  "success": true,
  "data": {
    "active": true,
    "workflow": {
      "id": "abc123",
      "summary": "API-Caching implementieren",
      "agentStatus": "implementing",
      "since": "2026-02-10T14:30:00Z"
    }
  }
}
```

**Verhalten bei 404:** MCP-Server behandelt das als "Slot frei" → kein Blocking. Kann also later implementiert werden.

### Logik

Der Slot-Status leitet sich aus bestehenden Daten ab:
- Finde alle Workflows wo `agent_status != 'idle'` AND `agent_status IS NOT NULL`
- Filtere auf den aktuellen User (via Token/Session)
- Wenn mindestens 1 gefunden → Slot belegt, return den neuesten

**Kein neues DB-Schema nötig** - die Info kommt aus der `workflows` Tabelle.

### Implementierung

1. **Controller:** `GET /api/agent-slots/status`
2. **Query:** `SELECT * FROM workflows WHERE agent_status IS NOT NULL AND agent_status != 'idle' AND project_id IN (user's projects) ORDER BY updated_at DESC LIMIT 1`
3. **Optional:** `DELETE /api/agent-slots/release` - Agent trennen (für UI "Agent trennen" Button)

---

## 3. Session-Timeline UI

### Warum

Der MCP-Server loggt jetzt automatisch jeden Tool-Call in die Agent-Session (`POST /api/agent-sessions/:id/log`). Diese Logs müssen in der UI sichtbar sein.

### Bestehende Daten

Die Logs werden bereits gespeichert via `POST /api/agent-sessions/:id/log`:
```json
{
  "message": "task_create(summary: \"Cache-Layer\") - Erfolg (45ms)",
  "level": "info"
}
```

### Was die UI zeigen soll

Pro Workflow eine chronologische Timeline aller Agent-Aktionen:

```
Session #1 (10.02.2026, 15:00 - 15:06)
├─ 15:00 [info]  devflow_init() - Erfolg
├─ 15:01 [info]  flow_get(flowId: "abc123") - Erfolg (120ms)
├─ 15:03 [info]  flow_update(implementationPlan: "# Plan...") - Erfolg (89ms)
├─ 15:05 [warn]  BLOCKED: task_create() - State 'plan_review'
└─ 15:06 [info]  Session abgeschlossen: Plan eingereicht

Session #2 (10.02.2026, 16:30 - 17:30)
├─ 16:30 [info]  devflow_init() - Erfolg
├─ 16:31 [info]  task_create(summary: "Cache-Layer") - Erfolg
├─ 16:32 [info]  task_create(summary: "Invalidation") - Erfolg
├─ 16:45 [info]  task_update(isCompleted: true) - Erfolg
├─ 17:00 [info]  task_update(isCompleted: true) - Erfolg
├─ 17:25 [info]  flow_update(agentSummary: "...") - Erfolg
└─ 17:30 [info]  Session abgeschlossen: Code-Review eingereicht
```

### Benötigte API-Erweiterungen

| Endpoint | Änderung |
|----------|----------|
| `GET /api/agent-sessions/workflow/:id` | Session-Logs mitliefern (optional ?includeLogs=true) |
| `GET /api/agent-sessions/:id/logs` | Logs einer einzelnen Session |

### Implementierung

1. **Neuer Endpoint:** `GET /api/agent-sessions/:id/logs` - Alle Log-Einträge einer Session
2. **Erweiterung:** `GET /api/agent-sessions/workflow/:id?includeLogs=true` - Sessions + Logs
3. **UI-Komponente:** Timeline-View auf der Workflow-Detailseite
4. **Filter:** Level-Filter (info/warn/error), Zeitraum-Filter

---

## 4. API-Zugang Seite (Settings)

### Warum

User brauchen eine Übersicht über ihren aktiven Agent und die Möglichkeit ihn zu trennen.

### Wireframe

```
┌─────────────────────────────────────────────┐
│ Einstellungen → API-Zugang                  │
├─────────────────────────────────────────────┤
│                                             │
│ Agent-Slots: 1 / 1 (Free-Plan)             │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Aktiver Agent                           │ │
│ │                                         │ │
│ │ Projekt: MCP-Server                     │ │
│ │ Workflow: API-Caching (WF-43)           │ │
│ │ Status: implementing                    │ │
│ │ Seit: 10.02.2026, 14:30                 │ │
│ │                                         │ │
│ │ [Agent trennen]  [Session-Log ansehen]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ API-Token                               │ │
│ │                                         │ │
│ │ df_****_abc123                          │ │
│ │ Erstellt: 10.02.2026                    │ │
│ │                                         │ │
│ │ [Neuen Token generieren]                │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ MCP-Server Setup:                           │
│ npx devflow-mcp setup                       │
│                                             │
└─────────────────────────────────────────────┘
```

### Benötigte Endpoints

| Method | Endpoint | Zweck |
|--------|----------|-------|
| GET | `/api/agent-slots/status` | Slot-Status (siehe oben) |
| POST | `/api/agent-slots/release` | Agent trennen |
| GET | `/api/auth/tokens` | Token-Liste |
| POST | `/api/auth/tokens` | Neuen Token generieren |
| DELETE | `/api/auth/tokens/:id` | Token widerrufen |

### "Agent trennen" Logik

```
POST /api/agent-slots/release
→ Finde aktiven Workflow des Users (agent_status != idle)
→ Setze agent_status = 'idle', agent_message = 'Manuell getrennt'
→ Schliesse offene Agent-Sessions ab
→ Return { success: true }
```

---

## 5. Projekt-Config Editor (niedrige Priorität)

### Warum

Admins/Teamleads sollen State-Permissions, Guidance-Texte und Pflichtfelder pro Projekt konfigurieren können.

### Wireframe

```
┌──────────────────────────────────────────────────┐
│ Projekt-Einstellungen → Workflow-Regeln           │
├──────────────────────────────────────────────────┤
│                                                  │
│ State-Berechtigungen                             │
│ ┌──────────┬───────────────────────────────────┐ │
│ │ idea     │ ☑ flow_update  ☑ flow_get         │ │
│ │ planning │ ☑ flow_update  ☑ flow_get         │ │
│ │          │ ☑ flow_get_feedback               │ │
│ │ progress │ ☑ flow_update  ☑ flow_get         │ │
│ │          │ ☑ task_list  ☑ task_create         │ │
│ │          │ ☑ task_update  ☑ knowledge_*       │ │
│ │ ...      │ ...                               │ │
│ └──────────┴───────────────────────────────────┘ │
│                                                  │
│ Pflichtfelder                                    │
│ ┌──────────────┬─────────────────────────┐       │
│ │ plan_review  │ implementationPlan      │       │
│ │ code_review  │ agentSummary,           │       │
│ │              │ testingInstructions     │       │
│ └──────────────┴─────────────────────────┘       │
│                                                  │
│ Guidance-Texte (pro State)                       │
│ ┌──────────────────────────────────────────────┐ │
│ │ idea: [Wechsle zu planning...]              │ │
│ │ planning: [Analysiere...]                   │ │
│ │ ...                                         │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [Speichern]  [Zurücksetzen auf Defaults]         │
│                                                  │
│ Config-Version: 2026-02-10-001                   │
│ Zuletzt geändert: 10.02.2026, 16:00             │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Benötigte Endpoints

| Method | Endpoint | Zweck |
|--------|----------|-------|
| GET | `/api/projects/:id/config` | Config laden (existiert schon) |
| PUT | `/api/projects/:id/config` | Config speichern |
| POST | `/api/projects/:id/config/reset` | Auf Defaults zurücksetzen |

---

## Priorisierter Umsetzungsplan

### Woche 1: Basics (ohne UI-Änderungen)

| # | Task | Aufwand | Begründung |
|---|------|---------|------------|
| 1 | **Config-Endpoint** implementieren | 2h | MCP-Server ruft ihn bereits auf, fällt auf Defaults zurück |
| 2 | **Agent-Slot-Status** Endpoint | 1h | Nutzt bestehende Workflow-Daten, kein neues Schema |
| 3 | **Agent-Slot-Release** Endpoint | 1h | Setzt agent_status auf idle |
| 4 | **Session-Logs** Endpoint | 1h | GET /api/agent-sessions/:id/logs |

### Woche 2: Session-Timeline UI

| # | Task | Aufwand | Begründung |
|---|------|---------|------------|
| 5 | **Timeline-Komponente** | 3h | Zeigt auto-geloggte Tool-Calls chronologisch |
| 6 | **Integration in Workflow-Detail** | 1h | Timeline als Tab/Section auf Workflow-Seite |
| 7 | **Level-Filter** (info/warn/error) | 1h | Filtert Log-Einträge |

### Woche 3: API-Zugang Settings

| # | Task | Aufwand | Begründung |
|---|------|---------|------------|
| 8 | **Token-Management** Endpoints | 2h | CRUD für API-Tokens |
| 9 | **API-Zugang** Settings-Seite | 3h | Slot-Status, Agent trennen, Token verwalten |

### Woche 4: Config Editor (optional)

| # | Task | Aufwand | Begründung |
|---|------|---------|------------|
| 10 | **Config PUT** Endpoint | 1h | Config speichern |
| 11 | **Config Editor** UI | 4h | State-Matrix, Pflichtfelder, Guidance editieren |
| 12 | **Config Reset** | 0.5h | Auf Defaults zurücksetzen |

---

## Zusammenfassung

**MCP-Server (dieses Repo):** ✅ Fertig. Alle 4 Phasen implementiert.

**Backend (nächste Schritte):**

| Priorität | Was | Neue Endpoints |
|-----------|-----|----------------|
| **Hoch** | Config-API | `GET /api/projects/:id/config` |
| **Hoch** | Session-Logs | `GET /api/agent-sessions/:id/logs` |
| **Mittel** | Agent-Slot | `GET /api/agent-slots/status`, `POST /release` |
| **Mittel** | API-Zugang UI | Token-CRUD + Settings-Seite |
| **Niedrig** | Config-Editor | `PUT /api/projects/:id/config` + UI |

Das Backend funktioniert aktuell trotzdem, weil der MCP-Server bei allen neuen Endpoints graceful auf Defaults zurückfällt (404 = weiter wie bisher).
