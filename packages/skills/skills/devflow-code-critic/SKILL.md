---
name: devflow-code-critic
description: Use during in_progress state, before submitting flow_update({currentState: 'review'}), to deeply review the implementation against 7 quality dimensions. The skill enforces a critic-persona — the agent steps out of "implementer" mode and into "reviewer" mode. Outputs a structured verdict (approved | minor_issues | needs_changes) with severity-tagged findings. Iron Law: a verdict is only valid if all 7 dimensions were explicitly checked, and the diff plan-vs-reality was actually examined.
flow_state: in_progress
hooks: [3]
discipline_token: devflow-code-critic
ported_from: superpowers:critic-pattern (DevFlow-original, sister to devflow-plan-critic)
iron_laws:
  - All 7 dimensions must be checked before emitting a verdict.
  - Plan-vs-reality diff must be explicit — list what was added beyond plan and what was skipped.
  - High-severity findings must include a concrete fix-suggestion, not just a problem.
  - Loop max 3 iterations. If 2 consecutive iterations have 0 high-findings → exit. If same finding appears twice unchanged → escalate.
  - Trivial flows (tasks ≤ 2 AND no schema-change) MAY skip critic via verdict='approved-trivial' with reasoning.
---

# Skill: devflow-code-critic

> **Purpose:** Deep self-critique of an implementation before transitioning `in_progress → review`. The agent puts on the reviewer-hat and challenges its own code against 7 quality dimensions.

## When to use

Invoke this skill **before** calling `flow_update({currentState: 'review'})`. The pre-tool-use hook prints a reminder, but the responsibility is on the agent: code submitted without critique is code submitted blind.

## The 7 Dimensions

For each dimension, the critic answers a focused question and reports findings.

### 1. AC-Implementation

> Was every Acceptance Criterion actually implemented? Not just touched — fully met?

**Common failures:**
- AC says "X is editable" but only the read-path is implemented
- AC says "validate Y" but only happy-path tested, edge-cases skipped
- AC mentioned in plan but never made it into code (drift)

### 2. Test-Coverage

> Were tests added for every behavior change? Do they actually exercise the AC?

**Common failures:**
- New function but no test
- Test added but doesn't assert the AC's specific behavior
- Test passes but only because the assertion is too weak (`.toBeTruthy()` on anything truthy)
- Critical-path code without integration/e2e test

### 3. Iron-Laws (skill-specific)

> Were the relevant DevFlow iron-laws followed?

Check at minimum:
- `devflow-tdd` — failing test before production code? Each cycle has evidence?
- `devflow-pattern-reuse` — was an existing pattern reused, or did we invent?
- `devflow-knowledge-completer` — extend > create > defer > NEVER dismiss
- `devflow-collision-acknowledged` — checked for parallel flows in this area?

### 4. ADR-Compliance

> Are there ADRs that govern this area? Does the code follow them?

**Common failures:**
- ADR-X says "use Y", code uses Z without justification
- New decision implicit in code that contradicts an existing ADR
- Code introduces a pattern that should be promoted to ADR but wasn't

### 5. Plan-Reconciliation (DF-310 alignment)

> What did the code do that wasn't in the plan? What was planned but never implemented?

**Required output for this dimension:**
```
Added beyond plan:
  - [list items]

Planned but not implemented:
  - [list items]

Justification for deviations: [explanation]
```

**Common failures:**
- Code adds a "while we're here" feature that wasn't in scope
- A planned task was silently dropped
- Plan mentions a refactor that wasn't done — should've been deferred explicitly

### 6. Knowledge-Drafts

> Did this work surface a new pattern, runbook, or ADR-worthy decision?

**Common failures:**
- A clever solution that other flows could reuse — no draft created
- A non-obvious gotcha that future-self would forget — no runbook
- A decision was made (e.g. "we use approach X over Y") with no ADR draft

Use `knowledge_draft_create` when surfacing.

### 7. Code-Quality

> Are there obvious bugs, security issues, anti-patterns?

**Common failures:**
- SQL string-concat instead of parameterized query
- User input not validated at the boundary
- Logging a secret accidentally
- N+1 query when a JOIN would do
- Race condition on shared state
- Untyped `any` where a clear type was knowable
- Silent catch-all `try/catch` that swallows errors

## Output Format

```json
{
  "skill": "devflow-code-critic",
  "iteration": 1,
  "verdict": "needs_changes",
  "findings": [
    {
      "severity": "high",
      "dimension": "ac-implementation",
      "issue": "AC-3 says 'flow shows token usage' but no UI element added",
      "suggestion": "Add token-card to FlowDetailPage, see DF-233 brainstorm for layout"
    },
    {
      "severity": "medium",
      "dimension": "code-quality",
      "issue": "Function `calculateBudget` swallows DB errors silently",
      "suggestion": "Throw to caller; let route-handler decide 500 vs 422"
    }
  ],
  "plan_reconciliation": {
    "added_beyond_plan": ["Added a tiny utility helper in src/utils/foo.ts"],
    "planned_not_implemented": ["No items"],
    "justification": "Helper extracted from duplicated logic in 2 files; no scope creep."
  },
  "ready_to_proceed": false,
  "iteration_max": 3,
  "tokens_used_estimate": 18000
}
```

### Verdict Semantics

| Verdict | When | Next |
|---|---|---|
| `approved` | 0 high + 0 medium findings | Code is ready, proceed to review |
| `approved-trivial` | Tasks ≤ 2 AND no schema-change AND no AC of severity-relevant kind | Skip-shortcut for tiny flows |
| `minor_issues` | 0 high + ≥1 medium findings | Acceptable; user reviewer may accept |
| `needs_changes` | ≥1 high finding | Code must be revised. Fix high-findings, re-critique. |

### Severity Definitions

| Severity | Meaning |
|---|---|
| `high` | Blocks review-submit. Code is materially incomplete, broken, or unsafe. |
| `medium` | Should be addressed but doesn't block. Reviewer may accept with note. |
| `low` | Cosmetic, suggestion-only. No action required. |

## Loop Semantics (Phase 2)

The critic is **iterative**:

1. Iteration 1: full pass on all 7 dimensions
2. If verdict ≠ `approved` → agent fixes → iteration 2
3. Iteration 2: re-check (may shortcut for unchanged dimensions)
4. If verdict ≠ `approved` → iteration 3 (final)
5. **Hard cap:** max 3 iterations
6. **Early exit:** 2 consecutive iterations with 0 high-findings → exit
7. **No-improvement detection:** same finding-hash appears twice unchanged → escalate, don't iterate

If max-iter reached and findings remain: emit `verdict: needs_changes`, set `ready_to_proceed: false`, surface to user as blocking signal. User decides: manual fix or override.

## Skip-Rules (Phase 5)

For trivial flows, the critic MAY emit `approved-trivial` early:

- `tasks_count ≤ 2` AND
- No schema migration in changed files AND
- No new API endpoint AND
- Tags not in `force_critic_tags` (project-config: default `['security','breaking']`)

Output:
```json
{
  "verdict": "approved-trivial",
  "skip_reason": "1 task, no schema change, no new endpoint",
  "dimensions_checked": ["ac-implementation", "test-coverage"],
  "ready_to_proceed": true
}
```

## Posting Findings as Discussion (Phase 4)

The critic's output should land in the flow's discussion / plan_feedback for visibility. Until `flow_comments_create` exists in MCP (deferred), use:

```
flow_update({
  flowId,
  planFeedback: <findings-summary-markdown>,
  // or: agentMessage: <findings-summary-short>
})
```

This makes findings visible in the FlowDetailPage right pane.

## Auto-Approve Gate (Phase 5)

After loop completes:

| `project_configs.allow_agent_self_approval` | Behavior |
|---|---|
| `true` (ON)  | Verdict=approved → emit discipline-tokens via `devflow_token_emit` → proceed to `review` |
| `false` (OFF) | Verdict=approved → write plan_feedback summary → halt, await user manual click |

## Anti-Patterns

- **Rubber-stamping** — emitting `approved` without actually checking each dimension
- **Plan-Reconciliation skipped** — dimension 5 is mandatory; explicit list of additions/omissions
- **Loop forever** — same finding 2× without progress → escalate, don't iterate
- **Stockholm-syndrome** — being too lenient on your own code. Switch persona explicitly: "if this came from a junior dev, what would I flag?"

## Related

- `devflow-plan-critic` — sister skill for `planning → approval`
- `devflow-receiving-review` — handles human reviewer feedback
- `devflow-tdd`, `devflow-pattern-reuse`, `devflow-knowledge-completer` — checked under dimension 3
- DF-339 — flow that introduced this skill family
- Brainstorm: see flow attachment `df-339-brainstorm.html`
