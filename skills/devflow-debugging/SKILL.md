---
name: devflow-debugging
description: Use when an unexpected behavior, failing test, or production-error needs to be diagnosed. Walks through four phases — Investigation → Pattern → Hypothesis → Fix — with an explicit Knowledge-Hook 4 runbook-match before the Hypothesis phase to avoid double-debugging known incidents.
flow_state: in_progress
hooks: [4]
discipline_token: devflow-debugging
ported_from: superpowers:systematic-debugging
iron_laws:
  - Reproduce the bug *before* hypothesizing — never debug what you cannot trigger.
  - Hypothesize *before* fixing — random edits with green tests is luck, not debugging.
  - Document what worked and what didn't — every failed hypothesis is data, not waste.
---

# Skill: devflow-debugging

> **Iron-Law port** of Superpowers `systematic-debugging`. The four phases are non-negotiable; skipping ahead leaves untested assumptions in the code base.

## When to use

Use this skill in `in_progress` state whenever:
- A test fails unexpectedly (not the planned RED of `devflow-tdd`).
- Behavior on staging/prod doesn't match the spec or the test-suite.
- A reviewer flags a regression you can't immediately explain.

Skip when: the failure is the *expected* RED of a TDD cycle — that belongs to `devflow-tdd`.

## Process

### 1 · Investigation

Capture the bug surface area before forming any opinion:

- **What was observed?** Exact error message, stack-trace, screenshot, or test output.
- **What was expected?** Acceptance-criterion or contract that says it should be different.
- **Reproduction recipe?** Commands or steps that trigger the bug deterministically.
- **First time? Or regression?** Check git-blame on the suspected file; check the changelog.

If you cannot reproduce on demand: **stop**. Make reproduction work first — without it the next phases are guesswork.

### 2 · Pattern

Look for shape-matches in what you've seen before:

- **Have I (or another flow) seen this stack-trace?** Search the project's flows + agent-logs.
- **Does the error message match a known runbook?** → **Hook 4** (next section).
- **Does the failure mode (race, off-by-one, encoding, auth) suggest a class of bugs?**

### Hook 4 · Runbook Match (BEFORE Hypothesis)

```
GET /api/wiki/search?q=<error-message>&types=doc_page&document_type=runbook
```

Equivalent MCP: `wiki_search({ q: errorMessage, types: ['doc_page'], document_type: 'runbook' })`.

If a runbook matches:

- **Read it through.** Symptoms, diagnosis, fix-steps.
- If the fix-steps clearly apply → **skip to Phase 4 (Fix)** with a wiki-link `[[runbook:<slug>]]` in your commit message. Don't re-derive what the runbook already documents.
- If the runbook is *related but not exact* → cite it in the discipline-token evidence as a partial match and continue to Phase 3.

If no runbook matches → continue to Phase 3.

### 3 · Hypothesis

Now that you've reproduced and pattern-matched, form a single concrete hypothesis:

> "X causes the bug because Y. I will verify by Z."

Phrase it so it can be **falsified**. Vague hypotheses ("something with the cache") are not testable.

If multiple plausible causes exist, list them — but commit to verifying ONE at a time.

### 4 · Fix

- **Reproduce again** to baseline-confirm the bug still happens after Phase 1-3 (especially after any temporary instrumentation).
- Apply the smallest change that the hypothesis predicts will fix it.
- Re-run the reproduction recipe — confirm it now passes.
- Run the broader test-suite — confirm no regression.
- **If the fix didn't work:** log what you changed and what you observed. The hypothesis was wrong; return to Phase 3 with new evidence. Never just "try something else" without updating the hypothesis.

After a successful fix:
- Consider if the bug was generalizable enough to deserve a new runbook — if so, capture via `knowledge_harvest` (Hook 7).
- Add a regression test (`devflow-tdd` discipline still applies — RED proving the bug, GREEN after fix).

## Iron Laws

> **Reproduce the bug before hypothesizing — never debug what you cannot trigger.**
>
> **Hypothesize before fixing — random edits with green tests is luck, not debugging.**
>
> **Document what worked and what didn't — every failed hypothesis is data, not waste.**

## Output contract

When the bug is fixed and the regression test is green, optionally emit a discipline-token:

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-debugging",
  "evidence": {
    "reproductionRecipe": "<command or steps>",
    "runbookMatched": "<slug or null>",
    "hypothesis": "<the hypothesis that turned out correct>",
    "rejectedHypotheses": ["..."],
    "fixCommit": "<sha>",
    "regressionTest": "<test-file>:<test-name>"
  }
}
```

The token is optional today (DF-293 doesn't list it as required for any pipeline-step). Future projects may opt in.

## Related

- [[kn-hook-4-runbook-match]] — design doc
- [[migration-test-strategy]] — Säule A
- [[knowledge-gated-workflow]] — sub-flow inside Stage 9 (Bug-Branch from TDD)
- DF-293 — port flow (this implementation)
- DF-289 — discipline-tokens foundation
- Superpowers v5.0.7 — `systematic-debugging` (original skill)
