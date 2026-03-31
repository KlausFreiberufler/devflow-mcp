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
<!-- DEVFLOW-RULES-END -->




