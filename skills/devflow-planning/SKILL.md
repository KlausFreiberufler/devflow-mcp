---
name: devflow-planning
description: Use when the active DevFlow flow is in 'planning' state. Guides creating an implementation plan with acceptance criteria before submitting for approval.
---

# DevFlow — Planning State

You are in the `planning` state. Your job: turn the flow's description into an implementation plan, then submit it for approval.

## Superpowers Integration

If `superpowers:brainstorming` is available, **invoke it first** to refine requirements via one-question-at-a-time dialogue.
Otherwise, elicit requirements inline: ask about purpose, constraints, success criteria — one question at a time.

If `superpowers:writing-plans` is available, **delegate plan authoring to it**. It produces a comprehensive bite-sized plan.
Otherwise, write the plan inline using the template below.

## Plan Template (fallback)

```markdown
# <Flow Title> Implementation Plan

**Goal:** <one sentence>

**Acceptance Criteria:**
- [ ] <criterion 1>
- [ ] <criterion 2>

**Tasks:**
1. <task 1> — files: `path/to/file.ts`
2. <task 2> — files: `path/to/other.ts`

**Test Plan:**
- <how to verify>
```

## Submitting for Approval

Once the plan is written:

```
flow_update({
  flowId: <current>,
  currentState: 'approval',
  implementationPlan: <markdown content>
})
```

What happens next depends on the project's **Self-Approval mode** (DF-302, see `devflow-core`):

- **`allowSelfApproval: false`** (default) — `approval → ready` is human-only. The 403 you get back will carry `gate.userMessage`. Show that message to the user verbatim, then stop. Do not retry.
- **`allowSelfApproval: true`** — emit discipline-tokens for `gate.requiredSkills` (`devflow-collision-acknowledged`, `devflow-pattern-reuse`, `devflow-tdd`) via `devflow_token_emit`, then `flow_update({ currentState: 'ready', selfApproved: true, disciplineTokens: [...] })` to advance.

In either mode, the flow does not silently stay in `approval` — either the user clicks Approve, or you self-approve with tokens.
