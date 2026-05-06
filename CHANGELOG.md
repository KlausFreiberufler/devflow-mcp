# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (DF-335)

- **Skills-Mono-Repo:** Skills extracted into `packages/skills/` als `@dev-flow-tech/skills@1.0.0` workspace-package. Backwards-compat via symlink `skills/` → `packages/skills/skills/` — Claude-Plugin findet sie unverändert.
- New: `packages/skills/index.json` (auto-generated from frontmatter), `scripts/build-index.js`, schema-test pinning all 19 skills.
- npm-Package shippt jetzt `packages/skills/` mit (für zukünftige Codex/Gemini/Cursor-Plugins als Source).

## [4.25.0] - 2026-05-06

### Added (DF-332)

- `flow_get` now appends a `## Discussion (N)`-section with all live comments (deleted/tombstoned comments are skipped). Resolved comments get a `[✓ resolved]` marker.
- New MCP tool **`flow_comments_get(flowId)`** for an explicit reload of just the discussion thread — useful when the user said something new in the UI and you want fresh context without re-fetching the entire flow + attachments.
- Comments are rendered chronologically as Markdown blockquotes with author + timestamp. Wikilinks (`[[adr-134]]`) and `@mentions` in the body stay raw — use `wiki_get_page` if you need to resolve them.

### Changed (DF-332)

- `client.ts` adds `listFlowComments(flowId)` wrapper around the existing `GET /api/flows/:id/comments` endpoint (DF-274). No backend changes required.
- New exported type `FlowDiscussionComment` with embedded `author` info.

## [4.24.0] - 2026-05-06

### Added (DF-329)

Uniform flow-list display across MCP, slash-commands, and free-form agent responses. The user gets the same Markdown-table everywhere — not three different rendering styles depending on entry-point.

- `flow_list` MCP-tool now renders a Markdown table (`ID | State | Assignee | Titel`) instead of a per-state bullet-list.
- ⭐ prefix marks own flows (`isMine === true`) — server-computed in `formatFlowResponse(flow, currentUserId)`.
- 🔒 suffix on the assignee column shows active agent sessions; idle flows have no marker (replaces noisy `(frei)`).
- Done-flows are hidden by default; opt-in via `flow_list({ includeDone: true })`.
- New `mine` filter: `flow_list({ mine: true })` returns only own flows.
- New plugin skill `devflow-flow-display` enforces the convention whenever Claude lists or summarizes flows — even outside the MCP-tool path.
- `/devflow-list` slash-command updated to pass MCP-tool output through verbatim.
- `devflow-core` skill cross-links to `devflow-flow-display` under "Output Conventions".

### Changed (DF-329)

Backend `GET /api/flows` response shape:
- New `isMine: boolean` per flow.
- `assignee` is now a structured object `{ id, name, email | null } | null` (legacy `assignee_name` flat string preserved for back-compat).
- Test pin: `tests/api/flows-list-display.test.ts` (6 ACs).

## [4.23.0] - 2026-05-05

### Changed (DF-326)

The plugin no longer modifies `CLAUDE.md`. Since DF-302 introduced the Claude Code plugin (skills + hooks + MCP tool responses), the `<!-- DEVFLOW-RULES-START -->` block in `CLAUDE.md` was triple-redundant — every MCP restart, every `devflow_status`, every `devflow_connect` re-wrote it for nothing.

- `syncConfig` no longer calls `setupClaudeMd` or `syncProjectGuidelines`. Project guidelines remain reachable via the `project_guidelines_get` MCP tool.
- `browser-auth.ts` no longer writes `CLAUDE.md` after first login.
- `project_guidelines_update` no longer syncs the result into a local file — guidelines are stored in the backend only.
- `setup` for `--client claude` (and `--client droid`) no longer writes `CLAUDE.md`. Cursor/Codex/Gemini/Windsurf still get their respective rules-files until DF-327 introduces dedicated plugin bundles per client.
- `setup/claude-md-generator.ts` removed. `templates/claude-md.ts` retained as the canonical content source for the other clients' rules-files.
- `uninstall.ts` keeps the legacy `CLAUDE.md` cleanup path for pre-4.23 installs (markers defined inline now).

### Removed (DF-326)

- `flow_seal_backfill` MCP-tool. It was a one-shot migration from DF-255 — done-flows now seal automatically. The backend endpoint (`POST /api/projects/:id/flow-seal-backfill`) remains for manual curl invocation.
- `scripts/check-architecture-coverage.sh` and its hook entry. Advisory-only with hardcoded path-to-module mappings — no one acted on the hint, drift-prone.

## [4.14.1] - 2026-04-26

### Fixed (DF-282)

- `flow_upload` now accepts `kind="decision"` (was rejected with "Invalid kind decision"). The DevFlow backend has supported `decision` since DF-224 — the MCP-tool's `ALLOWED_KINDS` allowlist was missing it. Discovered during DF-274 when the agent had to bypass MCP and upload via direct REST to create a `decision.md` for `adr_accept`.

## [4.14.0] - 2026-04-24

### Added (DF-269)

Four new tools so Claude can use the DF-261 / DF-263 / DF-264 backend features directly instead of hand-rolled REST calls:

- `pending_work(projectId?, tags?, paths?, excludeFlowId?)` — 4-bucket snapshot (`inFlightFlows`, `openIntents`, `proposedAdrs`, `pendingDrafts`). Call this at planning start to avoid proposing something already in flight.
- `intent_resolve(flowId, pageId, note?)` — close a forward-intent doc-page (from DF-254 `flow_seal`) once the current flow actually delivers that follow-up. Updates `frontmatter.status='resolved'` and links the resolving flow.
- `knowledge_autotag_suggest(projectId?, content, existingTags?, limit?)` — TF-IDF tag suggestions from the existing project tag pool (no new tags invented, avoiding tag-wildwuchs).
- `knowledge_check_resolve(flowId, topic, resolutionType, entityType?, entityId?, reason?, horizon?)` — mark a warning from `knowledge_check_flow` / `knowledge_check_drift` as resolved. Five resolution types: `adr`, `pattern`, `runbook`, `intent_defer` (seeds an intent doc-page), `dismiss`.

Allowlist (backend DF-269): the two read-only tools are callable in every working state; the two writes are scoped to `planning` + `in_progress`.

## [4.9.0] - 2026-04-22

### Added
- `knowledge_check_drift(projectId, adrNumber)` tool (DF-238): returns ADR content + its configured `affects_paths`, plus instructions for Claude to inspect the files and report drift. Drift detection runs client-side (Claude's own Read/Glob/Grep against the user workspace) — no backend code access needed.

### Changed (DF-242)
- Package renamed from `devflow-mcp` to `@dev-flow-tech/mcp-server` (scoped under the npm org `@dev-flow-tech`). `"private": true` flipped to `false` and `publishConfig.access: "public"` added so the package is publishable.
- `.claude-plugin/plugin.json` now carries an `mcpServers.devflow` entry pointing at `npx -y @dev-flow-tech/mcp-server@4.9.0`. Installing the plugin (`/plugin install devflow`) now registers the MCP server automatically — no separate `npx github:... setup` step needed.
- Added `npm run publish:npm` script (`npm run build && npm publish`) for future releases.
- README install section now shows `/plugin install devflow` as the primary path; the legacy `npx github:` fallback stays documented.

## [4.8.0] - 2026-04-22

### Added
- MCP Resources (DF-240): `devflow://project/{id}/adr/{number}`, `/flow/{displayId}`, `/graph`, `/search?q=...`
- MCP Prompts (DF-240): `ask_project`, `plan_with_project_knowledge`, `review_with_drift_check`
- `capabilities.resources` + `capabilities.prompts` enabled on the server
- Prompts auto-assemble project context (ADRs + recent done-flows) so Claude gets one-shot answers

## [4.7.0] - 2026-04-22

### Added
- 2 more MCP-first Knowledge tools (DF-246): `knowledge_harvest(flowId)` and `knowledge_check_flow(flowId)`. After a flow transitions to done the server's `flow_update` response now carries a `suggestedNextTool` pointing Claude at `knowledge_harvest` for the just-finished flow.
- Backend endpoints `GET /api/flows/:id/knowledge-harvest/prepare` and `/knowledge-check/prepare`.
- CLAUDE.md `Knowledge-Pflicht` section describing the post-done-harvest expectation.

## [4.6.0] - 2026-04-22

### Added
- 5 MCP-first Knowledge-Drafts tools (DF-245): `knowledge_backfill_request`, `knowledge_draft_create`, `knowledge_draft_list`, `knowledge_draft_accept`, `knowledge_draft_reject`. Claude reads project context + existing ADRs + structured instructions, classifies done-flows itself, and writes back drafts — no server-side LLM required.
- Backend endpoints `POST /api/knowledge-drafts` (direct create) and `GET /api/projects/:id/knowledge-backfill/prepare` (data + instructions for Claude).
- Plugin-manifest version synchronized with MCP-server version (both 4.6.0). Future releases bump both in sync.

### Notes
- Dedup-Check from DF-244 Phase 1 applies automatically: repeated draft creation with the same `(projectId, draftType, title)` merges `sourceFlowIds` instead of duplicating.

## [4.4.1] - 2026-04-21

### Fixed
- `transformFlow()` dropped the `commits` field, making the MCP-side strictness check blind to persisted commits. This caused docsUpdate=5 to block `review` transitions even when docs commits were registered in a prior `flow_update` call (DF-217 reproducer, DF-218 fix).
- Git-discipline check now also accepts persisted `prUrl` and `commits` on the flow (previously required them in the same call).

### Added
- Vitest test suite covering all strictness gates: `tests/strictness/rules.test.ts`, `tests/strictness/git.test.ts`, `tests/strictness/happy-path-paranoid.test.ts` (25 test cases).
- `npm test` / `npm run test:watch` scripts and `vitest.config.ts`.

### Changed
- `flow_update.commits` tool description clarifies same-call vs persisted semantics.

## [4.2.0] - 2026-04-17

### Added
- Heartbeat now includes `workingDirectory` (process.cwd()) for better server-side client deduplication (DF-215)

### Notes
- Requires DevFlow backend with DF-215 deployed for dedup to take effect
- Legacy behaviour preserved: backend falls back to projectId match when workingDirectory is absent

## [4.1.0] - 2026-04-17

### Added
- 4 plugin hooks: `PreToolUse` (enforcement), `SessionStart` (context), `PostToolUse` (state-change reminder), `Stop` (exit warning)
- 7 slash commands: `/devflow-start`, `/devflow-status`, `/devflow-next`, `/devflow-tasks`, `/devflow-review`, `/devflow-list`, `/devflow-create`
- 4 state-specific skills: `devflow-core`, `devflow-planning`, `devflow-executing`, `devflow-reviewing` — with optional `superpowers:*` references
- Shared bash helper library `scripts/lib/devflow-state.sh` for hook scripts
- Test coverage: `bats-core` for bash hooks, `node:test` for JS hooks

### Changed
- Monolithic `devflow-workflow` skill split into 4 state-specific skills
- External `PreToolUse` hook (previously required in `~/.claude/settings.json`) is now provided by the plugin itself

### Removed
- `skills/devflow-workflow/` (replaced by 4 new skills)

### Migration
- Existing users with the external hook can leave it in place or remove it — plugin hook takes precedence. No breaking changes.

## [4.0.0] - 2026-04-09

### Added
- Claude Code Plugin support: `.claude-plugin/plugin.json`, `.mcp.json`, skills
- English documentation: README, CONTRIBUTING, CHANGELOG

### Changed
- License changed from proprietary to MIT
- Default backend URL consolidated to `https://api.app.dev-flow.tech`
- All user-facing error messages now in English
- Removed legacy `setup.sh` and internal planning documents
- Removed `.tgz` release archives from repository

### Fixed
- Version mismatch between `package.json` and `MCP_VERSION` constant
- Localhost URLs removed from user-facing error messages

## [3.7.3] - 2026-03-31

### Fixed
- Release script improvements

## [3.7.2] - 2026-03-28

### Added
- Uninstall command: `npx github:KlausFreiberufler/devflow-mcp uninstall --client <name>`
- Auto-update: background download of new versions, applied on next start
- Agent session isolation hints in status output

## [3.7.1] - 2026-03-25

### Added
- `.devflow-active` state file for Claude Code hook enforcement
- `devflow_init` reminder after state changes

## [3.7.0] - 2026-03-20

### Fixed
- Setup wizard reliability improvements
- Authentication flow fixes
- Code cleanup and consistency

## [3.6.0] - 2026-03-10

### Added
- Project Discovery: auto-detect projects via git remote URL
- Ignore list for non-DevFlow projects
- `devflow_connect` / `devflow_disconnect` tools

## [3.5.0] - 2026-03-05

### Added
- `devflow_status` tool for connection management across all MCP clients

## [3.4.0] - 2026-02-28

### Added
- Per-project scoping via `.devflow.json`
- Silent passive mode for unlinked projects

## [3.3.5] - 2026-02-25

### Fixed
- Smart docs-enforcement check
- Version sync between package.json and MCP_VERSION

## [3.3.4] - 2026-02-24

### Fixed
- Rule enforcement: gitEnabled gate, branchName schema, commits check
- Docs hard-block enforcement

## [3.3.0] - 2026-02-20

### Added
- In-client project linking (no more browser project selection)
- Heartbeat system for online status tracking
- Shell wrapper for cross-platform node resolution
- OS detection and node path resolution
- Client type auto-detection
- Multi-client setup: Claude Code, Cursor, Codex, Gemini CLI, Windsurf

## [3.2.0] - 2026-02-15

### Changed
- Pipeline architecture refactor: `executor` -> `actor` + `transitionPolicy` + `kind` + `skippable`
- Backend as sole source of truth for permissions (removed client-side permission logic)

### Added
- `getNextStep()` API method for permission refresh after auto-advance
- Session context stores `stepKind` and `transitionPolicy`

## [3.1.0] - 2026-02-12

### Added
- Pipeline Phase 2: Skills enforcement, phase tracking (pre/action/after)
- Reject/retry loops with escalation
- Update warning when MCP version is outdated

## [3.0.0] - 2026-02-10

### Added
- Pipeline integration: gate handling, skill assignment, next-step API
- Init gate: all tools blocked until `devflow_init` is called
- Session context and state-based permissions
- Context guard and state guard middleware
- Graceful shutdown (releases flow lock on SIGINT/SIGTERM)
- Documentation page CRUD tools (replaced knowledge tools)

### Changed
- Full rename: Workflow -> Flow across all layers
