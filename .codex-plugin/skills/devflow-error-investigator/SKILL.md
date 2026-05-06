---
name: devflow-error-investigator
description: Use FIRST when you encounter an unexpected error / exception / failing test that's not immediately obvious. Calls `error_context_get` to pull all wiki signals relevant to the error (runbooks, ADRs touching the file, recent flows, patterns, similar past errors). Iron Law of compounding wikis: every novel failure mode produces a new runbook on the way out.
flow_state: any
hooks: [4]
discipline_token: devflow-error-investigator
ported_from: NEW (DF-316)
iron_laws:
  - No novel error is investigated without a wiki-lookup first. The wiki has likely seen something similar.
  - If no runbook matches AND the fix takes more than 10 minutes, write a runbook on the way out (compounding).
  - Match-but-don't-blindly-apply — every runbook hit gets a "does this still apply?" verdict before action.
---

# Skill: devflow-error-investigator

> **Pre-mortem with the wiki.** Companion to `devflow-debugging`. While debugging walks the 4 phases (Investigation → Pattern → Hypothesis → Fix), this skill is the first move on the wiki side: pull every signal the project has accumulated about errors in this area before forming hypotheses.

## When to use

- Unexpected exception, failing test, prod incident, "something broke that worked yesterday".
- Triggered FIRST, before `devflow-debugging` Hook 3 (Pattern phase).

## Process

### 1. Call `error_context_get`

```ts
error_context_get({
  errorMessage: "<concise error string>",
  filePath: "<file where it occurred, if known>",
  // stackTrace + recentCommits optional
})
```

Returns six buckets: matchingRunbooks, affectedAdrs, recentFlowsInArea, warningPatterns, similarPastErrors, briefing.

### 2. Triage the response

For each bucket, decide:

- **matchingRunbooks** — read each. Apply if it still describes the situation. Iron Law: never blindly apply — always verify the runbook is still current (Hook 4 + DF-312 stale-detection).
- **affectedAdrs** — these are decisions that explicitly cover this file. The error might be an ADR violation. Read each.
- **recentFlowsInArea** — recent commits touched this file. Read their `agentSummary` for clues.
- **warningPatterns** — cross-cutting patterns that mention similar tags or terms. Often the most informative.
- **similarPastErrors** — done-flows whose summary mentions the same error string. The fix is probably already there.

### 3. Verdict

- **Matched & applicable** — apply the existing knowledge, ship the fix. Note the wiki entry in your `agentSummary`.
- **Matched but stale** — the wiki entry is outdated. Use `knowledge_check_resolve({ resolutionType: 'extend' })` to update it as part of the fix.
- **No match** — this is a novel failure mode. Investigate freely, but ON THE WAY OUT, write a runbook (`knowledge_check_resolve({ resolutionType: 'runbook' })` with the fix-recipe). Compounding!

### 4. Emit the discipline-token

```ts
devflow_token_emit({
  flowId,
  skillName: 'devflow-error-investigator',
  evidence: {
    error: { message, filePath },
    matched: { runbooks: number, adrs: number, flows: number, patterns: number, pastErrors: number },
    verdict: 'matched_applicable' | 'matched_stale_extended' | 'novel_runbook_written',
    fixDuration: '<minutes>',
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

Three antipatterns this skill prevents:

1. **Solo debugging from scratch** — agent investigates an error by gut, even though the project has resolved the same error 3 times before. Wiki forgotten.
2. **Stale-runbook trust** — agent finds a runbook from 6 months ago, applies it blindly, but the codebase has moved on. Without the "still applicable?" check, fix breaks again.
3. **Lost knowledge after fix** — agent fixes a novel error but never writes a runbook. Next agent investigates the same thing from scratch.

## Cross-references

- `devflow-debugging` — sister skill. Run this FIRST (wiki lookup), then debugging-skill walks the actual 4-phase investigation.
- DF-316 introduced the `error_context_get` MCP tool + `error-context` endpoint that drives this skill.
- DF-312 `wiki-lint` flags stale runbooks — keep the wiki honest.
- Iron Law cross-ref: never `dismiss`, always `extend` (see `devflow-knowledge-completer`).
