---
name: devflow-core
description: Use whenever working in a DevFlow-managed project (CLAUDE.md contains devflow_init). Explains the flow-state machine, init requirements, and error recovery.
---

# DevFlow — Core Workflow

This project uses DevFlow for structured AI development. Every change flows through a state machine enforced by the MCP server.

## State Machine

```
idea → planning → approval → ready → in_progress → review → done
```

- `approval` and `review` are **wait states** — user must act in DevFlow UI
- `ready` and `done` are **auto states** — transitioned automatically

## Start of Every Session

Before any tool call other than `flow_list`, `flow_create`, or `devflow_status`, you MUST call:

```
devflow_init({ flowId: "..." })
```

Without an active session, all MCP tools are blocked with a 403.

Use `/devflow-start <DF-XXX>` as a shortcut.

## After State Transitions

When you successfully call `flow_update` and the state changes (e.g. `approval → ready`), the MCP server's response tells you to re-call `devflow_init`. **You must do this** — the server's enforcement context resets on each state.

## The `.devflow-active` file

The MCP server writes `.devflow-active` in the project root when `devflow_init` succeeds. Hooks use it to detect the current flow. Never edit it manually.

## Error Recovery

- **403 Gate blocked:** The flow is in a state that forbids this action. Check `/devflow-next`, follow `allowedActions`.
- **400 Missing field:** The response tells you which field. For `review` transitions: `agentSummary` + `testingInstructions` are required.
- **Lease expired:** Call `devflow_init` again to refresh the session lease.

## State-Specific Guidance

For deeper instructions on a specific state, use the matching skill:
- Planning → `devflow-planning`
- In progress → `devflow-executing`
- Review → `devflow-reviewing`
