---
name: devflow-idea-curator
description: Use periodically (monthly cadence is plenty) to curate the project's idea backlog. Reads `GET /api/projects/:id/ideas` — five sources of organic ideas (intents, stale, orphans, contradictions, hotspots). For each item: pick & plan into a flow, defer with a substantive horizon, or reject with a reason. Iron Law: no idea sits unaddressed for more than 90 days.
flow_state: any
hooks: []
discipline_token: devflow-idea-curator
optional: true
ported_from: NEW (DF-315)
iron_laws:
  - Every idea older than 90 days gets a verdict — pick&plan, defer with horizon, or reject. Idle backlog is dead backlog.
  - Hotspot topics (3+ resolutions) deserve a strategic-review flow, not silent acceptance. The repetition is the signal.
  - Contradictions are debt, not noise — each one needs a real fix (citing source updated, or ADR brought back to accepted).
---

# Skill: devflow-idea-curator

> **Active idea-pipeline guardian.** The wiki is full of organic ideas: deferred intents, stale decisions, orphan patterns, contradictions, hotspots. Without periodic curation they pile up as dead weight. This skill walks the backlog deliberately.

## When to use

- Once a month for an active project, once a quarter for a slow one.
- After a phase / milestone close — to identify what to take on next.
- Anytime `wiki-lint` shows a non-zero LintHealthBar.

## Process

### 1. Pull the backlog

```ts
GET /api/projects/:id/ideas
```

Returns five buckets: `openIntents`, `staleAdrs`, `orphanPages`, `contradictions`, `hotspotTopics`. Each item has a `prefilledSummary` + `prefilledDescription` ready for `Pick & Plan`.

### 2. Walk each bucket — verdict per item

For every item in every bucket, decide one of:

- **Pick & Plan** — promote to a real flow now. Click the button in the UI (or `flow_create({ summary: <prefilledSummary>, description: <prefilledDescription> })` directly). The flow inherits the curated text.

- **Defer** — re-affirm as intent, with a fresh horizon (`next-quarter`, `later`). For an existing intent, this means updating its `frontmatter.horizon`. For a stale ADR, re-extend with a "deferred review" note.

- **Reject** — explicit verdict that this idea is no longer needed. Mark the entry's `lifecycle_stage` as `deprecated` (for ADRs / patterns) or update intent frontmatter to `status: 'rejected'`. Always include a 1-line `rationale`. Iron Law: rejection without rationale is forbidden — the next agent will trip on the same idea.

### 3. Special cases per bucket

- **Stale decisions** — re-read the ADR. If still factually correct → `extend` with a dated re-verification note. This bumps `updated_at` and acknowledges the review. If partially out of date → `extend` with corrections. If obsolete → supersede with a new ADR.

- **Orphan pages** — entry has zero in/out wiki-links. Either: (a) cross-link from a related entry via `extend`, or (b) re-classify as `intent` (`document_type='intent'`, `lifecycle_stage='idea'`). Never just delete — the entry contains effort that future flows can build on.

- **Contradictions** — deprecated ADR is still cited by newer sources. Inspect: if citation is by mistake, update the citing source. If deliberate (legacy code still depends on it), bring the ADR back to `accepted` with a scope note.

- **Hotspots** — topic resolved across 3+ flows is a strategic signal. Open a `Strategic review: "<topic>" cluster` flow that consolidates the implicit pattern into an explicit ADR or pattern doc.

### 4. Emit the discipline-token

```ts
devflow_token_emit({
  flowId: <currentFlowId>,
  skillName: 'devflow-idea-curator',
  evidence: {
    initial: { intents, stale, orphans, contradictions, hotspots },
    verdicts: [{ kind, id, action: 'pick_plan'|'defer'|'reject', flowRef?, rationale? }],
    final: { intents, stale, orphans, contradictions, hotspots },
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

Three patterns this skill prevents:

1. **Idle intents** — a flow defers a topic, the topic sits forever, the next flow defers it again. Compounds nothing.
2. **Stale-as-canonical** — a 6-month-old ADR is still cited as if it's current. Curation forces a re-verification stamp.
3. **Hotspot blindness** — the same topic gets resolved 5× across flows but no one zooms out. Curation surfaces the pattern.

## Cross-references

- DF-315 introduced the `/api/projects/:id/ideas` endpoint that drives this skill.
- DF-310 introduced `extend` resolutionType used in step 3.
- `devflow-wiki-lint` is the read-only view of the same lint signals; this skill is the action-side.
