---
name: devflow-worktrees
description: Use at the start of implementation (or when picking up an existing flow) to set up a dedicated git-worktree under .claude/worktrees/<displayId>-<slug>. Each flow gets its own working directory — branch isolation prevents cross-flow contamination, and the path is predictable for re-init / cross-session recovery.
flow_state: ready
hooks: []
discipline_token: devflow-worktrees
optional: true
ported_from: superpowers:using-git-worktrees
iron_laws:
  - One worktree per flow — never share a directory across flows.
  - Clean up the worktree when the flow reaches done — leftover worktrees pile up and confuse re-init.
  - Never commit from the main checkout — only from the worktree dedicated to this flow.
---

# Skill: devflow-worktrees

> **Port** of Superpowers `using-git-worktrees`. The skill that keeps each flow's working state physically separate so the agent never accidentally edits main's checkout while another flow's branch is in flight.

## When to use

- After `flow_update planning→approval` (i.e. when entering `ready` or `in_progress` for the first time on this flow).
- When picking up an existing flow whose worktree already exists — verify the path, switch into it, do not re-create.

## Path convention

```
.claude/worktrees/<displayId>-<slug>
```

Examples:
- `DF-289-hook-1-discipline-tokens` → `.claude/worktrees/DF-289-hook-1-discipline-tokens`
- `DF-292-verification-gate-self-approval` → `.claude/worktrees/DF-292-verification-gate-self-approval`

**Slug rules:** lowercase, hyphenated, max 40 chars, drop stop-words. Match the branch-slug if a feature branch already exists.

## Process

### 1 · Check for an existing worktree

```bash
git worktree list | grep <displayId>
ls .claude/worktrees/
```

If one exists for this flow → switch into it, run a quick `git status` sanity check, continue. **Do not create a duplicate.**

### 2 · Create a new worktree

```bash
# from the main checkout (project root)
BRANCH="feature/<displayId-lower>-<slug>"   # or hotfix/...
DIR=".claude/worktrees/<displayId>-<slug>"

git worktree add -b "$BRANCH" "$DIR" main
cd "$DIR"
```

Verify:
- `git status` shows the new branch.
- The worktree directory contains the project (`ls -la`).
- `node_modules` is shared via the parent — re-install only if needed (typically not).

### 3 · Work in the worktree

All edits, commits, tests, branch-pushes happen from within the worktree. The main checkout stays clean — useful for parallel flows or quick `gh pr view` lookups without checking out a different branch.

### 4 · Cleanup on done

When the flow reaches `done` (PR merged or work abandoned):

```bash
# from the project root, NOT from inside the worktree
cd <project-root>
git worktree remove .claude/worktrees/<displayId>-<slug>
# if the branch is gone (squash-merged), prune the leftover ref:
git fetch --prune
```

If `git worktree remove` complains about uncommitted changes, decide first whether to keep them; the iron law `cleanup on done` doesn't override your need to inspect ambiguous diffs.

### 5 · Optional: emit discipline-token

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-worktrees",
  "evidence": {
    "worktreePath": ".claude/worktrees/<displayId>-<slug>",
    "branch": "feature/<displayId>-<slug>",
    "createdAt": "<iso>"
  }
}
```

Today not required by any pipeline-step; future projects may add it.

## Iron Laws

> **One worktree per flow — never share a directory across flows.**
>
> **Clean up the worktree when the flow reaches done.**
>
> **Never commit from the main checkout — only from the worktree dedicated to this flow.**

## Cross-session recovery

When `devflow_init` is called for a flow that has a worktree-marker (today: by convention `.claude/worktrees/<displayId>-...`), the agent should:

1. List `.claude/worktrees/` and look for a directory matching the flow.
2. If found → confirm with the user "switch into existing worktree?" before doing anything else.
3. If not found → fall back to step 2 of the Process above.

Future enhancement: persist the path in `flow.metadata.worktree_path` so re-init across machines or reproducibility scenarios doesn't depend on local filesystem state. Out-of-scope for DF-295 — the convention-based lookup is enough for today's single-developer workflow.

## Output contract

- Worktree directory exists at the canonical path.
- The active session has `cwd` set to the worktree (or the agent's `cd` was issued).
- `.gitignore` already excludes `.claude/worktrees/` (DF-291 fix).
- After done: directory removed; `git worktree list` no longer shows it.

## Related

- [[migration-test-strategy]] — Säule A
- [[knowledge-gated-workflow]] — Stage 7 in the visual diagram (right before per-task-loop)
- DF-295 — port flow (this implementation)
- DF-291 — added `.claude/worktrees/` to `.gitignore`
- Superpowers v5.0.7 — `using-git-worktrees` (original skill)
