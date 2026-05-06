#!/usr/bin/env bash
# DF-338 — Cursor PreToolUse adapter for flow_update knowledge-auto-resolve.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

NODE_SCRIPT=""
for candidate in \
  "$PROJECT_ROOT/scripts/pre-flow-update-knowledge-auto-resolve.js" \
  "$(npm root -g 2>/dev/null)/@dev-flow-tech/mcp-server/scripts/pre-flow-update-knowledge-auto-resolve.js"
do
  if [[ -f "$candidate" ]]; then
    NODE_SCRIPT="$candidate"
    break
  fi
done

if [[ -z "$NODE_SCRIPT" ]]; then
  exit 0
fi

exec node "$NODE_SCRIPT"
