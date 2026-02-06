#!/bin/bash
set -e

# WorkFlow Pro MCP Server - Setup Script
# Installiert den MCP-Server und konfiguriert Claude Code

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIST="$SCRIPT_DIR/dist/index.js"
CLAUDE_MD="$HOME/.claude/CLAUDE.md"
RULES_FILE="$SCRIPT_DIR/docs/CLAUDE-WORKFLOW-RULES.md"

echo "=== WorkFlow Pro MCP Server Setup ==="
echo ""

# 1. Dependencies installieren und bauen
echo "[1/4] Building MCP server..."
npm install --prefix "$SCRIPT_DIR"
npm run build --prefix "$SCRIPT_DIR"

if [ ! -f "$MCP_DIST" ]; then
  echo "ERROR: Build failed - $MCP_DIST not found"
  exit 1
fi

echo "      Build successful."

# 2. WorkFlow Pro URL abfragen
echo ""
read -p "[2/4] WorkFlow Pro URL (default: http://localhost:6011): " WFP_URL
WFP_URL="${WFP_URL:-http://localhost:6011}"

# 3. Claude Code MCP-Server konfigurieren (global, user scope)
echo ""
echo "[3/4] Configuring Claude Code MCP server..."

# Prüfen ob claude CLI verfügbar ist
if ! command -v claude &> /dev/null; then
  echo "ERROR: 'claude' CLI not found. Please install Claude Code first."
  exit 1
fi

# Bestehenden Eintrag entfernen (falls vorhanden)
claude mcp remove workflow-pro 2>/dev/null || true

# MCP-Server global hinzufügen
claude mcp add --scope user workflow-pro --transport stdio -e WORKFLOW_PRO_URL="$WFP_URL" -- node "$MCP_DIST"
echo "      MCP server added globally (user scope)."

# 4. Symlink für CLAUDE.md erstellen
echo ""
echo "[4/4] Linking workflow rules..."

mkdir -p "$HOME/.claude"

if [ -f "$CLAUDE_MD" ] && [ ! -L "$CLAUDE_MD" ]; then
  BACKUP="$CLAUDE_MD.bak.$(date +%Y%m%d%H%M%S)"
  cp "$CLAUDE_MD" "$BACKUP"
  echo "      Existing CLAUDE.md backed up to: $BACKUP"
fi

if [ -L "$CLAUDE_MD" ]; then
  rm "$CLAUDE_MD"
fi

ln -s "$RULES_FILE" "$CLAUDE_MD"
echo "      Symlink created: $CLAUDE_MD -> $RULES_FILE"

# Done
echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code"
echo "  2. Open a project and run 'workflow_list'"
echo "  3. Your browser will open for authentication"
echo "  4. Select a project to link it"
echo ""
echo "To update later:"
echo "  git pull && npm run build"
echo "  (Workflow rules update automatically via symlink)"
