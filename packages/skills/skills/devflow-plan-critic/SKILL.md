---
name: devflow-plan-critic
description: Use during planning state, before submitting flow_update({currentState: 'approval'}), to deeply review the plan against 7 quality dimensions. The skill enforces a critic-persona — the agent steps out of "author" mode and into "reviewer" mode. Outputs a structured verdict (approved | minor_issues | needs_changes) with severity-tagged findings. Iron Law: a verdict is only valid if all 7 dimensions were explicitly checked.
flow_state: planning
hooks: [3]
discipline_token: devflow-plan-critic
ported_from: superpowers:critic-pattern (DevFlow-original)
iron_laws:
  - All 7 dimensions must be checked before emitting a verdict.
  - High-severity findings must include a concrete suggestion, not just a problem.
  - The critic must not invent acceptance criteria — only assess what's already in the plan.
  - Wiki-Coverage (dimension 4) must be backed by a real `wiki_get_briefing({flowId})` call — no bauchgefühl. extend > dismiss applies to every gap found.
  - Loop max 3 iterations. If 2 consecutive iterations have 0 high-findings → exit. If same finding appears twice unchanged → escalate.
  - Trivial flows (tasks ≤ 2 AND no schema-change AND no migration) MAY skip with verdict='approved-trivial'.
---

# Skill: devflow-plan-critic

> **Purpose:** Deep self-critique of a plan before transitioning `planning → approval`. The agent puts on the reviewer-hat and challenges its own work against 7 quality dimensions.

## When to use

Invoke this skill **before** calling `flow_update({currentState: 'approval'})`. The pre-tool-use hook prints a reminder, but the responsibility is on the agent: a plan submitted without critique is a plan submitted blind.

## The 7 Dimensions

For each dimension, the critic answers a focused question and reports findings.

### 1. AC-Coverage

> Does every Acceptance Criterion have at least one task that addresses it?
> Do tasks cover all ACs (no orphan tasks, no orphan ACs)?

**Common failures:**
- AC mentions a behavior but no task implements it ("user can edit X" → no UI task)
- Task exists for a sub-behavior not explicitly captured in any AC
- Acceptance Criterion is too vague to test ("should work well")

### 2. Task-Granularity

> Is each task atomic and fits in less than a day's effort?
> Can each task be reviewed independently?

**Common failures:**
- "Implement feature X" — too coarse, should split into 3-5 tasks
- "Write tests" — too vague, should split into unit + integration + e2e
- One task touches >5 files in unrelated areas — likely needs splitting

### 3. Edge Cases

> What happens at the boundaries? Empty input, concurrency, permissions, pre-existing state?

**Common failures:**
- No mention of empty/null/zero inputs
- Race conditions ignored (multi-user, multi-tab)
- Permission edge unstated ("user can do X" → who specifically? what role?)
- Migration/upgrade path for existing data missing

### 4. Wiki-Coverage

> Are the relevant ADRs, patterns, and runbooks referenced in the plan?
> Does the plan drift from existing decisions?

**Common failures:**
- Plan introduces a pattern that contradicts an accepted ADR
- Plan reinvents something already documented as a pattern
- Plan affects an area that has runbooks, but doesn't reference them
- Plan extends behavior covered by an existing ADR but doesn't propose an ADR-update

### 5. Past-Flow-Anchor

> Are there similar past flows? Is the plan anchored on what worked there?

**Common failures:**
- Similar flow DF-X was completed last month — plan ignores its lessons
- Pattern emerged in 3+ past flows — plan doesn't reuse it (violates `devflow-pattern-reuse`)
- Past flow's actual_hours/tokens 5× the estimate — plan repeats the same scope at the same estimate

### 6. Architecture-Risks

> Schema migrations? Cross-project impact? Backward compatibility? Security?

**Common failures:**
- Schema change without migration strategy
- Cross-project ripple (e.g. this changes `devflow-mcp` shape, but no plan for plugin/UI updates)
- Breaking change without deprecation period
- New endpoint/route without auth/permission consideration

### 7. Test-Strategy

> Are TDD paths planned? Which tests would prove the AC?

**Common failures:**
- "Write tests" without naming the testing levels (unit / integration / e2e)
- Critical path has no test mentioned
- Edge case is in the plan but no test for it
- New API route without security-cross-access test

## Output Format

The skill produces a structured verdict as a JSON-shaped Markdown comment:

```json
{
  "skill": "devflow-plan-critic",
  "iteration": 1,
  "verdict": "needs_changes",
  "findings": [
    {
      "severity": "high",
      "dimension": "ac-coverage",
      "issue": "AC-2 mentions 'user can edit story points' but no UI task exists",
      "suggestion": "Add task: 'Add story-points dropdown to FlowDetailPage'"
    },
    {
      "severity": "medium",
      "dimension": "edge-cases",
      "issue": "Migration for existing flows is not described",
      "suggestion": "Add section: 'Existing flows get story_points = NULL (back-fill out of scope)'"
    }
  ],
  "ready_to_proceed": false,
  "tokens_used_estimate": 12000
}
```

### Verdict Semantics

| Verdict | When | Next |
|---|---|---|
| `approved` | 0 high + 0 medium findings (or only `low`) | Plan is ready, proceed to approval |
| `approved-trivial` | Tasks ≤ 2 AND no schema-change AND no migration AND no security/breaking tag | Skip-shortcut for tiny flows |
| `minor_issues` | 0 high + ≥1 medium findings | Plan is good but some polish recommended; user may accept as-is |
| `needs_changes` | ≥1 high finding | Plan must be revised before approval. Fix high-findings, re-critique. |

### Severity Definitions

| Severity | Meaning |
|---|---|
| `high` | Blocks approval. Plan is materially incomplete or incorrect on this dimension. |
| `medium` | Should be addressed but doesn't block. Reviewer may accept with risk noted. |
| `low` | Cosmetic, suggestion-only. No action required. |

## Process

1. **Step 0 — pull the wiki briefing.** Before any dimension is judged, call `wiki_get_briefing({flowId})` once. The returned `relatedAdrs`, `relatedDocs`, `parallelFlows` and `gaps` are the empirical ground for **Dimension 4 — Wiki-Coverage**. Without this call you cannot detect ADR-drift, you can only guess.
2. Read the current plan (`flow.implementationPlan` + tasks + acceptance criteria)
3. For **each** of the 7 dimensions, ask the focused question and look for failure-modes. For Dimension 4 specifically, cross-reference the briefing from Step 0 — every related ADR/pattern that is not cited in the plan is a finding.
4. Record findings with severity + dimension + issue + suggestion
5. Compute verdict from findings (rule above)
6. Emit structured comment to the flow-discussion (or as agent-message)
7. If verdict ≠ `approved`, revise the plan and re-invoke this skill
8. If verdict = `approved`, proceed with `flow_update({currentState: 'approval'})`

> **Iron Law of the LLM-Wiki — extend > dismiss.** Any gap surfaced by Dimension 4 closes via `extend` of an existing ADR/pattern/runbook, or a new entry, or `intent_defer`. Never `dismiss`. See [[devflow-knowledge-completer]].

## Loop Semantics (Phase 2)

The critic is **iterative**:

1. Iteration 1: full pass on all 7 dimensions
2. If verdict ≠ `approved` → agent fixes → iteration 2
3. Iteration 2: re-check (may shortcut for unchanged dimensions)
4. If verdict ≠ `approved` → iteration 3 (final)
5. **Hard cap:** max 3 iterations
6. **Early exit:** 2 consecutive iterations with 0 high-findings → exit
7. **No-improvement detection:** same finding-hash appears twice unchanged → escalate, don't iterate

If max-iter reached and findings remain: emit `verdict: needs_changes`, set `ready_to_proceed: false`, surface to user. User decides: manual fix or override (e.g. `/skip-review` slash command).

## Skip-Rules (Phase 5) — Trivial Flow Detection

For trivial flows, the critic MAY emit `approved-trivial` early:

- `tasks_count ≤ 2` AND
- No schema migration in plan AND
- No new API endpoint introduced AND
- Tags not in `force_critic_tags` (project-config: default `['security','breaking']`)

Output:
```json
{
  "verdict": "approved-trivial",
  "skip_reason": "1 task, no schema change, no new endpoint",
  "dimensions_checked": ["ac-coverage", "task-granularity"],
  "ready_to_proceed": true
}
```

## Posting Findings (Phase 4) — Best-effort Discussion Integration

The critic's output should be visible to the user. Until `flow_comments_create` exists in MCP (deferred), use:

```
flow_update({
  flowId,
  planFeedback: <findings-summary-markdown>,
  // or: agentMessage: <short-status>
})
```

This makes findings visible in the FlowDetailPage right pane (Talk tab via plan_feedback).

## Auto-Approve Gate (Phase 5)

After loop completes:

| `project_configs.allow_agent_self_approval` | Behavior |
|---|---|
| `true` (ON)  | Verdict=approved → emit discipline-tokens via `devflow_token_emit` → proceed to `approval` (and through to `ready` via existing self-approval hook) |
| `false` (OFF) | Verdict=approved → write planFeedback summary → halt, await user manual click |

## Discipline Token

Emit `devflow-plan-critic` token only when verdict = `approved` (or `approved-trivial`) AND all 7 dimensions were explicitly checked (or skip-rules applied). Token includes evidence:

```json
{
  "dimensions_checked": ["ac-coverage", "task-granularity", "edge-cases", "wiki-coverage", "past-flow-anchor", "arch-risks", "test-strategy"],
  "iterations": 2,
  "final_verdict": "approved",
  "high_findings_resolved": 3,
  "medium_findings_open": 1
}
```

## Anti-Patterns

- **Rubber-stamping** — emitting `approved` without actually checking each dimension
- **Inventing AC** — the critic must not add new requirements; only assess what's there
- **Loop forever** — same finding 2× without progress → escalate, don't iterate further
- **Stockholm-syndrome** — being too lenient on your own plan because you wrote it. Switch persona explicitly: "if a stranger handed me this plan, what would I object to?"

## Related

- `devflow-receiving-review` — handles human reviewer feedback
- `devflow-knowledge-completer` — pairs with dimension 4 (Wiki-Coverage)
- `devflow-pattern-reuse` — pairs with dimension 5 (Past-Flow-Anchor)
- DF-339 — flow that introduced this skill
- Phase 2: loop semantics with max-3 iterations (deferred)
- Phase 3: companion skill `devflow-code-critic` for `in_progress → review`
