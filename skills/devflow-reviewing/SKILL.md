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

1. Run `git diff <base-branch>...HEAD` to see everything this flow added
2. For each changed file:
   - Does the change match the approved plan?
   - Any obvious bugs, missing error paths, leftover debug code?
   - Test coverage adequate?
   - Follows project conventions (look at neighbouring files)?
3. Check acceptance criteria from the flow — each one ticked off?
4. Fix findings with additional commits on the same branch

## Before Marking Done

The `review → done` transition is **human-only** in strict mode — you cannot do it. Your job stops at:

- ✅ Clean self-review complete
- ✅ `agentSummary` populated via `flow_update`
- ✅ `testingInstructions` populated via `flow_update`
- ✅ Docs updated if applicable

Then wait. The user tests in DevFlow UI and clicks approve (or rejects back to `in_progress` with feedback).

## On Reject

If the flow is rejected back to `in_progress`, call `devflow_init` again — the MCP response will include `previousFeedback`. Address it before retrying review.
