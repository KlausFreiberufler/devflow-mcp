# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
