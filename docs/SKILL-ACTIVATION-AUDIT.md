# Skill-Activation Audit (DF-357 Phase 5)

Snapshot of how each of the 21 skills currently gets in front of the agent. **Audit-only** — no auto-trigger rules added in this flow. Findings feed follow-up flows.

| Skill | Activation kind | Today's reliability | Notes |
|---|---|---|---|
| `devflow-core` | description-match | high | Always-on foundation (CLAUDE.md anchor). |
| `devflow-flow-display` | description-match (`listing flows`) | medium | Heavily relies on the agent recognizing "list flows" context. Often skipped on terse prompts. |
| `devflow-planning` | description-match (state=planning) | high | Anchored in `devflow_init` response. |
| `devflow-collision-acknowledged` | discipline-token gate | **high — after DF-357** | Required token for approval. Pre-tool-use hook now actually fires (was dormant). |
| `devflow-pattern-reuse` | discipline-token gate | **high — after DF-357** | Same. |
| `devflow-knowledge-completer` | discipline-token gate + DF-320 hook | **high — after DF-357** | Knowledge auto-resolve hook now actually fires. |
| `devflow-plan-critic` | pre-tool-use hook (`approval`) | **high — after DF-357** | Hook reminder previously did not fire. |
| `devflow-code-critic` | pre-tool-use hook (`review`) | **high — after DF-357** | Same. |
| `devflow-tdd` | discipline-token gate | medium | Token required for `testing`. Token emit not hook-driven; relies on agent self-discipline. Possible follow-up: pre-implementation hook reminder. |
| `devflow-executing` | description-match (state=in_progress) | high | Anchored in `devflow_init` response. |
| `devflow-worktrees` | description-match (`start of implementation`) | medium | Often skipped on quick fixes. Likely fine — worktrees aren't always needed. |
| `devflow-debugging` | description-match (`failing test, production error`) | medium | Should activate automatically; in practice agents jump straight to root-causing without the structured 4-phase walk. |
| `devflow-error-investigator` | description-match (`unexpected error`) | low | Easy to skip — most errors look "obvious". Possible follow-up: hook on test-failure detection. |
| `devflow-reviewing` | description-match (state=review) | high | Anchored in `devflow_init`. |
| `devflow-plan-reconciliation` | description-match (review, before verification) | medium | Easily collapsed into self-review without the explicit table. |
| `devflow-verification-gate` | discipline-token gate | high | Required token for `testing`. |
| `devflow-adr-compliance` | discipline-token gate | high | Required token for `testing`. Backend-driven check. |
| `devflow-receiving-review` | description-match (after review feedback) | medium | Triggers on user review comments. |
| `devflow-area-ideation` | manual (user pastes prompt) | n/a | User-driven. |
| `devflow-idea-curator` | manual (monthly cadence) | n/a | User-driven. |
| `devflow-wiki-lint` | manual (health-bar / on demand) | n/a | User-driven. |

## Categories

- **Token-gated (server-enforced)** — 6 skills (`collision-acknowledged`, `pattern-reuse`, `knowledge-completer`, `tdd`, `verification-gate`, `adr-compliance`). Backend refuses the transition without a valid signed token. Reliability = high.
- **Hook-reminded (now reliable after DF-357)** — 4 skills: the two critics + `knowledge-completer` (auto-resolve hook) + `self-approval` reminder. Pre-tool-use hooks now actually fire because the matcher resolves the plugin namespace.
- **Description-match** — 9 skills. Reliability depends on the agent matching the SKILL.md description to the user's prompt. Fragile.
- **User-driven** — 3 skills. Triggered explicitly via dashboard buttons or manual invocation. No automation needed.

## Reliability uplift from DF-357

| Skill | Before | After |
|---|---|---|
| `devflow-knowledge-completer` (auto-resolve) | dormant — 0 of 12 audit flows | hook fires |
| `devflow-plan-critic` | dormant | hook fires |
| `devflow-code-critic` | dormant | hook fires |
| Self-approval token-emit reminder | dormant | hook fires |

The four pre-tool-use hooks were silent in every flow of the DF-345..356 audit sprint because the matcher pattern `mcp__devflow__flow_update` did not match the plugin-namespaced tool name `mcp__plugin_devflow_devflow__flow_update`. After DF-357 the matcher is namespace-immune (`.*__flow_update$`) and the internal guards use `endsWith('__flow_update')`.

## Test-drift hygiene (post-DF-407)

When the plugin's behavior is intentionally refactored (e.g. DF-377 made Strictness-warnings informational, DF-378 added a second hook matcher), the pin tests in `tests/strictness/` and `scripts/tests/hooks-matcher.test.js` must follow. **`npm test` red on main = `release.yml` CI red at next tag-push.** See CHANGELOG > "Internal test-drift fix (DF-407)" for the canonical example of both drift classes (hard-block vs soft-warn, matcher-find-heuristic).

## Out-of-scope follow-up candidates

These are intentionally **not** addressed in DF-357. Each is its own scoped flow.

- **DF-359** `flow_batch_advance` composite tool — ready→in_progress→tasks→review collapsed into one call when prerequisites are satisfied.
- **DF-360** Plan templates per flow type — feature/hotfix/refactor each get a starter template that pre-populates the AC structure.
- **DF-361** Discipline-Token TTL + lifecycle audit — the DF-356 episode where freshly emitted tokens were rejected on first try; no root-cause yet.
- **DF-362** Iron Law: `intent_defer` with `horizon='later'` should auto-spawn a follow-up flow rather than letting the topic vanish.
- **DF-363** `HARDCODED_REQUIRED_SKILLS` doc-drift — CLAUDE.md says 3 skills, code says 4.
- **DF-364** (new) Pre-test-run hook for `devflow-error-investigator` — when a test fails, surface the wiki-error-context in the same response so the agent can't sidestep the structured investigation.
- **DF-365** (new) Trigger `devflow-debugging` from a test-failure signature, not from "the user said the word debug".
