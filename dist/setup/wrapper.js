import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detectOs, resolveNodePath } from './os-detect.js';
export function getWrapperDir() {
    return join(homedir(), '.devflow', 'bin');
}
export function getWrapperPath() {
    const os = detectOs();
    const dir = getWrapperDir();
    return os === 'windows'
        ? join(dir, 'devflow-mcp.cmd')
        : join(dir, 'devflow-mcp');
}
export function installWrapper(distFile) {
    const os = detectOs();
    const nodePath = resolveNodePath();
    const dir = getWrapperDir();
    const wrapperPath = getWrapperPath();
    mkdirSync(dir, { recursive: true });
    if (os === 'windows') {
        const content = [
            '@echo off',
            'where node >nul 2>nul',
            'if %errorlevel% neq 0 (',
            `  "${nodePath}" "${distFile}" %*`,
            '  exit /b %errorlevel%',
            ')',
            `node "${distFile}" %*`,
        ].join('\r\n');
        writeFileSync(wrapperPath, content);
    }
    else {
        const distDir = distFile.replace(/\/dist\/index\.js$/, '');
        const content = [
            '#!/bin/bash',
            '',
            '# Auto-update: check for pending updates in ~/.devflow/updates/',
            'UPDATES_DIR="$HOME/.devflow/updates"',
            `INSTALL_DIR="${distDir}"`,
            'if [ -d "$UPDATES_DIR" ]; then',
            '  UPDATE_TGZ=$(ls -t "$UPDATES_DIR"/devflow-mcp-*.tgz 2>/dev/null | head -1)',
            '  if [ -n "$UPDATE_TGZ" ]; then',
            '    echo "🔄 Installing MCP update: $(basename $UPDATE_TGZ)..." >&2',
            '    TEMP_DIR=$(mktemp -d)',
            '    tar -xzf "$UPDATE_TGZ" -C "$TEMP_DIR" 2>/dev/null',
            '    if [ -d "$TEMP_DIR/package/dist" ]; then',
            '      rm -rf "$INSTALL_DIR/dist"',
            '      cp -r "$TEMP_DIR/package/dist" "$INSTALL_DIR/dist"',
            '      rm -f "$UPDATE_TGZ"',
            '      rmdir "$UPDATES_DIR" 2>/dev/null',
            '      echo "✅ MCP update installed." >&2',
            '    fi',
            '    rm -rf "$TEMP_DIR"',
            '  fi',
            'fi',
            '',
            `NODE=$(command -v node 2>/dev/null || echo "${nodePath}")`,
            'if [ ! -x "$NODE" ]; then',
            '  echo "Error: node not found. Install Node.js first." >&2',
            '  exit 1',
            'fi',
            `exec "$NODE" "${distFile}" "$@"`,
        ].join('\n');
        writeFileSync(wrapperPath, content);
        chmodSync(wrapperPath, 0o755);
    }
    return wrapperPath;
}
