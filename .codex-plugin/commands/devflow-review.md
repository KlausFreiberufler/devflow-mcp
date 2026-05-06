---
description: Submit the current flow for review (transitions to 'review' state)
---

Read `.devflow-active`. Verify state is `in_progress` — otherwise explain which state is needed.

Interactively collect:
1. **Agent Summary** — what was implemented, what changed, what should the reviewer know?
2. **Testing Instructions** — how does the user verify the work? What edge cases to check?

Then call `mcp__devflow__flow_update` with:
- `flowId` from `.devflow-active`
- `currentState: 'review'`
- `agentSummary: <collected>`
- `testingInstructions: <collected>`

Confirm the transition. Remind user that the flow is now waiting for their approval in DevFlow UI.
