---
name: devflow-subagent-driven-dev
description: DRAFT-SKELETON. Tier-2 Pilot. Future skill for delegating in_progress tasks to per-task sub-agents in isolated worktrees. NOT YET ACTIVE — see docs/RFC_SUBAGENT_DF424.md for the architecture-decision discussion that must complete before this skill is enabled.
flow_state: in_progress
optional: true
status: draft
ported_from: NEW (DF-424 Tier-2 Pilot Discovery)
iron_laws:
  - DRAFT — Iron Laws will be finalized during the architecture sign-off flow (see RFC Q1-Q7).
  - Orchestrator-Agent stays the single owner of discipline-tokens. Sub-agents emit discovery-reports, not tokens.
  - Per-task git-worktree isolation — every sub-agent works in its own .claude/worktrees/<flowId>-task-<n>/.
  - Sub-agent spawn only for tasks > 5 minutes of work. Trivial tasks handled by orchestrator inline.
  - Result-aggregation (worktree merge) happens at the orchestrator before review submission.
---

# Skill: devflow-subagent-driven-dev (DRAFT)

> **🚧 DRAFT — not yet active.** This skill is a skeleton ahead of an actual Tier-2 implementation. The architecture is in discussion via `docs/RFC_SUBAGENT_DF424.md`. Do **not** use this skill in real flows yet.

## What this skill will do (eventually)

Take the implementation plan's task-list, classify each task by expected effort, and for tasks above a threshold (~5 minutes of agent work) spawn a fresh sub-agent in an isolated git-worktree. The sub-agent runs the task end-to-end (write tests, write code, commit) and reports completion back. The orchestrator-agent waits on all sub-agents, then merges the worktrees back to the flow's branch and submits for review.

## Open questions (RFC sign-off needed)

See `docs/RFC_SUBAGENT_DF424.md`:
- Q1: Who spawns? Orchestrator (Agent-tool) vs Backend-push vs Plugin-hook.
- Q2: How to isolate? Per-task worktree vs logical isolation.
- Q3: How to aggregate? Merge-strategy + conflict-resolution.
- Q4: Sub-agent failure → retry or escalate?
- Q5: Spawn-threshold (task-size minimum for spawn worth it).
- Q6: Token-budget per sub-agent.
- Q7: Token-ownership (orchestrator emits discipline-tokens, not sub-agents).

## When this skill becomes active

This skill is marked `status: draft` and `optional: true`. It will be promoted to active only after:

1. The RFC sign-off flow closes Q1-Q7.
2. Orchestrator-Logic is implemented in `commands/devflow-loop.md`.
3. Per-task worktree-setup is added (extending DF-285 `devflow-worktrees` Skill).
4. Result-aggregation logic is in place.
5. An end-to-end test passes with a real multi-task flow.

Until then, all real flows continue with the single-agent inline-implementation pattern from DF-411.

## Cross-references

- `docs/RFC_SUBAGENT_DF424.md` — full architecture discussion
- DF-411 `/devflow-loop` — current single-agent orchestration
- DF-413 Vision-Coverage — original Tier-2-Item source
- DF-285 `devflow-worktrees` — existing per-flow worktree pattern
- DF-192 `devflow-runner` — alternative dispatch-pattern (distributed runners, not in-process sub-agents)

## Status log

- **2026-05-21 (DF-424):** Skeleton created. Awaiting RFC sign-off.
