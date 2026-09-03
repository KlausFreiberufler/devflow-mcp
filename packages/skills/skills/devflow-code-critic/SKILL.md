---
name: devflow-code-critic
description: Use during in_progress state, before submitting flow_update({currentState: 'review'}), to review the implementation against 7 quality dimensions. Primary mode (DF-535) is a fresh-context dispatch — 2-3 read-only reviewer subagents (correctness, security, does-it-reproduce) receive artifacts only (diff, acceptance criteria, plan excerpt, repo path) and never the author's assumptions. Clients without a subagent tool fall back to the critic-persona self-review (ADR-135), declared via review_mode. Outputs a structured verdict (approved | minor_issues | needs_changes) with severity-tagged findings. Iron Law: a verdict is only valid if all 7 dimensions were explicitly checked, and the diff plan-vs-reality was actually examined.
flow_state: in_progress
hooks: [3]
discipline_token: devflow-code-critic
optional: true
ported_from: superpowers:critic-pattern (DevFlow-original, sister to devflow-plan-critic)
iron_laws:
  - Context boundary (DF-535) — the dispatch prompt carries artifacts only (git diff, acceptance criteria, plan excerpt, repo path). The author's assumptions, rationale, self-assessment or prior verdict must NEVER cross it. Evidence case DF-520 R3, anchoring effect.
  - Critic subagents are read-only. They report, they never fix — the author fixes and re-dispatches.
  - All 7 dimensions must be checked before emitting a verdict.
  - Plan-vs-reality diff must be explicit — list what was added beyond plan and what was skipped.
  - High-severity findings must include a concrete fix-suggestion, not just a problem.
  - Loop max 3 iterations. If 2 consecutive iterations have 0 high-findings → exit. If same finding appears twice unchanged → escalate.
  - Trivial flows MAY skip the critic via verdict='approved-trivial' with reasoning — no dispatch. All four Skip-Rules conditions must hold; tasks ≤ 2 alone is not enough.
---

# Skill: devflow-code-critic

> **Purpose:** Deep review of an implementation before transitioning `in_progress → review`. Since **DF-535** the primary mode is not self-critique but a **fresh-context dispatch**: the code is judged by reviewers who never saw it being written.

## When to use

Invoke this skill **before** calling `flow_update({currentState: 'review'})`. The pre-tool-use hook prints a reminder, but the responsibility is on the agent: code submitted without critique is code submitted blind.

## Fresh-Context Dispatch (primary mode, DF-535)

Dispatch **2-3 reviewer subagents** (Claude Code `Agent`/Task tool), each with exactly one lens, each **read-only**. Use an agent type without `Edit`/`Write` — e.g. `feature-dev:code-reviewer` or `Explore`. They read the repo themselves; they do not touch it.

**Pick the agent type per lens, not once for all three.** `correctness` and `security` only read — `feature-dev:code-reviewer` fits. `does-it-reproduce` has to *execute* the suite, so it needs a type that can run commands (e.g. `Explore`). `feature-dev:code-reviewer` ships without `Bash` — it has only `KillShell`/`BashOutput`, which attach to an already-running shell and cannot start one. Dispatched to that type, the lens would review the tests by reading them and report as if it had run them: exactly the failure mode the lens exists to catch.

The three lenses run in parallel — one message, multiple tool calls.

### Why the boundary exists — evidence case DF-520 R3

A self-review shares a context window with the author, so it inherits the author's reasoning as a premise instead of testing it. That is the **anchoring effect**.

**DF-520 (Ritual-Schedules)** is the paid-for proof: the self-review greenlit the flow, the human reviewer rejected it (R1), the self-review greenlit the fix, and it was rejected again (R2). Only in round 3 did anyone question the premise "`CronExpressionParser.parse()` validates the expression" — it does not. Malformed fields (a bare `'L'` in the weekday slot) parse fine and throw on the first `.next()`, so a single PUT persisted a broken cron and 500'd the ritual from then on. The author could not see it because the author's own justification was in the review context.

A reviewer who receives only the diff and the ACs has no premise to inherit. They ask "does `parse()` actually reject every malformed field?" and run it.

### The three lenses

| Lens | Question the subagent answers | Feeds dimensions |
|---|---|---|
| `correctness` | Is every acceptance criterion really implemented (not just touched)? Are there bugs? Does the diff match the approved plan — anything added beyond it, anything planned and silently dropped? | 1 · 5 · 7 |
| `security` | Walk the **Security Hygiene Checklist** from the project's CLAUDE.md against this diff: `requireAuth`, `requireProjectAccess`/`requireFlowAccess`, resource→project resolution before the first DB read, DB-layer `userId` filters, `dangerouslySetInnerHTML`, `iframe sandbox`, token storage, cross-access test entry. | 4 · 7 |
| `does-it-reproduce` | Were the tests actually **executed**, or only written? Run them. Are the assertions strong enough to fail if the code regressed — or would they pass against a stub? Is every AC backed by a command whose output was really captured? | 2 |

### Dispatch contract — what crosses the context boundary

| Crosses | Stays on the author's side |
|---|---|
| The `git diff` (or diff range + repo path so the reviewer reads it) | The author's assumptions and rationale |
| The flow's **acceptance criteria**, verbatim | "I already checked X", "this is safe because Y" |
| The approved **plan** excerpt — scope and tasks | The author's verdict from a previous iteration |
| Repo path + the command to run the tests | Findings the author already dismissed |

**Never** paste the author's assumptions, rationale, self-assessment or prior verdict into the dispatch prompt — that anchor is exactly what let DF-520 R3 survive two self-reviews.

Prompt skeleton per lens:

```
You are reviewing a change you have not seen before. Repo: <abs path>.
Read the diff below (or run: git diff <base>...<head>).
Lens: <correctness | security | does-it-reproduce> — only this lens.

Acceptance criteria (verbatim):
<AC list>

Approved plan (scope + tasks):
<plan excerpt>

Report findings as JSON. Do not fix anything. Do not assume the author was right.
```

### What each reviewer returns

```json
{
  "source_lens": "does-it-reproduce",
  "findings": [
    {
      "severity": "high",
      "location": "backend/src/services/ritualSchedules.js:42",
      "observation": "validateCronExpression() parses but never iterates. '0 8 1 * L' is accepted here and throws on the first .next() in the caller.",
      "repro": "node -e \"import('./src/services/ritualSchedules.js').then(m=>console.log(m.validateCronExpression('0 8 1 * L')))\"",
      "suggestion": "Call .next() on the parsed result inside the validator and reject expressions that throw."
    }
  ]
}
```

`severity` uses the same scale as the verdict table below. `observation` states what is, not what the author intended. A `high` finding without a `repro` command is a suspicion, not a finding — send the lens back for it.

When the author folds a reviewer's findings into this skill's own output, `observation` maps onto the pre-existing `issue` field and the author adds `dimension`. The keys that existed before DF-535 — `severity`, `dimension`, `issue`, `suggestion` — keep their names and meaning, so never emit `observation` at the top level. DF-535 only *adds* keys to `findings[]`: `source_lens`, plus `location` and `repro` carried over from the reviewer (see [Output Format](#output-format)).

A lens that errors out or returns nothing usable is `status: "failed"` — re-dispatch it once. If it fails again, the author covers that lens' dimensions themselves and the entry stays in `reviewers[]` with `failed`, so the gap is visible. `review_mode` remains `fresh-context` as long as at least one lens actually crossed the boundary; the field says how the review was produced, not how completely.

### What the author keeps

The subagents cannot judge everything. These stay with the author, who has the flow, wiki and history in context:

- **Dimension 3 · Iron-Laws** — was TDD really RED-first, was a pattern reused, extend > dismiss, collisions acknowledged.
- **Dimension 6 · Knowledge-Drafts** — did this work surface a pattern, runbook or ADR-worthy decision.
- **Triage** — collected findings go through **`devflow-receiving-review`**: every finding triaged Critical/Important/Minor, technically verified, accepted or rejected with a written reason. Never blind-accept a subagent, never blind-reject one.

### Re-dispatch on iteration 2+

Re-dispatch **only the lenses that produced high-findings** in the previous iteration. A lens that came back clean is not re-run — it would read the same code twice. Exception: if a fix touches a file that a clean lens owns (a security-relevant path, a test file), re-dispatch that lens too.

A lens that is not re-run still gets an entry in that iteration's `reviewers[]`, with `status: "skipped"` and the reason ("clean in iteration 1"). Every iteration therefore lists all three lenses — a deliberate clean-skip stays distinguishable from a lens that was never dispatched at all.

## Fallback: self-persona critique for clients without a subagent tool

Not every client can spawn a subagent. Per **ADR-135** (Multi-Client Plugin-Strategie, 3-Tier Support — originating flow DF-327), Codex, Gemini, Cursor, Cline, Windsurf and Continue have no equivalent of the Claude Code Agent tool. There the fresh-context dispatch is impossible and the skill degrades to the original **critic-persona self-review**: the agent explicitly switches role — *"if this came from a junior dev, what would I flag?"* — and walks the 7 dimensions alone, applying the three lenses as checklists.

This is a weaker review and must be **declared, not hidden**:

```json
{ "review_mode": "self-persona-fallback", "reviewers": [] }
```

Use `review_mode: "self-persona-fallback"` **only** when no subagent tool exists. Not having felt like dispatching is not a fallback reason. The slug `self-persona-fallback` is greppable on purpose — it makes the weaker mode auditable across flows.

## The 7 Dimensions

The dimension structure is unchanged — the dispatch changes *who* answers, not *what* is asked. For each dimension the critic answers a focused question and reports findings.

### 1. AC-Implementation → lens `correctness`

> Was every Acceptance Criterion actually implemented? Not just touched — fully met?

**Common failures:**
- AC says "X is editable" but only the read-path is implemented
- AC says "validate Y" but only happy-path tested, edge-cases skipped
- AC mentioned in plan but never made it into code (drift)

### 2. Test-Coverage → lens `does-it-reproduce`

> Were tests added for every behavior change? Do they actually exercise the AC?

**Common failures:**
- New function but no test
- Test added but doesn't assert the AC's specific behavior
- Test passes but only because the assertion is too weak (`.toBeTruthy()` on anything truthy)
- Test written but never executed — the suite was never run on the final state
- Critical-path code without integration/e2e test

### 3. Iron-Laws (skill-specific) → author

> Were the relevant DevFlow iron-laws followed?

Check at minimum:
- `devflow-tdd` — failing test before production code? Each cycle has evidence?
- `devflow-pattern-reuse` — was an existing pattern reused, or did we invent?
- `devflow-knowledge-completer` — extend > create > defer > NEVER dismiss
- `devflow-collision-acknowledged` — checked for parallel flows in this area?

### 4. ADR-Compliance → lens `security` (+ author)

> Are there ADRs that govern this area? Does the code follow them?

**Common failures:**
- ADR-X says "use Y", code uses Z without justification
- New decision implicit in code that contradicts an existing ADR
- Code introduces a pattern that should be promoted to ADR but wasn't

### 5. Plan-Reconciliation (DF-310 alignment) → lens `correctness`

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

### 6. Knowledge-Drafts → author

> Did this work surface a new pattern, runbook, or ADR-worthy decision?

**Common failures:**
- A clever solution that other flows could reuse — no draft created
- A non-obvious gotcha that future-self would forget — no runbook
- A decision was made (e.g. "we use approach X over Y") with no ADR draft

Use `knowledge_draft_create` when surfacing.

### 7. Code-Quality → lenses `correctness` + `security`

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
  "review_mode": "fresh-context",
  "reviewers": [
    { "lens": "correctness", "agent_type": "feature-dev:code-reviewer", "status": "returned", "findings_count": 1 },
    { "lens": "security", "agent_type": "feature-dev:code-reviewer", "status": "returned", "findings_count": 0 },
    { "lens": "does-it-reproduce", "agent_type": "Explore", "status": "returned", "findings_count": 1 }
  ],
  "verdict": "needs_changes",
  "findings": [
    {
      "severity": "high",
      "dimension": "ac-implementation",
      "source_lens": "correctness",
      "location": "frontend/src/components/flow/FlowDetailPage.tsx",
      "issue": "AC-3 says 'flow shows token usage' but no UI element added",
      "repro": "grep -r 'tokenUsage' frontend/src/components/flow/ → no hit",
      "suggestion": "Add token-card to FlowDetailPage, see DF-233 brainstorm for layout"
    },
    {
      "severity": "medium",
      "dimension": "code-quality",
      "source_lens": "correctness",
      "location": "backend/src/services/budget.js:88",
      "issue": "Function `calculateBudget` swallows DB errors silently",
      "repro": "node --test tests/api/budget-enforcement.test.js (passes even with a throwing stub)",
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

| Field | Values | Meaning |
|---|---|---|
| `review_mode` | `fresh-context` \| `self-persona-fallback` | How the review was produced. `fresh-context` = dispatched across the context boundary. `self-persona-fallback` = no subagent tool available (ADR-135). |
| `reviewers[]` | one entry per lens, every dispatched iteration | Empty whenever nothing was dispatched — either fallback mode or an `approved-trivial` skip; read it together with `review_mode`, not alone. `status`: `returned` (crossed the boundary and reported) \| `failed` (errored twice, dimensions fell back to the author) \| `skipped` (clean in the previous iteration, not re-run — see [Re-dispatch on iteration 2+](#re-dispatch-on-iteration-2)). Entry keys: `lens`, `agent_type`, `status`, `findings_count` — plus `reason` (free text), required when `status` is `failed` or `skipped`, so the gap in that iteration is readable from the JSON alone. |
| `findings[].source_lens` | `correctness` \| `security` \| `does-it-reproduce` \| `author` | Which lens produced the finding. `author` for dimensions 3 and 6. |

### Verdict Semantics

| Verdict | When | Next |
|---|---|---|
| `approved` | 0 high + 0 medium findings | Code is ready, proceed to review |
| `approved-trivial` | All four Skip-Rules conditions hold (see [Skip-Rules](#skip-rules-phase-5)) — tasks ≤ 2 alone is not enough | Skip-shortcut for tiny flows; nothing dispatched |
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

1. Iteration 1: dispatch all three lenses, full pass on all 7 dimensions
2. If verdict ≠ `approved` → agent fixes → iteration 2
3. Iteration 2: re-dispatch **only the lenses with high-findings** from iteration 1
4. If verdict ≠ `approved` → iteration 3 (final)
5. **Hard cap:** max 3 iterations
6. **Early exit:** 2 consecutive iterations with 0 high-findings → exit
7. **No-improvement detection:** same finding-hash appears twice unchanged → escalate, don't iterate

If max-iter reached and findings remain: emit `verdict: needs_changes`, set `ready_to_proceed: false`, surface to user as blocking signal. User decides: manual fix or override.

## Skip-Rules (Phase 5)

For trivial flows, the critic MAY emit `approved-trivial` early — **no dispatch at all**, three subagents for a typo fix is waste:

- `tasks_count ≤ 2` AND
- No schema migration in changed files AND
- No new API endpoint AND
- Tags not in `force_critic_tags` (project-config: default `['security','breaking']`)

Output:
```json
{
  "verdict": "approved-trivial",
  "review_mode": "fresh-context",
  "reviewers": [],
  "skip_reason": "1 task, no schema change, no new endpoint",
  "dimensions_checked": ["ac-implementation", "test-coverage"],
  "ready_to_proceed": true
}
```

`review_mode` stays `fresh-context` here: it names the mode that was available, not a review that happened. The **`approved-trivial` verdict** is the marker for "nothing was dispatched" — so the *Fake fresh-context* anti-pattern below does not apply to a skip. When auditing how flows were reviewed, filter on the verdict first, then on `review_mode`.

## Posting Findings as Discussion (Phase 4)

The critic's output should land in the flow's discussion / plan_feedback for visibility. Until `flow_comments_create` exists in MCP (deferred), use:

```
flow_update({
  flowId,
  planFeedback: <findings-summary-markdown>,
  // or: agentMessage: <findings-summary-short>
})
```

This makes findings visible in the FlowDetailPage right pane. Include `review_mode` in the summary so the reader knows whether this was a fresh-context review or the weaker self-persona one.

## Auto-Approve Gate (Phase 5)

After loop completes:

| `project_configs.allow_agent_self_approval` | Behavior |
|---|---|
| `true` (ON)  | Verdict=approved → emit discipline-tokens via `devflow_token_emit` → proceed to `review` |
| `false` (OFF) | Verdict=approved → write plan_feedback summary → halt, await user manual click |

## Anti-Patterns

- **Leaking the anchor** — pasting "I already verified X" or the previous verdict into the dispatch prompt. That re-creates the DF-520 R3 failure inside a fresh context.
- **Dispatching a writer** — giving the critic subagent `Edit`/`Write`. The critic reports; the author fixes. Otherwise nobody reviews the fix.
- **Fake fresh-context** — claiming `review_mode: "fresh-context"` for a review the author did alone.
- **Rubber-stamping** — emitting `approved` without actually checking each dimension
- **Blind acceptance** — taking every subagent finding at face value. Triage via `devflow-receiving-review`; a fresh reviewer lacks flow history and will sometimes flag intended behavior.
- **Plan-Reconciliation skipped** — dimension 5 is mandatory; explicit list of additions/omissions
- **Loop forever** — same finding 2× without progress → escalate, don't iterate
- **Stockholm-syndrome** — being too lenient on your own code (the failure mode the dispatch is designed to remove)

## Related

- `devflow-plan-critic` — sister skill for `planning → approval`
- `devflow-receiving-review` — triages the findings this skill produces
- `devflow-tdd`, `devflow-pattern-reuse`, `devflow-knowledge-completer` — checked under dimension 3
- ADR-135 — "Multi-Client Plugin-Strategie: 3-Tier Support" (accepted 2026-05-06, from DF-327) — the reason the fallback mode exists. It lives in the DevFlow wiki, not as a file in either repo, so it is not greppable: look it up with `adr_get({ number: 135 })`.
- DF-339 — flow that introduced this skill family
- DF-535 — flow that made fresh-context dispatch the primary mode
- DF-520 — the evidence case, R3 (see above)
- Brainstorm of the original critic design: flow attachment `df-339-brainstorm.html`
