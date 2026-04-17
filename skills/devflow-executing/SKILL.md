---
name: devflow-executing
description: Use when the active DevFlow flow is in 'in_progress' state. Guides implementing the approved plan with tasks, commits, and TDD discipline.
---

# DevFlow — Execution

You are in `in_progress`. The plan has been approved. Your job: implement it task by task, tracking progress via `task_list` / `task_update`, then submit for review.

## Superpowers Integration

If `superpowers:subagent-driven-development` is available, **invoke it** for subagent-per-task execution.
If `superpowers:executing-plans` is available, **invoke it** for inline batch execution with checkpoints.
If `superpowers:test-driven-development` is available, **use it** for test-first discipline.

If none are available, follow the inline loop below.

## Inline Execution Loop (fallback)

1. Call `task_list` to get the current task state
2. For each open task:
   a. Mark `in_progress` via `task_update`
   b. Write failing test
   c. Implement minimal code
   d. Run test, verify pass
   e. Commit with Gitmoji prefix
   f. Mark `completed` via `task_update`
3. After all tasks done: verify build/tests pass globally
4. Submit for review:
   ```
   flow_update({
     flowId: <current>,
     currentState: 'review',
     agentSummary: <what was implemented>,
     testingInstructions: <how to verify>
   })
   ```

## Commits

Attach each commit to the flow via `flow_update({ commits: [...] })` so the DevFlow UI links them.

Use Gitmoji prefixes:
- ✨ feat: new feature
- 🐛 fix: bug fix
- 📝 docs: documentation
- ♻️ refactor: refactoring
- ✅ test: tests
- 🔧 chore: tooling

## Before Submitting Review

- All tasks in `task_list` must be `completed`
- Build passes (run project's build command)
- Tests pass
- Docs updated if applicable (check project's docs-update rule)

Then use `/devflow-review` to submit cleanly.
