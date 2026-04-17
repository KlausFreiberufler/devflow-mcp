#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/devflow-state.sh"

# Non-DevFlow projects: pass through silently
if ! devflow_is_managed_project; then
  exit 0
fi

# Only speak when there is an active flow
devflow_active_file >/dev/null || exit 0

DISPLAY_ID="$(devflow_active_field displayId)"
STATE="$(devflow_active_field state)"

# Exit silently if displayId is empty
[ -z "$DISPLAY_ID" ] && exit 0

echo "📋 Active DevFlow: $DISPLAY_ID (state: $STATE)"
echo "   Use /devflow-status for details, /devflow-next for next step."
exit 0
