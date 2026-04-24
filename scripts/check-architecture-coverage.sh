#!/usr/bin/env bash
# DF-256 follow-up — advisory PreToolUse check.
#
# When editing files in a DevFlow-managed project, warn (but don't block) if
# the file appears to be covered by a project architecture_module page. This
# gives the agent a chance to remember to update the corresponding doc after
# the edit.
#
# Exits 0 always (advisory only). To make it blocking later, change the
# final `exit 0` to `exit 1` when a covered file is touched without a
# corresponding doc_page_update in the session.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/devflow-state.sh" 2>/dev/null || exit 0

# Non-DevFlow projects pass through silently
if ! devflow_is_managed_project; then
  exit 0
fi

# Only react on Edit|Write|NotebookEdit — args come via stdin as JSON from Claude Code
INPUT="$(cat 2>/dev/null || true)"
if [ -z "$INPUT" ]; then
  exit 0
fi

# Extract the target file_path (works for Edit/Write/NotebookEdit)
TARGET=$(echo "$INPUT" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$TARGET" ]; then
  exit 0
fi

# Simple heuristic: if target path contains a well-known module name, hint at
# the architecture_module. Full resolver would hit the backend — keep this
# local + offline for now.
case "$TARGET" in
  *backend/src/auth/*|*middleware/auth*)         MODULE="Auth & Security" ;;
  *services/stripe*|*routes/billing*)            MODULE="Billing" ;;
  *database/schema.sql|*database/db.js)          MODULE="Data Model" ;;
  *services/socket*|*services/eventBus*|*services/events.js)  MODULE="Realtime" ;;
  *services/pipelineOrchestrator*|*routes/pipeline*)          MODULE="Pipeline Orchestrator" ;;
  *database/knowledge*|*services/planningContext*|*services/flowSeal*)  MODULE="Knowledge" ;;
  *routes/flows.js|*database/flows.js)           MODULE="Flow Lifecycle" ;;
  *devflow-mcp/src/tools/*|*devflow-mcp/.claude-plugin/*)     MODULE="MCP & Plugin" ;;
  *routes/runner*|*database/runner*)             MODULE="Runner" ;;
  *frontend/src/plugins/*|*capacitor.config*)    MODULE="Mobile" ;;
  *routes/admin*|*database/adminAuditLog*)       MODULE="Admin & Compliance" ;;
  *App.tsx|*frontend/src/stores/*|*frontend/src/contexts/*)   MODULE="Frontend Architecture" ;;
  *docs-site/*|*website/*)                       MODULE="Docs-Site & Website" ;;
  *docker-compose*|*.github/workflows/*|*Dockerfile*)         MODULE="DevOps" ;;
  *) exit 0 ;;
esac

# Print to stderr so Claude Code relays it back to the agent.
echo "💡 DevFlow hint: this file is covered by architecture_module [[${MODULE}]]." >&2
echo "   If your change alters responsibilities, key_files, dependencies or open_questions," >&2
echo "   remember to update the page after this flow via \`doc_page_update\`." >&2

# Advisory only — pass through
exit 0
