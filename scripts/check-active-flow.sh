#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/devflow-state.sh"

# Non-DevFlow projects: pass through silently
if ! devflow_is_managed_project; then
  exit 0
fi

# DevFlow project: require active flow
if ! devflow_active_file >/dev/null; then
  echo "❌ No active flow session. Start one with:" >&2
  echo "   /devflow-start <flowId>    (e.g. DF-214)" >&2
  echo "   or call the devflow_init MCP tool directly." >&2
  exit 1
fi

exit 0
