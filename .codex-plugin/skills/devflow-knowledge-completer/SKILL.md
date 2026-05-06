---
name: devflow-knowledge-completer
description: Use during planning, before submitting to approval, and again before review→done. Walks the gaps from `wiki-context` and ensures each gap is closed with `extend` (preferred), a new entry, or a deferred intent — never `dismiss`. The wiki is a compounding artifact: knowledge is never thrown away.
flow_state: [planning, in_progress, review]
hooks: [1, 7]
discipline_token: devflow-knowledge-completer
ported_from: NEW (DF-310)
iron_laws:
  - Never `dismiss` a knowledge gap. Always `extend` an existing wiki entry, create a new one, or `intent_defer`.
  - Prefer `extend` over `create` whenever a related entry already exists — the wiki is a compounding artifact.
  - Tag every new wiki entry with the topic + the broader area (e.g. `auth/passkeys`) — multi-stage tags only.
---

# Skill: devflow-knowledge-completer

> **LLM-Wiki guarantor.** Pattern from Karpathy's *LLM-Wiki* and OmegaWiki. The wiki is not a side-effect of work — it is the work's compounding artifact. This skill ensures that every flow leaves the wiki at least as complete as it found it.

## When to use

- After `devflow-planning` and `devflow-collision-acknowledged`, **before** submitting plan to approval — so the plan cites the wiki.
- Again at `review → done` — so any knowledge unearthed during implementation is captured.

## Process

### 1. Pull the wiki context

```ts
GET /api/flows/:id/wiki-context
```

Returns `{ relatedAdrs, relatedDocs, parallelFlows, gaps, briefing }`. The `gaps` array is the list of topics that still have **no coverage** in the wiki.

### 2. For each gap — decide `extend` vs `create` vs `intent_defer`

For every gap topic, scan `relatedAdrs` and `relatedDocs` first. **Prefer `extend`** if a related entry exists:

- **`extend`** — a related ADR/pattern/runbook already exists; this flow uncovered something the entry should now mention. Pass `entityType + entityId + body` (the section to append) and `rationale` (1–2 sentences why). Backend appends `## Update YYYY-MM-DD — extended by DF-XXX` + body to the entry's content. Hook 1 also injects the wikilink into the plan.

- **`adr` / `pattern` / `runbook`** — no related entry exists; create a new one via `knowledge_check_resolve` orchestrator (`title + body + rationale`). Tag it with the topic AND the broader area (e.g. `["auth", "auth/passkeys"]`).

- **`intent_defer`** — the gap is real but genuinely out of scope. Provide `horizon` and a substantive `reason`. The intent will resurface in `pending_work` for a future flow.

**Never `dismiss`.** The `dismiss` resolution-type still exists for backwards compat but is forbidden by this skill — if the gap is irrelevant, it's because the topic-detection misfired, in which case the right move is to extend an existing entry with a one-line "this codebase does not use X" note (so the next flow doesn't trip on the same false positive).

### 3. Verify

Re-call `wiki-context`. The `gaps` array should be empty. If it isn't, repeat step 2 for the remaining topics.

### 4. Emit the discipline-token

```ts
devflow_token_emit({
  flowId,
  skillName: 'devflow-knowledge-completer',
  evidence: {
    gapsClosed: number,
    extends: [{ entityType, entityId, topic }],
    creates: [{ resolutionType, topic, entityId }],
    defers: [{ topic, horizon }],
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

Three antipatterns this skill prevents:

1. **`dismiss` graveyard** — `dismiss` resolutions accumulate without ever updating the wiki. The next flow runs into the same gap and dismisses it again. The wiki never grows.
2. **Duplicate entries** — instead of extending `ADR-027 — JWT vs Session`, the agent creates a new ADR for every variation. The wiki fragments instead of compounding.
3. **Plan without citations** — the plan does not cite any wiki entry, so reviewers cannot trace decisions back to prior context.

## Cross-references

- Hook 1 (`devflow-collision-acknowledged`) — handles awareness from `pending_work`.
- Hook 7 (knowledge harvest) — automatic post-`done` extraction; this skill is the manual companion before/after.
- DF-310 introduced `extend` as a first-class resolution type and the `wiki-context` endpoint that drives this skill.
