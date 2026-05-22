---
name: devflow-subagent-driven-dev
description: DRAFT-SKELETON. Tier-2 Pilot. Future skill for delegating in_progress tasks to per-task sub-agents in isolated worktrees. NOT YET ACTIVE — RFC sign-off via DF-427 closed Q1-Q7. Skill remains status:draft until the implementation roadmap (8 sub-flows, 3-4 weeks) lands.
flow_state: in_progress
optional: true
status: draft
ported_from: NEW (DF-424 Tier-2 Pilot Discovery → DF-427 RFC Closure)
iron_laws:
  - Orchestrator-Agent is the single owner of all flow-level discipline-tokens. Sub-agents emit only per-task discovery-reports, never discipline-tokens.
  - Every sub-agent works in its own git-worktree at .claude/worktrees/<flowId>-task-<n>/ — no shared filesystem state, no logical-only isolation.
  - Sub-agent spawn ONLY for tasks ≥ 5 estimated agent-minutes. Trivial tasks (≤2 min) always handled by orchestrator inline. Threshold configurable via project_configs.subagent_spawn_threshold_minutes.
  - Per-sub-agent token-budget is hard-capped at project_configs.subagent_max_tokens (default 30 000). Budget-exhaust escalates immediately to orchestrator-inline; no retry-burn.
  - Sub-agent failure → max 3 retries (same-prompt + failure-report → different-approach hint → fresh attempt). On attempt 4, orchestrator picks the task up inline. On orchestrator-also-failing, the task is marked blocked and the user is the next stop. No silent drops.
  - Worktree merges happen at the orchestrator in topological-dependency order. Squash-merge per task, message format feat(task-N) <summary> [sub-agent <session-hash>]. Conflicts that orchestrator cannot resolve automatically → mark task blocked + comment + abort the spawn-pass.
  - Sub-agents NEVER call flow_update. Only the orchestrator transitions the flow. Sub-agent reports go into the orchestrator's discipline-token evidence under subagent_evidence [{taskId, cycle, evidence}].
  - Iron Law "extend > dismiss" applies at the orchestrator level. Sub-agent discovery-reports surface knowledge-gaps to the orchestrator, which resolves them in the standard pipeline-order.
---

# Skill: devflow-subagent-driven-dev (DRAFT)

> **🚧 DRAFT — not yet active.** This skill remains a draft even though the architecture is *signed off*. DF-427 (2026-05-22) closed all 7 open questions from the DF-424 RFC; the Iron Laws above are now authoritative. The skill stays `status: draft` until the 8-flow Implementation Roadmap (see `docs/RFC_SUBAGENT_DF424.md` → "Closure (DF-427)") ships. Do **not** spawn sub-agents from real flows yet — the orchestrator-logic, worktree-extension, and aggregation code do not exist.

## What this skill will do (eventually)

Take the implementation plan's task-list, classify each task by expected effort, and for tasks above a threshold (~5 minutes of agent work) spawn a fresh sub-agent in an isolated git-worktree. The sub-agent runs the task end-to-end (write tests, write code, commit) and reports completion back. The orchestrator-agent waits on all sub-agents, then merges the worktrees back to the flow's branch and submits for review.

## Architecture (closed by DF-427)

All 7 open questions from DF-424 are resolved. The full Q→Decision mapping with reasoning and pseudocode lives in `docs/RFC_SUBAGENT_DF424.md` → "Closure (DF-427)". Summary:

- **D1 (Spawn):** Orchestrator-Agent calls Claude-Code `Agent`-tool inline.
- **D2 (Isolation):** Per-task git-worktree at `.claude/worktrees/<flowId>-task-<n>/`.
- **D3 (Aggregation):** Orchestrator merges sequentially in topo-dependency-order; semantic conflicts escalate to `task: blocked`.
- **D4 (Failure):** 3-retry pattern; orchestrator-takeover on retry-4; user-escalation if orchestrator also fails.
- **D5 (Threshold):** ≥ 5 estimated agent-minutes for sub-agent spawn. Configurable per project.
- **D6 (Budget):** 30k tokens hard-cap. Configurable per project. Budget-exhaust = orchestrator-takeover.
- **D7 (Tokens):** Orchestrator owns all flow-level discipline-tokens; sub-agents emit only per-task discovery-reports.

## When this skill becomes active

This skill is marked `status: draft` and `optional: true`. **RFC sign-off is done (DF-427).** The skill will be promoted to active only after the 8-flow Implementation Roadmap completes:

1. ✅ **RFC sign-off (DF-427)** — Q1-Q7 closed.
2. ⬜ **Architecture-Setup** — schema migrations (`project_configs.subagent_*` + `flow_token_usage.sub_agent_id`).
3. ⬜ **Per-Task Worktree** — extend DF-285 from per-flow to per-task.
4. ⬜ **Orchestrator-Logic in `/devflow-loop`** — task-classifier + spawn-loop + merge-sequence.
5. ⬜ **Sub-agent type + prompt-template** — register `devflow-subtask`.
6. ⬜ **Result-aggregation logic** — conflict-resolution + report-aggregation.
7. ⬜ **Token-Tracking per sub-agent** — `flow_token_usage.sub_agent_id`.
8. ⬜ **E2E Test** — real flow with 5-10 tasks via sub-agent pilot.

After step 8 passes, skill flips to `status: active`, `optional: true` (eventually `required` once stable).

Until then, all real flows continue with the single-agent inline-implementation pattern from DF-411.

## Cross-references

- `docs/RFC_SUBAGENT_DF424.md` — full architecture discussion
- DF-411 `/devflow-loop` — current single-agent orchestration
- DF-413 Vision-Coverage — original Tier-2-Item source
- DF-285 `devflow-worktrees` — existing per-flow worktree pattern
- DF-192 `devflow-runner` — alternative dispatch-pattern (distributed runners, not in-process sub-agents)

## Status log

- **2026-05-21 (DF-424):** Skeleton created. Awaiting RFC sign-off.
- **2026-05-22 (DF-427):** RFC closure landed. Iron Laws finalized (8 laws above). Skill remains `status: draft` — Implementation roadmap (steps 2-8) is the next gate.
