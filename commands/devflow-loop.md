---
description: Run a flow autonomously until every backend gate is green
argument-hint: [flowId] [--max-iterations N] [--verify "<shell-cmd>"]
---

# devflow-loop

Run the active flow end-to-end without leaving the session. The Stop-Hook (DF-405) holds you in until the backend's `flowGate` service confirms every condition is green. Discipline-tokens are emitted explicitly per state, and knowledge-resolution is callable in `review` (DF-408) so the `pending_drafts_resolved` gate never traps you in a catch-22.

This command is the orchestrator. It does NOT replace the per-state skills (`devflow-planning`, `devflow-executing`, `devflow-reviewing`, …) — it sequences them.

## Foundation it relies on

- **DF-405** — Stop-Hook returns exit 2 + precise stderr-reinject if you try to end the session in a non-wait state. This makes the loop self-correcting.
- **DF-323** — `pre-flow-update-self-approval.js` hook surfaces required-skills automatically on every `flow_update` attempt.
- **DF-408** — `KNOWLEDGE_RESOLUTION_TOOLS` (knowledge_draft_accept/reject, knowledge_check_resolve, intent_resolve) callable in `approval` + `review`. No backward-transition workaround needed.
- **`pipelineOrchestrator.HARDCODED_REQUIRED_SKILLS`** — single source of truth for which discipline-tokens each transition needs.

## Argument Resolution

- `$1` is optional `flowId`. Resolve:
  - Starts with `DF-` → use as-is
  - Purely numeric (e.g. `214`) → prefix `DF-` (`DF-214`)
  - Otherwise → pass through (assume full flow id like `1779181904709-l4pfwtyvu`)
  - If missing → read `.devflow-active` in the repo root and use its `flowId` field
- `--max-iterations N` → integer, default `40`
- `--verify "<shell-cmd>"` → shell command to run before `review`. Its stdout/stderr is captured into `testingInstructions` field. If absent, use the project's `verify` script if it exists in `package.json`, otherwise skip and note in `testingInstructions` that verification was manual.

## Iron Laws

- **Only use real MCP tools.** `devflow_init`, `flow_get`, `flow_update`, `devflow_token_emit`, `devflow_tokens_list`, `knowledge_check_flow`, `knowledge_check_resolve`, `knowledge_draft_create`, `knowledge_draft_accept`, `knowledge_draft_reject`, `task_create`, `task_update`, `task_list`, `planning_context`, `wiki_get_briefing`, `pending_work`, `flow_upload`. Never invent tool names.
- **No "should work" claims.** Every acceptance criterion gets evidence from the `--verify` command's actual output. Capture stdout verbatim into `testingInstructions`.
- **Never hand-fabricate tokens.** All discipline-tokens come from `devflow_token_emit({flowId, skillName, evidence})`. The backend signs them; the unsigned token is returned once.
- **Respect the gate.** A 409 response carries `gate.failures[]` with named conditions (e.g. `plan-required`, `tasks-required`, `agent-summary`, `testing-instructions`, `adr-compliance-clean`, `pr-state-consistent`). Fix the named field, then retry the SAME transition. Never invent fields the gate didn't mention.
- **Stop-Hook does the policing.** You cannot legitimately end the session in `idea` / `planning` / `ready` / `in_progress`. If you think you're done, transition forward — the Stop-Hook will reject premature exit otherwise (`DEVFLOW_STOP_HOOK_SOFT=1` is the only override and is gated).

## State-machine Loop

For each iteration up to `--max-iterations`:

1. Call `flow_get(flowId)` to read the current state.
2. Branch on `currentState`:

### `idea` → `planning`

- Read flow description + AC.
- Call `flow_update({flowId, currentState: 'planning'})`.

### `planning` → `approval`

- Call `planning_context({flowId})` for context bundle.
- Call `wiki_get_briefing({flowId})` for related ADRs/patterns.
- Call `pending_work({tags, paths, excludeFlowId: flowId})` to surface parallel work.
- Invoke `devflow-planning` skill: write `implementationPlan` markdown (Goal / Scope / Steps / AC / Verification — see skill template).
- Call `knowledge_check_flow({flowId})` for pre-flight check. For every topic returned without resolution, call `knowledge_check_resolve` (prefer `extend` over `dismiss` — Iron Law of the LLM-Wiki).
- Call `flow_update({flowId, currentState: 'approval', implementationPlan})`.

### `approval` → `ready`

- Emit 4 discipline-tokens via `devflow_token_emit` for the approval-stage required skills (source: `pipelineOrchestrator.HARDCODED_REQUIRED_SKILLS.approval`):
  - `devflow-collision-acknowledged` — evidence: parallel-flows checked, no collisions
  - `devflow-pattern-reuse` — evidence: primary pattern cited
  - `devflow-tdd` — evidence: test-first approach planned
  - `devflow-knowledge-completer` — evidence: wiki gaps closed via `extend` not `dismiss`
- Call `flow_update({flowId, currentState: 'ready', selfApproved: true, disciplineTokens: [4 tokens]})`.
- If 403 with `gate.userMessage` (self-approval disabled for this project), show the message verbatim and stop. Do not retry.

### `ready` → `in_progress` (auto)

- Call `devflow_init({flowId})` — backend auto-advances `ready → in_progress`.

### `in_progress` → `review`

- Call `task_list({flowId})`. For each pending task:
  - Mark `in_progress` via `task_update`.
  - Write failing test, implement minimal code, verify pass (TDD per task — `devflow-tdd` discipline).
  - If `gitEnabled: true`: commit with Gitmoji prefix. Attach commit hash via `flow_update({commits: [{hash, message}]})`.
  - Mark `completed` via `task_update`.
- After all tasks `completed`:
  - Run `--verify` shell command. Capture stdout/stderr. If exit != 0, fix and re-run. Treat output as evidence.
  - If `gitEnabled: true`: ensure all commits are attached to the flow; create PR via `gh pr create`; record `prNumber`, `prUrl`, `prState: 'open'`, `branchName`, `commits` via `flow_update`.
  - Write `agentSummary` (what changed + why, ~10–30 lines).
  - Write `testingInstructions` (verbatim `--verify` output + manual smoke steps).
- Pre-flight knowledge-check before `review`: call `knowledge_check_flow({flowId})`, resolve all warnings (prefer `extend`).
- Optional: create new `knowledge_draft_create` entries for runbooks/patterns discovered during execution. Then `knowledge_draft_accept` them (DF-408 allows this in `review` too if you forgot here).
- Call `flow_update({flowId, currentState: 'review', agentSummary, testingInstructions, prNumber?, prUrl?, prState?, branchName?, commits?})`.

### `review` → `done`

- If `gitEnabled: true` and `prState !== 'merged'`: the PR must be merged first. Either merge it (`gh pr merge <N> --merge -R <owner/repo>`) or stop with a clear message "PR needs review/merge — stopping here, re-run after merge".
- Emit 4 discipline-tokens for the testing-stage required skills (source: `pipelineOrchestrator.HARDCODED_REQUIRED_SKILLS.testing`):
  - `devflow-verification-gate` — evidence: AC-by-AC verification commands + outputs
  - `devflow-adr-compliance` — evidence: touched files vs ADR affects_paths, no violations
  - `devflow-plan-reconciliation` — evidence: per-AC table done/partial/missing/extra, all addressed
  - `devflow-knowledge-completer` — evidence: pending drafts resolved (or `extend`-merged)
- Any pending knowledge-drafts blocking the gate? Use `knowledge_draft_accept` / `knowledge_draft_reject` (allowed in `review` since DF-408).
- Call `flow_update({flowId, currentState: 'done', selfApproved: true, disciplineTokens: [4 tokens]})`.

### `done` → exit success

- Print summary block (see Output Contract below).
- Loop terminates.

## Gate-failure Handling

If any `flow_update` returns 409 with `gate.failures[]`:

1. Read each failure object — it names a precise condition (`plan-required`, `tasks-required`, `agent-summary`, `testing-instructions`, `knowledge-gaps-resolved`, `pr-state-consistent`, `adr-compliance-clean`, `pending_knowledge_drafts`).
2. Fix the named field on the flow:
   - `plan-required` → run `devflow-planning` skill, set `implementationPlan`.
   - `tasks-required` → create tasks via `task_create` (or include `**AC-1:**` / `**AC-2:**` markers in the plan).
   - `agent-summary` → write `agentSummary`.
   - `testing-instructions` → write `testingInstructions`.
   - `knowledge-gaps-resolved` → call `knowledge_check_flow` + resolve.
   - `pending_knowledge_drafts` → call `knowledge_draft_accept` / `reject` for each.
   - `pr-state-consistent` → set correct `prState` / `prUrl`.
   - `adr-compliance-clean` → check `affects_paths` of accepted ADRs vs touched files; resolve violations or mark `break-by-design` with reason ≥ 10 chars.
3. Retry the same transition with the corrected fields.
4. Never invent new fields the gate didn't mention.

## Iteration Cap

Track an iteration counter (mental, not persistent). After `--max-iterations` total iterations without reaching `done`, abort and print:

```
⚠ <DF-ID> not done after N iterations
  · last state: <state>
  · blocking gate: <condition>
  · last failure: <message verbatim>
  · suggested next: <concrete action from the gate hint>
```

This is not a silent failure — the abort message is the handover note for the user.

## Output Contract

When the flow reaches `done` AND all gates pass:

```
✓ <DF-ID> shipped
  · N state transitions completed
  · M discipline-tokens emitted
  · K new knowledge-drafts proposed + accepted
  · verify: <one-line summary of --verify result>
  · PR: <prUrl> (merged) — if gitEnabled
```

## Notes & Out of Scope

- **Visual-regression as a gate** is NOT implemented in this command. An earlier vision-spec referenced a visual-regression token — that token does not exist in `pipelineOrchestrator.HARDCODED_REQUIRED_SKILLS`. A future flow can add it.
- **Pre-edit ADR-glob block** is NOT implemented as a pre-edit hook. ADR-compliance is checked at `flow_update` transition time via `adr-compliance-clean` gate condition. A future flow could add pre-Edit hook enforcement.
- **`modifiedToolInput` pre-hook injection** (the DF-323 gap) — this command emits tokens explicitly as belt-and-braces. When that gap is closed in a future flow, the explicit emit-block in this command becomes a no-op safety.
- **Sub-agent per task** — not built in. If `superpowers:subagent-driven-development` becomes a real skill in the project, the `in_progress` section can be extended; for now, run tasks inline.
- **Multi-flow / Vision-Container** (Tier 2 roadmap) — out of scope. This command runs a single flow. Multi-flow orchestration is a separate design.

## Example Usage

```
/devflow-loop DF-214 --max-iterations 40 --verify "npm test && npm run lint"
/devflow-loop                                            # uses .devflow-active
/devflow-loop 214 --verify "cd backend && npm run test:api"
```

After invocation, do not exit the session — the Stop-Hook will block you if the flow is in `idea/planning/ready/in_progress` and your `--max-iterations` budget is not exhausted.
