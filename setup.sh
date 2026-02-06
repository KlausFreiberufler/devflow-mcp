#!/bin/bash
set -e

# WorkFlow Pro MCP Server - Setup Script
# Installiert den MCP-Server und konfiguriert Claude Code

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIST="$SCRIPT_DIR/dist/index.js"
SETTINGS_FILE="$HOME/.claude/settings.json"
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

# 3. Claude Code Settings konfigurieren
echo ""
echo "[3/4] Configuring Claude Code..."

mkdir -p "$HOME/.claude"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# MCP-Server Eintrag mit node hinzufügen
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));

if (!settings.mcpServers) {
  settings.mcpServers = {};
}

settings.mcpServers['workflow-pro'] = {
  command: 'node',
  args: ['$MCP_DIST'],
  env: {
    WORKFLOW_PRO_URL: '$WFP_URL'
  }
};

fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
console.log('      MCP server added to Claude Code settings.');
"

# 4. Symlink für CLAUDE.md erstellen
echo ""
echo "[4/4] Linking workflow rules..."

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
