#!/usr/bin/env bash
# DF-336 — Codex BeforeTool adapter for tool-call gating.
#
# Codex passes the tool-call payload as JSON on stdin. We forward to the
# existing Claude-Plugin's `check-active-flow.sh` which reads stdin and
# decides via exit-code whether to block.
#
# Exit codes:
#   0 — allow tool-call
#   2 — block (Codex BeforeTool semantic for "deny")
#
# Logic shared with .claude-plugin via scripts/check-active-flow.sh.

set -euo pipefail

# Resolve repo-root from CODEX_PLUGIN_ROOT if set, else heuristic.
REPO_ROOT="${CODEX_PLUGIN_ROOT:-}"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  # Walk up from this script's dir to find package.json
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

CHECK_SCRIPT="$REPO_ROOT/scripts/check-active-flow.sh"
if [[ ! -x "$CHECK_SCRIPT" ]]; then
  # Fallback: allow if we can't find the gate script
  exit 0
fi

# Forward stdin (JSON) and capture exit-code
exec "$CHECK_SCRIPT"
