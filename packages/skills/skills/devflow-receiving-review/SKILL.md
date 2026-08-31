---
name: devflow-receiving-review
description: Use when receiving a code-review (from a subagent dispatch or a human reviewer) to triage every finding into Critical / Important / Minor with a deliberate decision per item. Each finding is technically verified before accept-or-reject — never blind acceptance, never blind rejection.
flow_state: review
hooks: []
discipline_token: devflow-receiving-review
optional: true
ported_from: superpowers:receiving-code-review
iron_laws:
  - Verify each finding technically — read the cited code, run a check command if applicable.
  - Never blind-accept ("good catch, fixing") and never blind-reject ("not relevant").
  - Document rejected findings with the reason — they're future-you's audit trail.
---

# Skill: devflow-receiving-review

> **Iron-Law port** of Superpowers `receiving-code-review`. Code-review without a structured triage is just opinion; this skill turns reviewer-output into a checklist with deliberate decisions and an audit trail.

## When to use

In `review` state, after a code-review has been performed (manually by a human, or via a subagent like the project's `code-reviewer` agent). The skill triages the raw review-output into actionable rows.

## Severity schema

Every finding gets exactly one severity:

| Severity | Definition | Effect on `done` |
|---|---|---|
| **Critical** | Bug, security issue, data-loss risk, or behaviour that contradicts an accepted ADR. | Blocks `done` — must be fixed (or explicitly overridden as `break-by-design` via Hook 6 ADR-Compliance). |
| **Important** | Likely-bug, design smell, ambiguous spec, missing test for a non-trivial path. | Should be addressed; rejection requires a written reason. |
| **Minor** | Cosmetic, style, naming, code-smell that doesn't affect behavior. | Optional; rejection is acceptable without long justification. |

**Borderline cases:** when in doubt, assign the **higher** severity. It's cheaper to triage-down than to discover a missed Critical at production.

## Process

### 1 · Collect findings

Gather every finding from the review-source (subagent stdout, PR-comments, oral feedback). Number them. Don't filter at this stage.

### 2 · Triage per finding

For each finding, capture:

```yaml
- id: F1
  severity: Critical | Important | Minor
  location: <file>:<line> | <component> | <general>
  observation: <reviewer's claim, verbatim or summarized>
  verification: <what you actually checked — read the code, ran the test, etc.>
  decision: fix | reject | knowledge-draft
  reasoning: <why fix or why reject; what knowledge to capture if draft>
```

**Iron Law: verification is non-optional.** A finding's `verification` field can never be "trusted reviewer". Read the cited code yourself, run the relevant test, or check the actual ADR/spec. If you cannot verify within ~5 min, default the decision to `fix` — the reviewer's caution outweighs your interpretation.

### 3 · Apply decisions

- **fix** → write or update the test (`devflow-tdd` discipline still applies — RED-test if behavioral), then the fix.
- **reject** → write the reason in `reasoning` (and ideally append it to the PR/flow-comments so the reviewer sees it).
- **knowledge-draft** → call `POST /api/knowledge-drafts { draftType: 'pattern'|'runbook'|'lessons_learned', ... }` with the lesson the finding revealed. The draft can be accepted later by the reviewer.

### 4 · Block-on-Critical

Before emitting any token / submitting `flow_update review→done`:
- Every Critical finding has `decision: fix` AND the fix is committed AND tests pass, **OR**
- Every Critical has been re-classified as a `break-by-design` override (Hook 6 ADR-Compliance) with a documented reason.

**No `done` while any unresolved Critical exists.**

### 5 · Optional: emit discipline-token

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-receiving-review",
  "evidence": {
    "findings": [ { id, severity, decision, verification: '<truncated>' }, ... ],
    "criticalCount": <n>,
    "criticalResolved": <n>,
    "rejectedWithReason": <n>,
    "completedAt": "<iso>"
  }
}
```

Today not required for any pipeline-step; future projects may add `'devflow-receiving-review'` to a step's `required_skills` to gate `review→done` on this skill.

## Iron Laws

> **Verify each finding technically — read the cited code, run a check command if applicable.**
>
> **Never blind-accept and never blind-reject.**
>
> **Document rejected findings with the reason — future-you's audit trail.**

## Output contract

- Triage-table written to the flow's review-thread (or `flow.testing_notes` if no thread).
- Per-Critical: linked commit-sha that resolves it (or override-reason).
- Optional: `flow_discipline_tokens` row with `skill_name='devflow-receiving-review'`.

## Related

- `devflow-code-critic` — the main upstream source of findings. Since **DF-535** its primary mode is a fresh-context dispatch: 2-3 read-only reviewer subagents (`correctness`, `security`, `does-it-reproduce`) receive artifacts only — diff, acceptance criteria, plan excerpt, repo path — and never the author's assumptions. Their findings land here. **Nothing in the process above changes**: a subagent finding is collected, triaged and verified exactly like a human one. Two directions of caution apply — a fresh reviewer has no flow history and will sometimes flag intended behaviour (so never blind-accept), and it also has no stake in the code (so never blind-reject).
- [[migration-test-strategy]] — Säule A
- [[knowledge-gated-workflow]] — Stage 11 in the visual diagram
- DF-294 — port flow (this implementation)
- DF-289 — discipline-tokens foundation
- DF-290 — Hook 6 ADR-Compliance (override path for Critical findings)
- DF-535 — made fresh-context dispatch the primary mode of `devflow-code-critic`, so this skill's triage now runs mostly on subagent output
- Superpowers v5.0.7 — `receiving-code-review` (original skill)
