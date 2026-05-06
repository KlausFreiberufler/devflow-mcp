---
name: devflow-plan-reconciliation
description: Use during the review state, before devflow-verification-gate, to reconcile the approved implementation_plan against what was actually implemented. Produces a per-AC and per-section table — done / partial / missing / extra — and forces the agent to address every gap (either fix it now, file an intent, or document why it's deferred). Without this skill the review only proves AC-by-AC, not that the plan as a whole was respected.
flow_state: review
hooks: []
discipline_token: devflow-plan-reconciliation
ported_from: NEW (DF-310)
iron_laws:
  - Every AC and every plan section gets an explicit status — never "we'll see at testing time".
  - Scope-creep (work done not in the plan) is documented, not hidden.
  - Missing items must be fixed, deferred via intent_defer, or have a recorded rationale before review→done.
---

# Skill: devflow-plan-reconciliation

> **Plan-vs-Implementation guard.** The plan is the contract; implementation should respect it. This skill forces an honest accounting before evidence-gathering (`devflow-verification-gate`), so the review actually corresponds to what was approved.

## When to use

In `review` state, **before** `devflow-verification-gate`. After self-review (`devflow-receiving-review`) and before the final `flow_update review→done`.

## Process

### 1 · Pull the approved plan + the change-set

```ts
flow_get({ id })           // returns implementation_plan + acceptance_criteria
git diff main...HEAD --stat   // file-level summary
git log main..HEAD --oneline  // commits since branch
```

Also:

```ts
GET /api/flows/:id/wiki-context  // for cited ADRs/patterns the plan promised
```

### 2 · Build the reconciliation table

For each acceptance criterion **and** each top-level section of the implementation plan, decide one of:

| Status | Meaning | Action required |
|---|---|---|
| **done** | Implemented as planned | Note the commit / file |
| **partial** | Started but not finished | Either finish it now, or file `intent_defer` with horizon |
| **missing** | Plan says do it; not done | Either do it now, or `intent_defer` with substantive reason |
| **extra** | Done but not in the plan | Document why — scope-creep gets a one-line rationale |
| **moved** | Done but in a way that doesn't match the plan | Document the deviation + reason (often this becomes a wiki update via `extend`) |

Render as Markdown:

```markdown
### Plan reconciliation — DF-310

| Item | Status | Evidence |
|---|---|---|
| AC-1: lifecycle_stage column on adrs+doc_pages | done | `db.js` migration block, `tests/migration/lifecycle-stage.test.ts` |
| AC-2: GET /api/flows/:id/wiki-context | done | `services/wikiContext.js`, `routes/flows.js:1135` |
| Section: WikiBriefingPanel | done | `frontend/.../WikiBriefingPanel.tsx` |
| AC-7: Tests for extend resolution-type | partial | extend-create test exists; tag-side-effect test missing → fixed in commit XXX |
| (extra) | extra | `RightTabs.tsx` rewired to use WikiBriefingPanel — needed for AC-2 to be visible |
```

### 3 · Address every non-done row

For every row that is not `done`:

- **partial / missing** — implement the gap now if cheap, OR call `knowledge_check_resolve({ resolutionType: 'intent_defer', topic, horizon, reason })`.
- **extra** — record a one-line rationale in the table; if it warrants a wiki entry, use `knowledge_check_resolve({ resolutionType: 'extend' | 'pattern' | … })`.
- **moved** — almost always indicates a wiki entry should be **extended** with the new approach (`resolutionType: 'extend'`).

After this pass the reconciliation table has only `done` and explicitly-documented `extra` / `moved` / deferred rows.

### 4 · Append the table to `agent_summary`

Pass the full reconciliation table as part of `agentSummary` in the next `flow_update` call. This is the artifact reviewers see in the UI.

### 5 · Emit the discipline-token

```ts
devflow_token_emit({
  flowId,
  skillName: 'devflow-plan-reconciliation',
  evidence: {
    rows: [{ item, status, evidence }],
    counts: { done, partial, missing, extra, moved },
    deferredVia: [{ topic, intentPageId }],
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

`devflow-verification-gate` proves that **each AC has a passing evidence command**, but it does not prove that **the plan as a whole was respected**. Three failure modes this skill catches:

1. **Silent skip** — an AC was forgotten or "done in spirit" without any evidence command. Verification-gate would just have one less command in the table; reconciliation forces a per-AC status.
2. **Scope creep** — work was done outside the plan and never disclosed. Reconciliation surfaces it as `extra` and asks why.
3. **Pattern divergence** — the plan said "use ADR-027 approach" but the implementation went a different way. Reconciliation flags this as `moved` and triggers an `extend` on the ADR (so the wiki captures the new approach).

## Cross-references

- `devflow-verification-gate` — runs **after** this skill, evidences each AC.
- `devflow-receiving-review` — Critical/Important/Minor triage of findings; runs before reconciliation.
- `devflow-knowledge-completer` — handles the `extend` writes that `moved` rows trigger.
- DF-310 introduced both this skill and the `extend` resolution type.
