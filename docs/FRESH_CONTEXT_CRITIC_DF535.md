# Fresh-Context Review — Critic Subagents Instead of Self-Review (DF-535)

## Why this exists

`devflow-code-critic` (DF-339) used to be a **self**-critique: before `in_progress → review` the agent put on a reviewer hat and walked its own diff against 7 quality dimensions. The hat is the problem. A self-review runs in the same context window that produced the code, so the author's reasoning is already in scope — and a premise that is in scope gets *inherited*, not *tested*. That is the **anchoring effect**, and it is not a rhetorical risk. It has a paid-for receipt.

### Evidence case: DF-520 R3

DF-520 (Ritual-Schedules) went through three rounds:

| Round | Self-review verdict | Human verdict |
|---|---|---|
| R1 | approved | `code_rejected` |
| R2 | approved | `code_rejected` |
| R3 | — | the actual bug surfaced |

The premise nobody questioned for two rounds: *"`CronExpressionParser.parse()` validates the expression."* It does not. A malformed field — a bare `'L'` in the weekday slot — parses fine and only throws on the first `.next()`. So one `PUT` persisted a broken cron **before** the next-run was computed, and every later `GET`/`PUT` for that ritual answered 500, permanently. The fix was one line (call `.next()` inside the validator and reject what throws).

Two self-reviews could not see it, because the justification for the validator was sitting in the same context as the review of the validator. A reviewer who receives only the diff and the acceptance criteria has no premise to inherit. They ask "does `parse()` actually reject every malformed field?" — and run it.

**DF-535 makes the fresh-context dispatch the primary mode of `devflow-code-critic`.** The 7 dimensions are unchanged; what changes is *who answers*.

## What changed

| File | Change |
|---|---|
| `packages/skills/skills/devflow-code-critic/SKILL.md` | New primary mode: fresh-context dispatch. Three lenses, dispatch contract with an explicit context boundary, `review_mode` + `reviewers[]` in the verdict, re-dispatch rule, self-persona fallback, new anti-patterns (4 → 8). Iron laws 5 → 7. |
| `scripts/pre-flow-update-code-critic.js` | The pre-tool-use reminder now leads with the dispatch (lenses, boundary, "subagents report, they never fix") and names the fallback as the exception, not the default. |
| `packages/skills/skills/devflow-receiving-review/SKILL.md` | Counter-reference: the critic is now the main upstream source of findings, and subagent findings are triaged exactly like human ones. |
| `packages/skills/index.json` | Regenerated: new description + iron-law count 5 → 7 for `devflow-code-critic`. The rebuild also corrects a **pre-existing** drift in the `devflow-subagent-driven-dev` row — in two places: the iron-law count still read 5 while that skill's frontmatter has long carried 8, and its description still pointed at the open RFC discussion although DF-427 closed it on 2026-05-22. That skill's body is untouched by DF-535; only its index row had drifted from its frontmatter. |
| `scripts/tests/df535-fresh-context-critic.test.js` | 7 pinning tests, wired into `npm test`. |

## The dispatch contract

Dispatch **2–3 reviewer subagents** (Claude Code `Agent`/Task tool), one lens each, in parallel — one message, multiple tool calls. Use an agent type **without** `Edit`/`Write` (e.g. `feature-dev:code-reviewer`, `Explore`). They read the repo themselves; they never touch it.

**Pick the agent type per lens, not once for all three.** `correctness` and `security` only read — `feature-dev:code-reviewer` fits. `does-it-reproduce` has to *execute* the suite, so it needs a type that can start a command (e.g. `Explore`): `feature-dev:code-reviewer` ships without `Bash` — only `KillShell`/`BashOutput`, which attach to an already-running shell. Dispatched to that type, the lens would review the tests by reading them and report as if it had run them — exactly the failure mode it exists to catch.

### Context boundary

| Crosses into the dispatch prompt | Stays on the author's side |
|---|---|
| The `git diff` (or diff range + repo path) | The author's assumptions and rationale |
| The acceptance criteria, **verbatim** | "I already checked X", "this is safe because Y" |
| The approved plan excerpt — scope and tasks | The author's verdict from a previous iteration |
| Repo path + the command to run the tests | Findings the author already dismissed |

The right-hand column is the whole point. Pasting "I already verified X" into the dispatch prompt re-creates the DF-520 R3 failure *inside* a fresh context — the skill lists this as the first anti-pattern ("leaking the anchor").

### The three lenses

| Lens | Question it answers | Dimensions |
|---|---|---|
| `correctness` | Is every AC really implemented (not just touched)? Bugs? Does the diff match the approved plan — anything added beyond it, anything planned and silently dropped? | 1 · 5 · 7 |
| `security` | Walk the project's **Security Hygiene Checklist** (CLAUDE.md) against this diff: `requireAuth`, `requireProjectAccess`/`requireFlowAccess`, resource→project resolution before the first DB read, DB-layer `userId` filters, `dangerouslySetInnerHTML`, `iframe sandbox`, token storage, cross-access test entry. | 4 · 7 |
| `does-it-reproduce` | Were the tests actually **executed**, or only written? Run them. Would the assertions fail if the code regressed, or would they pass against a stub? Is every AC backed by a command whose output was really captured? | 2 |

Each finding carries `severity`, `location`, `observation`, `repro` and `suggestion`. A `high` finding without a `repro` command is a suspicion, not a finding — the lens gets sent back for it.

A lens that errors out or returns nothing usable is `status: "failed"` — re-dispatch it once. If it fails again, the author covers that lens' dimensions themselves and the entry stays in `reviewers[]` marked `failed`, so the gap remains visible. `review_mode` stays `fresh-context` as long as at least one lens actually crossed the boundary: the field says how the review was produced, not how completely.

### What stays with the author

The subagents cannot judge everything; these need the flow, wiki and history in context:

- **Dimension 3 · Iron-Laws** — was TDD really RED-first, was a pattern reused, extend > dismiss, collisions acknowledged.
- **Dimension 6 · Knowledge-Drafts** — did this work surface a pattern, runbook or ADR-worthy decision.
- **Triage** — every finding goes through **`devflow-receiving-review`**: Critical/Important/Minor, technically verified, accepted or rejected with a written reason. Never blind-accept a subagent (a fresh reviewer has no flow history and will sometimes flag intended behaviour), never blind-reject one (it also has no stake in the code).

### Iteration

Iteration 1 dispatches all three lenses. On iteration 2+ only the lenses that produced high-findings are re-dispatched — a clean lens would read the same code twice. Exception: if a fix touches a file a clean lens owns (a security-relevant path, a test file), that lens is re-dispatched too. Hard cap stays at 3 iterations.

Trivial flows still exit via `approved-trivial` with **no dispatch at all** — three subagents for a typo fix is waste. All four skip conditions have to hold: ≤ 2 tasks, no schema change, no new endpoint, **and** no tag in `force_critic_tags` (project config, `['security','breaking']` by default). A one-task flow tagged `security` is dispatched like any other — the shortcut is for small work, not for risky work that happens to be small.

## Fallback matrix (ADR-135 tiers)

Not every client can spawn a subagent. **ADR-135 — Multi-Client Plugin-Strategie: 3-Tier Support** (originating flow DF-327, accepted 2026-05-06) defines who receives what; as of DF-535 only Claude Code has an equivalent of the `Agent` tool.

| Client | ADR-135 tier | Subagent tool | Review mode |
|---|---|---|---|
| Claude Code | reference client (full plugin) | yes | `fresh-context` — the primary mode |
| Codex | Tier 1 — full plugin | no | `self-persona-fallback` |
| Gemini | Tier 1 — full plugin | no | `self-persona-fallback` |
| Cursor | Tier 2 — thin plugin | no | `self-persona-fallback` |
| Cline | Tier 2 — thin plugin | no | `self-persona-fallback` |
| Windsurf | Tier 3 — MCP-only | n/a | no skill delivered — the pipeline gates remain the only guard |
| Continue | Tier 3 — MCP-only | n/a | no skill delivered — the pipeline gates remain the only guard |

The check is **capability-based, not client-name-based**: if a client gains a subagent tool, it flips back to `fresh-context` without a change to this matrix.

The fallback is the original critic-persona self-review — *"if this came from a junior dev, what would I flag?"* — walking the 7 dimensions alone with the three lenses as checklists. It is a weaker review and must be **declared, not hidden**:

```json
{ "review_mode": "self-persona-fallback", "reviewers": [] }
```

An empty `reviewers[]` on its own is not the fallback signal — an `approved-trivial` skip is empty too; read it together with `review_mode`. The slug `self-persona-fallback` is greppable on purpose: it makes the weaker mode auditable across flows. Not having felt like dispatching is not a fallback reason, and claiming `review_mode: "fresh-context"` for a solo review is an anti-pattern the skill names explicitly ("fake fresh-context").

## Boundaries — what this is *not*

### Not the engine gates (QA + Faktencheck)

The Factory app (devflow-desktop) runs its own judges **after** the builder finishes: `RunnerEngine.finishChain` starts `QAGate` and `HallucinationGate` (Faktencheck) concurrently, then Stakeholder → AutoMerge → ReleaseReadiness. Different layer, on purpose:

| | `devflow-code-critic` (DF-535) | Engine gates (QA / Faktencheck) |
|---|---|---|
| Where | inside the author's session, in the client | separate headless `claude` processes, spawned by the app |
| When | **before** `in_progress → review` | **after** the flow reports finished |
| Tools | read-only repo access via the client's Agent tool | repo read access, **no MCP config on purpose** — a judge must not be able to move the flow it judges |
| Effect of a finding | advisory — the author triages and fixes | blocking — a FAIL stops the chain, skips the merge, returns the flow to the builder (WF-119) |
| On no verdict | the author still owes a verdict | fail-open: inconclusive lets the chain proceed |

They are complementary, not redundant: the critic catches things before a human or judge ever sees them; the gates are the outside check that does not depend on the author running anything. Neither replaces the other — DF-535 does not touch the engine gates at all.

### Not `devflow-subagent-driven-dev`

That skill (DF-424/DF-427, `status: draft`, **not active**) fans out **implementation**: per-task sub-agents that write tests and code in isolated worktrees, which the orchestrator merges back. Opposite direction of information flow:

| | `devflow-code-critic` fresh-context | `devflow-subagent-driven-dev` |
|---|---|---|
| Subagent role | reviewer | implementer |
| Writes code | never — reports only | yes, in `.claude/worktrees/<flowId>-task-<n>/` |
| Status | **active**, primary mode since DF-535 | draft; waiting on an 8-flow roadmap |
| Isolation reason | context hygiene (no anchor) | filesystem hygiene (no cross-task contamination) |

The critic dispatch does **not** depend on that roadmap: it needs only a read-only agent type, no worktrees, no orchestrator logic, no per-subagent token accounting.

## Tests

`scripts/tests/df535-fresh-context-critic.test.js` — 7 pure file-content assertions (no backend, no MCP, no network), same shape as `scripts/tests/welle-1-skills-verify.test.js`:

1. the three lenses exist in a `Fresh-Context` section and are dispatched to subagents
2. the dispatch contract names its context boundary — diff + ACs + plan in, author rationale out
3. a `self-persona-fallback` section exists, cites ADR-135, and states it applies to clients without a subagent tool
4. findings hand off into `devflow-receiving-review` for triage
5. `scripts/pre-flow-update-code-critic.js` mentions the fresh-context dispatch
6. `devflow-receiving-review` counter-references the critic
7. the test file is wired into the `npm test` script

Suite after DF-535: **166** `node --test` tests (was 159) and **83** vitest tests, all green.

## Why these docs live in the MCP repo

The whole change is in `devflow-mcp` — skill body, hook, tests, `index.json` — and ships as one PR there. Docs next to the change beat docs one repo away that go stale on the next skill edit. The `devflow` repo keeps its CLAUDE.md steckbrief convention (DF-307: no new `## DF-XXX` sections; architecture detail goes to the LLM-Wiki), so nothing is duplicated there.

## Related

- Skill: `packages/skills/skills/devflow-code-critic/SKILL.md`
- Hook: `scripts/pre-flow-update-code-critic.js`
- `devflow-receiving-review` — triages what the lenses produce
- `devflow-plan-critic` — sister skill for `planning → approval`
- ADR-135 — Multi-Client Plugin-Strategie (3-Tier Support), from DF-327 — the reason the fallback exists
- DF-339 — introduced the critic skill family
- DF-520 — the evidence case (R3)
- DF-424 / DF-427 — `devflow-subagent-driven-dev` RFC and closure
- German version: `FRESH_CONTEXT_CRITIC_DF535.de.md`
