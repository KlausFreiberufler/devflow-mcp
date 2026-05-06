#!/usr/bin/env bash
# DF-338 — DevFlow Cursor Bundle Setup
#
# Usage:
#   cd /path/to/your-project
#   curl -fsSL https://raw.githubusercontent.com/KlausFreiberufler/devflow-mcp/main/scripts/setup-cursor.sh | bash
#
# Or local:
#   bash /path/to/devflow-mcp/scripts/setup-cursor.sh

set -euo pipefail

REPO="${DEVFLOW_REPO:-https://github.com/KlausFreiberufler/devflow-mcp.git}"
TEMP_DIR=""

cleanup() { [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

TARGET_DIR="${1:-$(pwd)}"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "❌ Target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi

echo "🚀 DevFlow Cursor Bundle Setup"
echo "   Target: $TARGET_DIR"
echo ""

# If we're inside a checkout of devflow-mcp, use it directly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$SCRIPT_DIR/../.cursor" ]]; then
  echo "📦 Using local devflow-mcp checkout at $SCRIPT_DIR/.."
  SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  echo "📥 Cloning $REPO ..."
  TEMP_DIR="$(mktemp -d)"
  git clone --depth 1 "$REPO" "$TEMP_DIR/devflow-mcp" >/dev/null 2>&1
  SOURCE_DIR="$TEMP_DIR/devflow-mcp"
fi

# Run the build to populate skills/ and commands/
if command -v node >/dev/null 2>&1; then
  echo "🔧 Building bundle (skills + commands)..."
  (cd "$SOURCE_DIR" && node scripts/build-cursor-bundle.js)
fi

# Copy .cursor/ into the target
if [[ -d "$TARGET_DIR/.cursor" ]]; then
  echo "⚠  Existing .cursor/ found in target — merging (existing files preserved)"
  cp -nR "$SOURCE_DIR/.cursor"/* "$TARGET_DIR/.cursor/" 2>/dev/null || true
else
  cp -R "$SOURCE_DIR/.cursor" "$TARGET_DIR/.cursor"
fi

echo ""
echo "✅ DevFlow Cursor Bundle installed at $TARGET_DIR/.cursor/"
echo ""
echo "📋 Next steps:"
echo "   1. Install the MCP package globally if not already:"
echo "      npm install -g @dev-flow-tech/mcp-server"
echo "   2. Restart Cursor"
echo "   3. In Cursor: open the Settings → MCP — verify devflow-flows + devflow-wiki are listed"
echo "   4. Run \`devflow_status()\` from the chat to authenticate"
echo ""
