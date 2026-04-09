---
name: devflow-workflow
description: Initialize and manage DevFlow sessions for structured AI development. Use when starting any coding task in a DevFlow-managed project, when you see a CLAUDE.md mentioning devflow_init, or when the user asks about flows, tasks, or plans.
---

# DevFlow Workflow

You are working in a project managed by DevFlow. DevFlow enforces structured development through flows (features/hotfixes) with planning, approval, implementation, and review gates.

## Getting Started

Before writing any code, you MUST initialize a DevFlow session:

1. Call `devflow_status()` to check if this project uses DevFlow
2. If managed (`managed: true`):
   - Call `flow_list()` to find available flows
   - Call `devflow_init({ flowId: "<id>" })` to start your session
   - OR call `flow_create({ summary: "..." })` to create a new flow
3. **Without `devflow_init`, all tools are blocked.**

## Flow States

```
idea -> planning -> approval -> ready -> in_progress -> review -> done
```

- **idea**: New idea, no plan yet
- **planning**: Agent creates implementation plan
- **approval**: User approves the plan (wait state)
- **ready**: Plan approved, ready for implementation
- **in_progress**: Implementation in progress
- **review**: User reviews the implementation (wait state)
- **done**: Completed

## Rules

- **Always follow the server's instructions**: Check `allowedActions` and `nextStep` in every response
- **Never skip states**: Follow the flow state machine strictly
- **Tasks are mandatory**: Create tasks with acceptance criteria before implementing
- **Review requires summary**: Moving to `review` requires `agentSummary` and `testingInstructions`
- **Git discipline**: Use feature branches, meaningful commits, and create PRs

## Common Commands

| Action | Tool |
|--------|------|
| Check status | `devflow_status()` |
| List flows | `flow_list()` |
| Start session | `devflow_init({ flowId: "..." })` |
| Create flow | `flow_create({ summary: "..." })` |
| Update flow | `flow_update({ flowId: "...", currentState: "..." })` |
| Create task | `task_create({ flowId: "...", summary: "..." })` |
| Complete task | `task_update({ taskId: "...", isCompleted: true })` |
