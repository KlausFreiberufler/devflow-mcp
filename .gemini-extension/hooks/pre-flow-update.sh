#!/usr/bin/env bash
# DF-337 — Gemini BeforeTool adapter for flow_update knowledge-auto-resolve.
# Mirror of .codex-plugin/hooks/pre-flow-update.sh (DF-336).

set -euo pipefail

REPO_ROOT="${GEMINI_EXTENSION_ROOT:-}"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

NODE_SCRIPT="$REPO_ROOT/scripts/pre-flow-update-knowledge-auto-resolve.js"
if [[ ! -f "$NODE_SCRIPT" ]]; then
  exit 0
fi

exec node "$NODE_SCRIPT"
