---
description: Show the next allowed action and step for the current flow
---

# devflow-next

Show the next allowed action and step for the current flow based on the pipeline configuration.

## Steps

1. Read `.devflow-active` in the current working directory (walk up to parent directories if needed)
2. If not present, tell user to run `/devflow-start <id>` first
3. Extract the `flowId` from the file
4. Call the pipeline endpoint via the DevFlow MCP: fetch `/api/flows/<flowId>/next-step`
5. Present the response in a clear format:
   - **Actor:** Who should work on this step (human, agent, auto, etc.)
   - **Next Step:** Description of the next action
   - **Allowed Actions:** Comma-separated list of available tools/actions
   - **Blocked?** Whether a gate is active, and who is blocked (agent or human)
   - **Retry Count:** Number of retries if in a review loop
   - **Previous Feedback:** Last rejection feedback if applicable

6. If blocked by a human gate (e.g., approval, testing):
   - Explain what the user needs to do in the DevFlow UI
   - Provide link to the flow or UI instructions
7. If blocked by an agent gate:
   - Explain what the agent needs to do
   - Suggest next step

## Example Output

```
Flow: DF-214 (plan-attachment-rendering)

Pipeline Status:
- State: in_progress
- Phase: action
- Actor: agent
- Kind: work

Next Step: Implement the attachment upload endpoint

Allowed Actions: Read, Edit, Write, NotebookEdit, task_update, flow_update

Gate Status: Not blocked

Retry Count: 0
```

## Example Output (Blocked)

```
Flow: DF-214 (plan-attachment-rendering)

Pipeline Status:
- State: approval
- Actor: human
- Kind: review

Next Step: Approve or reject implementation plan

Allowed Actions: none (agent blocked)

Gate Status: BLOCKED FOR AGENT
Human must review and approve the plan in the DevFlow UI.
Go to: https://app.dev-flow.tech/flows/DF-214

Previous Feedback: Missing acceptance criteria in Task 2
```
