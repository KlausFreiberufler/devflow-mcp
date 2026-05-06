---
name: devflow-tdd
description: Use during implementation to drive every change through Test-Driven Development. Before writing production code, query existing test-patterns from the LLM-Wiki (Hook 3) for the relevant tag-scope, then write a failing test (RED), make it pass (GREEN), and refactor (REFACTOR). Emits a discipline-token only when each cycle has the prescribed evidence.
flow_state: in_progress
hooks: [3]
discipline_token: devflow-tdd
ported_from: superpowers:test-driven-development
iron_laws:
  - No production code without a failing test first.
  - REFACTOR happens only after GREEN.
  - One concern per RED-GREEN-REFACTOR cycle.
---

# Skill: devflow-tdd

> **Iron Law port** of Superpowers `test-driven-development`. The cycle is non-negotiable; this skill refuses to emit a token if any of the three iron laws were broken.

## When to use

Use this skill in `in_progress` state for **every** code change that introduces or modifies behavior. Pure refactors that change nothing observable are exempt; everything else goes through RED → GREEN → REFACTOR.

## Process

### 0 · Pull existing test-patterns (Hook 3)

Before writing the first test, query the LLM-Wiki for reusable test-pattern doc-pages tagged `testing`:

```
GET /api/projects/:projectId/docs?document_type=pattern&tag=testing
```

(equivalent MCP call: `doc_page_list({ projectId, document_type: 'pattern', tags: ['testing'] })`)

Cite each pattern that applies via wiki-link in the test file's leading comment, e.g.:

```ts
// Follows [[pattern:vitest-api-test-pattern]] — createApiClient + describe/it + cleanup
```

This keeps test conventions consistent across flows and surfaces the patterns in the Knowledge-Graph for future readers.

### 1 · RED — failing test first

- Write a single test that captures **one** behavioral expectation.
- Run the test suite. **Confirm the new test fails for the expected reason** (not a syntax error, not a missing import — the *actual* assertion).
- Capture the failure output.

### 2 · GREEN — minimum production code

- Add the smallest amount of production code that makes the new test pass.
- Re-run the suite. Confirm:
  - The new test now passes.
  - No previously-passing test broke.

### 3 · REFACTOR — only after GREEN

- Clean up the code (rename, dedupe, extract). Tests stay green throughout.
- Re-run the suite after every non-trivial refactor — never skip the safety check.

### 4 · Commit & repeat

- One commit per RED → GREEN → REFACTOR cycle (or grouped semantically when the cycles are tightly coupled).
- Then move to the next acceptance-criterion / task. Begin a fresh cycle at step 1.

## Iron Laws

> **No production code without a failing test first.**
>
> **REFACTOR happens only after GREEN.**
>
> **One concern per RED-GREEN-REFACTOR cycle.**

If you wrote production code first, **delete the production code, write the test, watch it fail, then write the production code again.** No shortcuts.

## Output contract

After completing all cycles for the current task:

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-tdd",
  "evidence": {
    "cycles": [
      { "task": "<acceptance-criterion>", "redOutput": "<truncated stderr>", "greenOutput": "<truncated stdout>", "refactored": true|false }
    ],
    "patternsCited": ["pattern:<slug>", ...],
    "completedAt": "<iso>"
  }
}
```

The signed token is returned **once**. Future review→done check (DF-292) will verify the token is present + non-expired before granting `agent_with_discipline` self-approval.

## What this skill is NOT

- Not a replacement for `devflow-debugging` — when an existing test fails unexpectedly, switch to systematic-debugging (4 phases).
- Not a license to write tests of every implementation detail — the test should capture the **behavior**, not lock in internals.
- Not for documentation-only changes — those go straight to commit.

## Related

- [[kn-hook-3-test-patterns]] — design doc
- [[migration-test-strategy]] — Säule A (skill triade) + Säule B (hook integration)
- [[knowledge-gated-workflow]] — Stage 9 in the visual diagram
- DF-291 — port flow (this implementation)
- DF-289 — discipline-tokens foundation
- Superpowers v5.0.7 — `test-driven-development` (original skill)
