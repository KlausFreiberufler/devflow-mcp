#!/usr/bin/env bash
set -u

# Pre-tool-use hook · ensures an active flow session exists before edits.
#
# Exit codes (Claude Code hook protocol):
#   0  → pass
#   2  → BLOCK · stderr reinjected into agent context
#
# Previously used `exit 1` which Claude Code treats as "hook error, continue
# anyway" — meaning edits proceeded without an active flow. Now uses exit 2
# so the agent is forced to call devflow_init or /devflow-start first.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/devflow-state.sh"

# Non-DevFlow projects: pass through silently.
if ! devflow_is_managed_project; then
  exit 0
fi

# DevFlow project: require an active flow.
if ! devflow_active_file >/dev/null; then
  cat >&2 <<'EOF'
[devflow] No active flow session — edits are blocked until a flow is active.

Required next action — choose one:

  1. Resume an existing flow:
       /devflow-start <flowId>          (e.g. /devflow-start DF-214)

  2. Or pick from the list:
       /devflow-list                    (shows in-progress flows)

  3. Or create a new one:
       /devflow-create "<short title>"

After devflow_init runs and .devflow-active is written, retry your edit.
EOF
  exit 2
fi

exit 0
