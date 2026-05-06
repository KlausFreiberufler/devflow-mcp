#!/usr/bin/env bash
# DF-337 — Gemini BeforeTool adapter for tool-call gating.
# Mirror of .codex-plugin/hooks/pre-tool-use.sh (DF-336).

set -euo pipefail

REPO_ROOT="${GEMINI_EXTENSION_ROOT:-}"
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

CHECK_SCRIPT="$REPO_ROOT/scripts/check-active-flow.sh"
if [[ ! -x "$CHECK_SCRIPT" ]]; then
  exit 0
fi

exec "$CHECK_SCRIPT"
