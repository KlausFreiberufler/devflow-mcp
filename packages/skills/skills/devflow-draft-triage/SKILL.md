---
name: devflow-draft-triage
description: Use in the 'review' state to triage pending knowledge_drafts before review→done. Decides per draft: accept (new wiki entry) or reject (with substantive reason). Iron Law extend > dismiss applies — never wegklick a draft whose topic has an existing extend-target.
flow_state: review
optional: false
ported_from: NEW (DF-420 Welle 1 Paket D)
iron_laws:
  - Every pending draft is decided — never left dangling. `no-pending-drafts` Gate blocks review→done otherwise.
  - extend > dismiss. If a related wiki entry already covers the topic, prefer reject-with-extend-pointer + a separate `knowledge_check_resolve({resolutionType: 'extend'})` call over a plain reject.
  - Auto-harvested Implementation-Plan-Drafts are objectively off-topic — pläne leben am Flow-Attachment (DF-406 Iron Law). Reject with reason `"plan-artefact"`.
  - True duplicates (z.B. ADR + Runbook für dieselbe Sache) — reject the weaker form mit Verweis auf die bessere.
---

# Skill: devflow-draft-triage

> **Pre-review-done cleanup.** The `no-pending-drafts` Gate (DF-320) blocks `review → done` whenever any draft from this or earlier flows is still `pending`. This skill walks them down systematically.

## When to use

In the `review` state, **before** emitting the testing-tokens and the final `flow_update({currentState: 'done'})`. If `knowledge_draft_list({status: 'pending'})` returns ≥ 1, this skill runs.

## Why this exists

Background-harvested drafts accumulate. Without explicit triage:
- The Gate fires unexpectedly during `review → done`, breaking the loop.
- True wiki-worthy drafts get lost in the noise of plan-artefacts.
- Plan-artefacts pollute the candidate-pool that powers `extend > dismiss` decisions later.

## Process

### 1. Pull pending drafts

```ts
knowledge_draft_list({ status: 'pending' })
```

If the result is empty: emit the skill-token immediately with `evidence: { reviewed: 0 }` and exit.

### 2. Classify each draft

For every draft, decide a category based on title + sourceFlowIds + body:

| Category | Action | Reason |
|---|---|---|
| **Real Wiki-worthy** (runbook from a hotfix, pattern from a reusable mechanism, lesson from a substantive audit) | `knowledge_draft_accept` | Iron Law extend > dismiss: this content compounds the wiki. |
| **Extend-candidate** (a related wiki entry already exists and should grow) | `knowledge_draft_reject({ notes: "extend → <slug>" })` THEN `knowledge_check_resolve({ resolutionType: 'extend', entityType, entityId, body, rationale })` | Don't create a parallel page — fold into the existing entry. |
| **Plan-artefact** (auto-harvested from an `implementation-plan.md` attachment — title looks like "Pattern candidate: DF-XYZ Implementation Plan" or "# Goal") | `knowledge_draft_reject({ notes: "plan-artefact (DF-406 Iron Law)" })` | Pläne leben am Flow-Attachment, nicht im Wiki. |
| **True Duplicate** (two drafts cover the exact same scope, one ADR + one Runbook) | accept the better form, reject the weaker with `notes: "dedup → <id>"` | Wiki kompakt halten. |
| **Honest false positive** (heuristic over-classified) | `knowledge_draft_reject({ notes: <substantive reason ≥ 10 chars> })` | Acceptable — but rare. Audit log keeps the reason. |

### 3. Verify

```ts
knowledge_draft_list({ status: 'pending' })
```

Expected: empty array, OR only drafts created by the *current* flow (`sourceFlowIds` matches your `flowId`) which are owned by the current review.

### 4. Emit the discipline-token

This skill emits the `devflow-knowledge-completer` discipline-token (it is the manual companion of the knowledge-completer Iron Law). Evidence:

```ts
devflow_token_emit({
  flowId,
  skillName: 'devflow-knowledge-completer',
  evidence: {
    reviewed: <total>,
    accepted: <n>,
    rejected_plan_artefact: <n>,
    rejected_dedup: <n>,
    rejected_extend: <n>,
    rejected_false_positive: <n>,
    checkedAt: new Date().toISOString(),
    ironLaw: 'extend > dismiss — no extend-targets wegklick',
  },
})
```

## Anti-patterns

- **„Reject all because they look noisy"** — Iron Law violation. Each reject needs a substantive reason that holds up in audit.
- **„Accept everything to be safe"** — pollutes the wiki with low-signal entries. Plan-artefacts must be rejected.
- **„Defer triage to the next flow"** — the Gate will fire, the next flow's review→done will trip on the same backlog. Triage here, not there.

## Worked Example — DF-419

DF-419 triagierte 17 pending Drafts:
- **10 accepted** — Security-Hotfix-Runbooks, Cleanup-Runbooks, Bug-Hotfix-Runbooks.
- **6 rejected** as Plan-Artefakte — DF-417/415/418/413/412 Implementation Plans + ein `# Goal`-Merge-Artefakt.
- **1 rejected** as Duplikat — ADR-Variante eines Themas, dessen Runbook-Form die bessere war.

Result: `knowledge_draft_list({status: 'pending'})` returned `No drafts`. Subsequent flows ran review→done without Gate-hits.

## Cross-references

- `devflow-knowledge-completer` — sister-skill that walks gaps from `wiki-context`. This skill walks the harvested-drafts side of the same picture.
- DF-310 — extend > dismiss Iron Law foundation.
- DF-320 — pre-flow-update-knowledge-auto-resolve Hook (auto-resolves before transitions).
- DF-406 — Iron Law „Plan goes to the flow, not the repo" (why plan-artefacts are rejected).
- DF-419 — first systematic backlog-triage that worked through 17 drafts (the worked example above).
