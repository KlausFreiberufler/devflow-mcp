---
name: devflow-wiki-lint
description: Use periodically (or on demand from the Wiki page health-bar) to keep the LLM-Wiki clean. Reads `GET /api/projects/:id/wiki-lint` and addresses every reported stale, orphan, and contradiction — never let any of them linger. Iron Law: orphans get cross-linked or marked as `intent`, contradictions are resolved at the ADR-status level, stale entries are reviewed and either extended or superseded.
flow_state: any
hooks: []
discipline_token: devflow-wiki-lint
optional: true
ported_from: NEW (DF-312)
iron_laws:
  - Every orphan must either gain a cross-link or be re-classified as `intent` (lifecycle_stage='idea'). Orphans never just sit.
  - Every contradiction (deprecated/superseded ADR with newer citing sources) gets resolved — either the citing source is updated, or the ADR is brought back to `accepted`.
  - Every stale `release` entry (>90 days no edit, still referenced) gets a review verdict: `extend` with a fresh update, supersede with a newer ADR/Pattern, or move to `deprecated`.
---

# Skill: devflow-wiki-lint

> **Wiki health guarantor.** The LLM-Wiki is a compounding artifact only when it stays clean. Without periodic linting, orphans accumulate, contradictions silently rot, and stale entries get cited as if they were current. This skill addresses each finding deliberately.

## When to use

- The Wiki page (`/projects/:id/wiki`) shows non-zero counts in the LintHealthBar.
- Periodically — once a month is plenty for a small project, weekly for an active one.
- Before a Phase / quarter close — make sure nothing rots over a longer break.

## Process

### 1. Pull the lint report

```ts
GET /api/projects/:id/wiki-lint
```

Returns `{ staleAdrs[], orphanPages[], contradictions[], config }`.

### 2. Address each orphan

For every entry in `orphanPages`:

- Read the entry. Does it document something that exists in code or in another doc?
  - **Yes** → call `knowledge_check_resolve({ resolutionType: 'extend', entityType: '<adr|pattern|runbook>', entityId: <thatRelatedEntry>, body: 'See also: [[<this-entry-title>]]', rationale: 'Cross-linking orphan' })` to forge an incoming link from a relevant entry.
  - **No** → re-classify as `intent` (`doc_page_update({ documentType: 'intent', lifecycleStage: 'idea' })`) so it appears in the forward-intents stream and a future flow can resolve it.

Never delete the orphan. The wiki is a compounding artifact — the entry contains effort that future flows can build on.

### 3. Address each contradiction

For every entry in `contradictions`:

- Inspect the citing sources. Were they written *intentionally* against the deprecated/superseded ADR?
  - **They cite the deprecated ADR by mistake** → update the citing source (extend with a note pointing at the current ADR, or remove the wikilink if irrelevant).
  - **They cite it deliberately** (e.g. legacy-handling code that still depends on the old approach) → the ADR is not really retired. Consider `adr_update_status({ status: 'accepted' })` and add a note in the ADR explaining the legacy scope.

### 4. Address each stale entry

For every entry in `staleAdrs`:

- Re-read the entry. Is it still factually correct?
  - **Yes, still current** → `extend` with a one-line update note (timestamp + `## Update YYYY-MM-DD — re-verified by <flowRef>`). This bumps `updated_at` and acknowledges the review.
  - **No, partially out of date** → `extend` with the new information / corrections.
  - **No, fully obsolete** → supersede with a new ADR (`adr_update_status({ status: 'superseded' })` after creating the replacement).

### 5. Re-run + emit token

```ts
GET /api/projects/:id/wiki-lint
```

Verify counts are zero (or only intentional remainders with notes). Then:

```ts
devflow_token_emit({
  flowId,
  skillName: 'devflow-wiki-lint',
  evidence: {
    initial: { stale: number, orphan: number, contradictions: number },
    addressed: [{ kind, id, action: 'extend'|'reclassify-intent'|'supersede'|'deprecate'|'cite-fix' }],
    final: { stale: number, orphan: number, contradictions: number },
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

Three slow-moving failure modes the wiki accumulates without periodic linting:

1. **Orphan accumulation.** Patterns get extracted from flows but never linked anywhere. Over time the graph fragments.
2. **Silent contradictions.** An ADR is superseded but other ADRs / flows still cite it. The next agent reading the citing source picks up the deprecated decision without warning.
3. **Stale-as-canonical.** A pattern was correct 6 months ago. The codebase moved. The pattern is still cited by new flows because nothing flagged it. Adding a single dated update keeps it honest.

## Cross-references

- `devflow-knowledge-completer` — handles the `extend` writes that this skill triggers.
- DF-310 introduced the `extend` resolution type used in step 2 + 4.
- DF-312 introduced the `wiki-lint` endpoint that drives this skill.
