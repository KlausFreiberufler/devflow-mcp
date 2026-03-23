import { writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { detectOs, resolveNodePath } from './os-detect.js';

export function getWrapperDir(): string {
  return join(homedir(), '.devflow', 'bin');
}

export function getWrapperPath(): string {
  const os = detectOs();
  const dir = getWrapperDir();
  return os === 'windows'
    ? join(dir, 'devflow-mcp.cmd')
    : join(dir, 'devflow-mcp');
}

export function installWrapper(distFile: string): string {
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
  } else {
    const content = [
      '#!/bin/bash',
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
