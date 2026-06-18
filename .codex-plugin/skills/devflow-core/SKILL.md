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

## Git Mode (DF-302)

Every `devflow_init` response includes a `gitEnabled` boolean (from `git_settings.enabled`). Behave accordingly:

- **`gitEnabled: true`** — Project follows a git workflow. You MUST create branches, commit with Gitmoji, report `branchName` + `commits[]` via `flow_update`, and ensure a merged PR before `review → done`.
- **`gitEnabled: false`** — Project does not enforce git. **Do not run `git checkout -b`, do not produce commits, do not call `flow_update({ commits: [...] })`, do not report a PR URL.** Just edit files, run tests, and submit `agentSummary + testingInstructions` for review.

Default to **OFF** when in doubt — Beta-phase projects often have git off.

## Self-Approval Mode (DF-302)

The `devflow_init` / `next-step` response surfaces **`transitionPolicy`** for the current step (DF-434). That — not a separate `allowSelfApproval` field — tells you whether you may self-approve:

- **`transitionPolicy: 'human_only'`** — `planning → approval/ready` and `review → done` need a human Approve in the DevFlow UI. On a 403 with `gate.reason === 'human_required'`, show `gate.userMessage` verbatim and stop. Don't retry.
- **`transitionPolicy: 'agent_with_discipline'`** — Self-Approval is ON. You transition both gates yourself: emit a discipline-token via `devflow_token_emit` for every skill in `gate.requiredSkills`, then `flow_update({ currentState, selfApproved: true, disciplineTokens: [...] })`.

**When in doubt, attempt the transition — don't default to waiting.** The gate response is actionable (DF-434): a `discipline_incomplete` 403 lists exactly which tokens to emit — that's YOUR action, not a reason to wait. Only `human_required` means stop-and-wait.

Hardcoded required skills (DF-302 — source of truth: `services/pipelineOrchestrator.js` `HARDCODED_REQUIRED_SKILLS`):
- `approval` step: `devflow-collision-acknowledged`, `devflow-pattern-reuse`, `devflow-tdd`, `devflow-knowledge-completer`
- `testing` step: `devflow-verification-gate`, `devflow-adr-compliance`, `devflow-plan-reconciliation`, `devflow-knowledge-completer`

## Knowledge-Check Gate (DF-264 / DF-302)

When you call `flow_update` to transition state and the response is **403 with `gate.reason === 'missing_documentation'`**, the flow text mentions architectural topics (auth, billing, cache, api, etc) that have no ADR / Pattern / Runbook yet. The transition is blocked until each is resolved.

The 403 carries `gate.agentInstructions` — read it. Standard playbook:

1. **Don't panic, don't retry**. The list `gate.topics` tells you exactly which topics need resolution.
2. For each topic, call:
   ```
   knowledge_check_resolve({
     flowId, topic, resolutionType: 'dismiss',
     reason: '<≥10 chars explaining why this is a passing mention, not a real architectural concern>'
   })
   ```
3. If a topic IS a real architectural decision in the flow, prefer `'adr'` / `'pattern'` / `'runbook'` (link to an existing doc-page via entityType+entityId) or `'intent_defer'` (with horizon `'next-quarter'` | `'later'`).
4. After all topics are resolved, retry the original `flow_update` transition.

**Important state restriction:** `knowledge_check_resolve` is only allowed in `planning` or `in_progress`. If the gate fires in `review`/`approval`, you must:
- `flow_update({ currentState: 'in_progress' })` (or `planning`) first
- resolve every topic
- `flow_update({ currentState: 'review', agentSummary, testingInstructions })` again to re-enter review

**Proactive habit:** Before every `flow_update` to `approval` or `done`, run `knowledge_check_flow(flowId)` and resolve any banner topics. Catching them early avoids the round-trip.

## State-Specific Guidance

For deeper instructions on a specific state, use the matching skill:
- Planning → `devflow-planning`
- In progress → `devflow-executing`
- Review → `devflow-reviewing`

## Output Conventions

When listing or summarizing flows for the user, use the `devflow-flow-display` skill — it pins the Markdown-table format with ⭐ for own flows, separated lock-status, and hidden done-flows by default. Don't roll your own flow-list format.
