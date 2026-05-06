---
name: devflow-reviewing
description: Use when the active DevFlow flow is in 'review' state. Guides self-review via diff analysis and writes the agent summary + testing instructions.
---

# DevFlow — Review State

The flow is `review`. The agent has submitted work; you are checking it and preparing handover notes for the user.

## Superpowers Integration

If `superpowers:code-review` is available, **use it** for the diff analysis.
Otherwise, do an inline self-review following the steps below.

## Inline Self-Review (fallback)

How you read the diff depends on `gitEnabled` (see `devflow-core` Git Mode):

**`gitEnabled: true`:**
1. Run `git diff <base-branch>...HEAD` to see everything this flow added
2. For each changed file: plan-fit / bugs / debug-leftovers / coverage / convention check
3. Fix findings with additional commits on the same branch

**`gitEnabled: false`:**
1. Run `git status` (read-only) to see modified files, or list them from your edit history
2. Open each modified file and review against the same checks
3. Fix findings inline — no commits needed

In either mode:
- Check acceptance criteria from the flow — each one ticked off?

## Before Marking Done

`review → done` behaviour depends on **Self-Approval mode** (DF-302, see `devflow-core`):

**`allowSelfApproval: false`** (default — most projects):
You cannot transition. Your job stops at:
- ✅ Clean self-review complete
- ✅ `agentSummary` populated via `flow_update`
- ✅ `testingInstructions` populated via `flow_update`
- ✅ **If `gitEnabled: true`** — commits attached to the flow, PR merged
- ✅ Docs updated if applicable

Then **show the user the `gate.userMessage`** when you hit the 403, and stop. The user tests in DevFlow UI and clicks approve.

**`allowSelfApproval: true`:**
You may self-transition by emitting discipline-tokens for every skill in `gate.requiredSkills`:
1. Run `devflow_token_emit({ flowId, skillName: '<each-required-skill>', evidence: {...} })` for each
2. Then `flow_update({ flowId, currentState: 'done', selfApproved: true, disciplineTokens: [<token1>, <token2>, ...] })`
3. The audit-trail will record `code_approved_by: 'agent:devflow (selfApproved with N tokens)'`

For the `testing` step, hardcoded required skills are `devflow-verification-gate` + `devflow-adr-compliance`. Token TTL is 1 hour.

## On Reject

If the flow is rejected back to `in_progress`, call `devflow_init` again — the MCP response will include `previousFeedback`. Address it before retrying review.
