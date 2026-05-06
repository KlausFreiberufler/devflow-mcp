---
name: devflow-pattern-reuse
description: Use during the planning state to surface existing project patterns that match the flow's tag-scope, so the implementation plan re-uses proven solutions instead of inventing parallel ones. Cites each accepted pattern via `[[pattern:slug]]` wiki-link in the plan.
flow_state: planning
hooks: [2]
discipline_token: devflow-pattern-reuse
ported_from: NEW (DF-299)
iron_laws:
  - Prefer existing pattern over inventing a parallel solution.
  - Cite the pattern via wiki-link so reviewers + future-you can trace the choice.
  - When rejecting a pattern, document the reason — "doesn't fit" without specifics is not a reason.
---

# Skill: devflow-pattern-reuse

> **Knowledge-Hook 2 implementation.** Sister-skill to [[devflow-collision-acknowledged]] (Hook 1) and [[devflow-tdd]] (Hook 3): together they make sure the planning phase is informed by everything the project already knows.

## When to use

Use during `planning` state, **after** the awareness-list walk (Hook 1) but **before** submitting the plan to approval. Hook 1 covers the topic-scope (what's in flight, what's deferred). Hook 2 covers the solution-scope (which patterns already address shapes of this problem).

Skip when: the flow has no tags / scope is fully novel / no patterns exist yet in the project (then this becomes a Hook 7 candidate post-done — capture *new* patterns into the wiki).

## Process

### 1 · Pull existing patterns

**Preferred (DF-310):** call `wiki_get_briefing({flowId})` — returns related ADRs, patterns, runbooks AND the briefing-Markdown automatically scoped to this flow's tags. The agent doesn't have to assemble it manually.

**Fallback (manual scope query):** for each tag the flow carries, query:

```
GET /api/projects/:projectId/docs?documentType=pattern&tag=<tag>
```

Equivalent MCP: `doc_page_list({ projectId, document_type: 'pattern', tags: ['<tag>'] })`.

Aggregate results across all tags. Deduplicate by page-id.

### 2 · Triage suggestions

For each pattern: read its `problem`, `solution`, `when_to_use` frontmatter / first paragraph. Classify into:

- **strong-match** → the pattern's `when_to_use` describes this exact flow's problem. Use it.
- **partial-match** → applicable to part of the flow. Reference for the relevant section only.
- **anti-pattern** → the pattern explicitly warns against the path you were considering. Course-correct.
- **not-applicable** → mention nothing happens, but document `reason` in your plan-decision log so the next person knows you considered + rejected it.

### 3 · Cite in the plan

For every accepted pattern, write a wiki-link in the relevant plan-section:

```markdown
## Plan

### Auth flow

We add a JWT-with-refresh-token flow following [[pattern:jwt-auth-with-rotation]] —
this addresses the rotation-on-stale concern without re-deriving the token-rotation logic.
```

For partial matches, scope the citation to the section it applies to.

### 4 · Optional: emit discipline-token

If your project gates `planning → approval` on `agent_with_discipline` and lists `devflow-pattern-reuse` in `pipeline_steps.required_skills`:

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-pattern-reuse",
  "evidence": {
    "tagScope": [...],
    "patternsConsidered": [{ slug, decision: 'used'|'partial'|'rejected', reason? }],
    "completedAt": "<iso>"
  }
}
```

Default projects don't list this skill as required — Hook 2 is **advisory** for most flows. The token mechanism is here for projects that want to enforce it.

## Iron Laws

> **Prefer existing pattern over inventing a parallel solution.**
>
> **Cite the pattern via wiki-link so reviewers + future-you can trace the choice.**
>
> **When rejecting a pattern, document the reason — "doesn't fit" without specifics is not a reason.**

## How this differs from Hook 3 (Test-Patterns)

- **Hook 3** narrows to `tag=testing` and runs at the start of each TDD-cycle (RED-phase). It's about test-skeleton consistency.
- **Hook 2** is broader: any tag, runs once at planning-start. It's about solution re-use across the project's whole pattern library.

Both queries hit the same endpoint with different filters — they're sister-mechanisms, not duplicates.

## Output contract

- Plan-markdown contains `[[pattern:<slug>]]` for every accepted pattern.
- Optional: `flow_discipline_tokens` row with `skill_name='devflow-pattern-reuse'` valid 1h.

## Related

- [[kn-hook-2-pattern-reuse]] — design doc
- [[kn-hook-1-awareness]] — Sister-Hook (covers the topic-scope, this one the solution-scope)
- [[kn-hook-3-test-patterns]] — narrower variant for tests
- [[migration-test-strategy]] — Säule A
- [[knowledge-gated-workflow]] — Stage 3 in the visual diagram
- DF-299 — port flow (this implementation)
- DF-289 — discipline-tokens foundation
- DF-291 — added `?documentType` + `?tag` filter to `GET /docs`
