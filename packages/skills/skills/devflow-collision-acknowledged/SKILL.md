---
name: devflow-collision-acknowledged
description: Use during planning state to walk the user through the awareness list (pending_work + planning_context) so every in-flight flow, open intent, proposed ADR, and pending draft in the topic-scope receives an explicit user decision (✓ keep / ✗ irrelevant / ↺ later). Emits a discipline-token at the end as proof for agent_with_discipline self-approval.
flow_state: planning
hooks: [1]
discipline_token: devflow-collision-acknowledged
ported_from: NEW (DF-289)
iron_laws:
  - No silent injection — every awareness item gets a user decision.
---

# Skill: devflow-collision-acknowledged

> **Knowledge-Hook 1 implementation.** This skill is the gatekeeper for `planning → approval` under the upcoming `agent_with_discipline` policy. It guarantees that nothing in the topic-scope was forgotten or silently overridden.

## When to use

Trigger this skill once per planning session, **after** the implementation plan has been drafted but **before** submitting to approval. It complements `devflow-planning` (brainstorming + plan-writing) — this skill makes sure the plan acknowledges everything the project already knows about the scope.

## Process

### 1. Pull the awareness list

Call `pending_work({ tags, paths, excludeFlowId: <currentFlowId> })` — the four buckets:

- **proposed ADRs** — proposed status, tag-overlap with the current flow
- **open intents** — DF-265 forward-intents that haven't been resolved yet
- **in-flight flows** — flows in planning / in_progress / review with shared scope
- **pending drafts** — knowledge-drafts auto-extracted by harvest

Also call `planning_context({ flowId })` for the related-ADRs, parallel-flows, and architecture-module excerpts.

### 2. Present items to the user

Render the four buckets as a checklist. **Never auto-accept.** For each item, the user decides:

- **✓ keep** → Pick a `resolutionType`:
  - `extend` (DF-310, **preferred**) if a related entry already exists and this flow refines it. Pass `entityType + entityId + body + rationale`. Backend appends a dated update section.
  - `adr` / `pattern` / `runbook` if the item already covers the topic. Pass the entity id. Hook 1 will inject `[[DisplayName]]` into the implementation plan and create a `knowledge_links` edge automatically.
  - `intent_defer` if the item is real but out of scope here — provide a `horizon` (`next-sprint`, `next-quarter`, `eventually`) and an optional reason.
- **✗ irrelevant** → ⚠ Iron Law (DF-310): **never `dismiss`** without first checking if this is a recurring false-positive. If the topic-detection misfires repeatedly (e.g. `invalidation` in a non-cache project), `extend` an existing convention page with a one-line note instead — that auto-resolves future flows via DF-314 project-conventions.
- **↺ later** → equivalent to `intent_defer` with no specific decision yet.

> **DF-314 Auto-Resolve note:** if a topic was resolved 3+ times in this project via the same pattern, the gate auto-applies the convention silently — you might never see it in the awareness list. That's the system working.

Use `POST /api/flows/:id/knowledge-resolutions` (MCP: `knowledge_check_resolve`) for each decision.

### 3. Verify completeness

Before emitting the discipline-token, confirm every awareness item has a corresponding resolution row. Use `GET /api/flows/:id/knowledge-resolutions` to compare against the original list. If any item lacks a decision, **stop and ask the user** — do not emit a token for an incomplete walkthrough.

### 4. Emit the discipline-token

Once every item has a decision:

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-collision-acknowledged",
  "evidence": {
    "buckets": { "adrs": <n>, "intents": <n>, "flows": <n>, "drafts": <n> },
    "decisions": { "kept": <n>, "dismissed": <n>, "deferred": <n> },
    "completedAt": "<iso>"
  }
}
```

The signed token is returned **once**. Store it in the agent's session memory; it will be passed to `flow_update` when transitioning `planning → approval` under `agent_with_discipline`.

## Iron Law

> Every awareness item gets an explicit user decision before this skill emits a token.

Violation → no token → the gate-check refuses `planning → approval` (under `agent_with_discipline`). Default `human_only` mode is unaffected — the user always retains the manual approval path in the DevFlow UI.

## Output contract

- All resolutions persisted in `flow_knowledge_resolutions` with `created_by` audit.
- Plan markdown updated by Hook 1 side-effect (no manual editing required).
- Knowledge-graph edges visible immediately (`source_field = 'knowledge_resolutions'`, `kind = 'wikilink'`).
- One `flow_discipline_tokens` row per skill-run, valid for 1 hour.

## Related

- [[kn-hook-1-awareness]] — design doc
- [[migration-test-strategy]] — Säule A test triade for this skill
- [[knowledge-gated-workflow]] — Stage 2 in the visual diagram
- DF-289 — backend implementation flow
- DF-264 — flow_knowledge_resolutions table (foundation)
- DF-269 — `pending_work` and `planning_context` MCP tools
