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

The flow now waits for user approval in DevFlow UI. Do not continue working on this flow — explain to the user that it is waiting for them.
