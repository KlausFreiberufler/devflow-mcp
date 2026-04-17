---
description: Start a DevFlow session for a specific flow
argument-hint: <DF-XXX | number | flowId>
---

# devflow-start

Start a DevFlow session for a specific flow.

## Argument Resolution

Resolve the argument `$1` into a flow ID:

- If it starts with `DF-`, use as-is (e.g., `DF-214` → `DF-214`)
- If it is purely numeric (e.g., `214`), prefix with `DF-` → `DF-214`
- Otherwise pass through unchanged (assume it's a full flow ID)

## Steps

1. Resolve the flow ID from the argument using the rules above
2. Call `mcp__devflow__devflow_init` with the resolved `flowId`
3. Report the returned state, nextStep, and allowedActions in a compact summary
4. If the flow is already claimed by another agent, explain that clearly

## Example Usage

```
/devflow-start DF-214
/devflow-start 214
/devflow-start abc123xyz456
```
