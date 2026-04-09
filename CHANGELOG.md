# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Uninstall command: `npx devflow-mcp uninstall --client <name>`
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
