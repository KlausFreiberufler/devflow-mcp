#!/bin/bash
set -e

# DevFlow MCP Server - Setup Script
# Installiert den MCP-Server und konfiguriert Claude Code

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIST="$SCRIPT_DIR/dist/index.js"

echo "=== DevFlow MCP Server Setup ==="
echo ""

# 1. Dependencies installieren und bauen
echo "[1/3] Building MCP server..."
npm install --prefix "$SCRIPT_DIR"
npm run build --prefix "$SCRIPT_DIR"

if [ ! -f "$MCP_DIST" ]; then
  echo "ERROR: Build failed - $MCP_DIST not found"
  exit 1
fi

echo "      Build successful."

# 2. DevFlow URL abfragen
echo ""
read -p "[2/3] DevFlow URL (default: http://localhost:6011): " WFP_URL
WFP_URL="${WFP_URL:-http://localhost:6011}"

# 3. Claude Code MCP-Server konfigurieren (global, user scope)
echo ""
echo "[2/3] Configuring Claude Code MCP server..."

# Prüfen ob claude CLI verfügbar ist
if ! command -v claude &> /dev/null; then
  echo "ERROR: 'claude' CLI not found. Please install Claude Code first."
  exit 1
fi

# Bestehenden Eintrag entfernen (falls vorhanden)
claude mcp remove devflow 2>/dev/null || true

# MCP-Server global hinzufügen
claude mcp add --scope user devflow --transport stdio -e DEVFLOW_URL="$WFP_URL" -- node "$MCP_DIST"
echo "      MCP server added globally (user scope)."

# 4. Cleanup: Remove old global CLAUDE.md symlink if present
echo ""
echo "[3/3] Checking for old global CLAUDE.md symlink..."

CLAUDE_MD="$HOME/.claude/CLAUDE.md"
if [ -L "$CLAUDE_MD" ]; then
  LINK_TARGET="$(readlink "$CLAUDE_MD")"
  if echo "$LINK_TARGET" | grep -q "devflow-mcp\|workflow-pro-mcp"; then
    rm "$CLAUDE_MD"
    echo "      Removed old global symlink: $CLAUDE_MD"
    echo "      CLAUDE.md is now created per-project during authentication."
  fi
else
  echo "      No old symlink found. OK."
fi

# Done
echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code"
echo "  2. Open a project and run 'flow_list'"
echo "  3. Your browser will open for authentication"
echo "  4. Select a project to link it"
echo "  5. CLAUDE.md with workflow rules will be created automatically"
echo ""
echo "To update later:"
echo "  git pull && npm run build"
