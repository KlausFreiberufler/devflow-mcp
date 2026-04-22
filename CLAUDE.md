<!-- DEVFLOW-RULES-START -->
# DevFlow - Strukturierte KI-Entwicklung

**Projekt:** DevFlow Project

Dieses Projekt nutzt DevFlow fuer strukturierte, nachvollziehbare KI-Entwicklung.
Alle Regeln werden technisch vom MCP-Server erzwungen.

## Arbeitsstart

BEVOR du mit der Arbeit beginnst:

1. `flow_list()` → Finde einen freien Flow
2. `devflow_init({ flowId: "<id>" })` → Starte deine Session
   ODER
3. `flow_create({ summary: "..." })` → Erstelle einen neuen Flow

**Ohne `devflow_init` sind alle Tools blockiert.**

## Prozess

Der Server gibt dir bei jedem Schritt Anweisungen:
- **allowedActions** → welche Tools du nutzen darfst
- **nextStep** → was du als naechstes tun sollst

Folge den Anweisungen aus den Tool-Responses. Erlaubte Aktionen haengen vom
Flow-State ab und werden vom Server erzwungen.

## Flow-States

```
idea → planning → approval → ready → in_progress → review → done
```

Review-States (approval, review) sind Wartezustaende.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.

## Regeln (Strictness-Level)

### Flow-Pflicht: ⚖️ Balanced
Erstelle einen Flow bevor du arbeitest.

### Planungs-Pflicht: ⚖️ Balanced
Erstelle einen Plan, warte aber nicht zwingend auf Approval.

### Task-Tracking: ⚖️ Balanced
Erstelle Tasks und update ihren Status waehrend der Arbeit.

### Git-Disziplin: ⚖️ Balanced
Halte Branch-Naming und Commit-Format ein.

### Review-Pflicht: ⚖️ Balanced
Mache Self-Review (Diff pruefen, Findings fixen).

### Docs-Update: 🏖️ Chill
Pruefe relevante Docs und aktualisiere sie bei Bedarf.

### Knowledge-Pflicht (MCP-First)

Die DevFlow-Wissensdatenbank (ADRs / Patterns / Runbooks / Lessons Learned) wird
ueber MCP-Tools gepflegt, NICHT ueber Backend-LLM-Aufrufe. Du bist die Intelligenz.

**Regeln:**

1. Nach jedem `flow_update`, der einen Flow auf `done` setzt, enthaelt die
   Response `suggestedNextTool`. Du MUSST diesen Hinweis befolgen und
   `knowledge_harvest({ flowId })` aufrufen.

2. `knowledge_harvest` liefert den Flow, bestehende ADRs und Related-Drafts.
   Entscheide basierend darauf:
   - Wenn das Thema schon durch einen ADR abgedeckt ist: skip.
   - Wenn schon ein Draft fuer diesen Flow existiert: skip.
   - Sonst: Entscheide, ob ADR / Pattern / Runbook / Lessons-Learned passt, und
     rufe `knowledge_draft_create` mit sinnvollem Titel + Body.

3. Vor kritischen `flow_update`-Transitions (z.B. `in_progress → review`) rufe
   `knowledge_check_flow({ flowId })` auf, wenn der Flow architektonische
   Entscheidungen enthaelt. Das liefert dir Drift- und Missing-Hinweise.

4. Fuer Projekt-weite Backfills: `knowledge_backfill_request({ projectId })`
   liefert alle done-Flows + Kontext. Klassifiziere, gruppiere, rufe
   `knowledge_draft_create` fuer jeden Draft.

**Dedup ist automatisch** — wiederholtes `knowledge_draft_create` mit gleichem
(projectId, draftType, title) mergt `sourceFlowIds` statt zu duplizieren.

**Sei konservativ.** Wenige hochwertige Drafts sind besser als viele laute.
<!-- DEVFLOW-RULES-END -->




