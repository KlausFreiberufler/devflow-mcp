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
   e. **If `gitEnabled: true`** → commit with Gitmoji prefix. **If `gitEnabled: false`** → skip the commit, just save your edits.
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

## Commits — Only if `gitEnabled: true` (DF-302)

Read `gitEnabled` from the most recent `devflow_init` response.

**`gitEnabled: true`:**
- Each task gets its own commit with a Gitmoji prefix
- Attach commits to the flow via `flow_update({ commits: [{hash, message}, ...] })` so the DevFlow UI links them
- A merged PR is required before `review → done`

Gitmoji prefixes:
- ✨ feat: new feature
- 🐛 fix: bug fix
- 📝 docs: documentation
- ♻️ refactor: refactoring
- ✅ test: tests
- 🔧 chore: tooling

**`gitEnabled: false`:**
- Do **not** run `git commit`, `git checkout`, or any other git command
- Do **not** call `flow_update({ commits: [...] })` — leave the field empty
- Just edit files in place. Tests still need to pass; a clean `agentSummary + testingInstructions` is enough

## Before Submitting Review

- All tasks in `task_list` must be `completed`
- Build passes (run project's build command)
- Tests pass
- Docs updated if applicable (check project's docs-update rule)
- **If `gitEnabled: true`** — your commits are attached to the flow
- **Knowledge-Check pre-flight**: call `knowledge_check_flow(flowId)`. For every topic that comes back without a resolution, call `knowledge_check_resolve` (`dismiss` with a reason ≥10 chars is fine for passing mentions). This is much cheaper than hitting the 403 gate during the `review` transition.

Then use `/devflow-review` to submit cleanly.

If the gate fires anyway (`gate.reason === 'missing_documentation'`), follow the playbook in `devflow-core` → "Knowledge-Check Gate". Resolve here in `in_progress`, then retry.
