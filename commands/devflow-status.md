---
description: Show the current DevFlow status (state, tasks, next step)
---

# devflow-status

Show the current DevFlow status including flow state, tasks, and next step information.

## Steps

1. Read `.devflow-active` in the current working directory (walk up to parent directories if needed)
2. If not present, explain there is no active flow and suggest `/devflow-start <id>`
3. If present, extract the `flowId` from the file
4. Call `mcp__devflow__flow_get` with the flowId
5. Summarize the response:
   - Display ID
   - Current state
   - Assignee
   - Agent status
   - Last state transition (timestamp and user)
6. Call `mcp__devflow__task_list` (if allowed in current state) and show open tasks with their acceptance criteria
7. Present all information in a clear, scannable format

## Example Output

```
Flow: DF-214 (plan-attachment-rendering)
State: in_progress
Assignee: Klaus Farber
Agent Status: implementing
Last Transition: 2026-04-17 14:30:00 (approved by Klaus)

Open Tasks:
[ ] Task 1: Implement attachment upload endpoint
    - Criteria 1
    - Criteria 2
[x] Task 2: Add form field validation
    - Criteria 1
```
