---
name: devflow-planning
description: Use when the active DevFlow flow is in 'planning' state. Guides creating an implementation plan with acceptance criteria before submitting for approval.
---

# DevFlow — Planning State

You are in the `planning` state. Your job: turn the flow's description into a concrete implementation plan, then submit it for approval.

## Iron Law — Plan goes to the flow, not the repo

- **Write the plan inline.** Never create files like `plans/foo.md`, `docs/PLAN.md`, or any other repo-resident plan artifact.
- **Submit via `flow_update({implementationPlan: <markdown>})`.** The backend automatically uploads it as `implementation-plan.md` Attachment to the flow (DF-212 mechanism, see ADR-032 Plan Schema).
- **Do not run an interactive dialogue with the user.** If the flow's description is unclear, re-read it with the available context (`planning_context`, `wiki_get_briefing`, `pending_work`) and make explicit assumptions in the plan body. The user reviews the whole plan at approval time — that is the moment for corrections, not a turn-by-turn clarification loop.

The plan lives with the flow. Anyone can re-read it from `flow_get` or the UI's PlanningStateView at any time. Repo-files would diverge from flow state immediately.

## Plan Template

````markdown
# <Flow Title> Implementation Plan

## Goal
<one paragraph, what success looks like>

## Scope
**Files to change:**
- `path/to/file.ts` — <what changes>

## Out of scope
- <items deliberately deferred or excluded — link to follow-up flow ids where applicable>

## Implementation Steps
### Step 1 — <imperative name>
<concrete actions, including file paths and pseudo-code if helpful>

### Step 2 — <imperative name>
<...>

## Acceptance Criteria
- [ ] AC-1: <criterion + how to verify>
- [ ] AC-2: <...>

## Tasks (will be created in `in_progress`)
1. <task title> — touches: `path/to/file`
2. <...>

## Risks
- <each risk + mitigation>

## Verification
- AC-1: `<exact command>` → expected output
- AC-2: `<...>`
````

Adjust sections to fit the flow. Keep ACs concrete and command-verifiable.

## Knowledge-Check pre-flight

Before submitting the plan to `approval`, run `knowledge_check_flow(flowId)`. The response lists topics in the plan text that have no ADR / Pattern / Runbook yet. For each, call `knowledge_check_resolve` — **prefer `extend` over `dismiss`** (Iron Law of the LLM-Wiki; the backend enforces this when an extend-target exists).

The pre-tool-use hook on `flow_update` auto-resolves most warnings in bulk, but running the check yourself surfaces gaps you can close intentionally rather than as a side-effect.

## Submitting for Approval

When the plan is ready:

```
flow_update({
  flowId: <current>,
  currentState: 'approval',
  implementationPlan: <markdown content of the plan, exactly as written above>
})
```

What happens at the backend (since DF-212):

1. `flows.implementation_plan` field is set to the markdown text (kept for backward-compat).
2. The same content is auto-uploaded as `implementation-plan.md` Attachment (`kind: 'plan'`, ADR-032 schema).
3. UI `PlanningStateView` renders the Attachment with field-fallback.
4. The pre-tool-use hook chain runs: `knowledge-auto-resolve`, `plan-critic`, `code-critic`, `self-approval`.

What happens next depends on the project's **Self-Approval mode** (DF-302, see `devflow-core`):

- **`allowSelfApproval: false`** (default for old projects) — `approval → ready` is human-only. The 403 you get back carries `gate.userMessage`. Show that message to the user verbatim, then stop. Do not retry.
- **`allowSelfApproval: true`** (default for new projects since DF-313) — emit discipline-tokens for `gate.requiredSkills` (`devflow-collision-acknowledged`, `devflow-pattern-reuse`, `devflow-tdd`, `devflow-adr-compliance`) via `devflow_token_emit`, then `flow_update({ currentState: 'ready', selfApproved: true, disciplineTokens: [...] })` to advance.

In either mode, the flow does not silently stay in `approval` — either the user clicks Approve, or you self-approve with tokens.

## Cross-references

- DF-212 — Plan-as-Attachment auto-upload (April 2026, done)
- ADR-032 — Knowledge Wiki Flow-Attachment-Schema (Plan/Design/Decision)
- DF-313 — Self-Approval default ON for new projects
- DF-406 — this skill's most recent refactor (removed external agent-delegation patterns + interactive-dialogue loop)
- Discipline-skills: `devflow-collision-acknowledged`, `devflow-pattern-reuse`, `devflow-tdd`, `devflow-adr-compliance`
