#!/usr/bin/env bash
# DF-338 — Cursor PreToolUse adapter for tool-call gating.
# Forwards to existing devflow-mcp scripts/check-active-flow.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Walk up from .cursor/hooks/ → .cursor/ → project-root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# In a project that has DevFlow installed, scripts/ is bundled with the MCP package.
# The setup-cursor.sh script symlinks them. As a fallback, look in the npm-global-cache.
CHECK_SCRIPT=""
for candidate in \
  "$PROJECT_ROOT/scripts/check-active-flow.sh" \
  "$(npm root -g 2>/dev/null)/@dev-flow-tech/mcp-server/scripts/check-active-flow.sh"
do
  if [[ -x "$candidate" ]]; then
    CHECK_SCRIPT="$candidate"
    break
  fi
done

if [[ -z "$CHECK_SCRIPT" ]]; then
  exit 0
fi

exec "$CHECK_SCRIPT"
