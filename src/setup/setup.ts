#!/usr/bin/env node
/**
 * DevFlow MCP Server - TypeScript Setup Command
 *
 * Usage: npx devflow-mcp setup
 *
 * Handles:
 * 1. Build verification
 * 2. Claude Code MCP registration (global, user scope)
 * 3. Cleanup of old symlinks
 */

import { execSync } from 'child_process';
import { existsSync, readlinkSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${question} (default: ${defaultValue}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function exec(cmd: string, silent = false): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      return (error as { stdout: string }).stdout || '';
    }
    throw error;
  }
}

async function setup(): Promise<void> {
  const scriptDir = join(import.meta.url.replace('file://', ''), '..', '..', '..');
  const distFile = join(scriptDir, 'dist', 'index.js');

  log('=== DevFlow MCP Server v3.0 Setup ===');
  log('');

  // Step 1: Build
  log('[1/3] Building MCP server...');
  if (!existsSync(distFile)) {
    try {
      execSync('npm run build', { cwd: scriptDir, stdio: 'inherit' });
    } catch {
      log('ERROR: Build failed.');
      process.exit(1);
    }
  }

  if (!existsSync(distFile)) {
    log(`ERROR: dist/index.js not found at ${distFile}`);
    process.exit(1);
  }
  log('      Build OK.');

  // Step 2: DevFlow URL
  log('');
  const devflowUrl = await prompt('[2/3] DevFlow URL', 'http://localhost:6011');

  // Step 3: Claude Code MCP registration
  log('');
  log('[3/3] Configuring Claude Code MCP server...');

  // Check if claude CLI is available
  try {
    execSync('which claude', { stdio: 'pipe' });
  } catch {
    log('ERROR: "claude" CLI not found. Please install Claude Code first.');
    process.exit(1);
  }

  // Remove existing entry
  try {
    execSync('claude mcp remove devflow', { stdio: 'pipe' });
  } catch {
    // Doesn't exist yet, fine
  }

  // Add MCP server globally
  const addCmd = `claude mcp add --scope user devflow --transport stdio -e DEVFLOW_URL="${devflowUrl}" -- node "${distFile}"`;
  exec(addCmd);
  log('      MCP server registered (user scope).');

  // Cleanup old symlinks
  const claudeMd = join(homedir(), '.claude', 'CLAUDE.md');
  try {
    const stat = readlinkSync(claudeMd);
    if (stat.includes('devflow-mcp') || stat.includes('workflow-pro-mcp')) {
      unlinkSync(claudeMd);
      log('      Removed old global CLAUDE.md symlink.');
    }
  } catch {
    // Not a symlink or doesn't exist
  }

  log('');
  log('=== Setup complete! ===');
  log('');
  log('Next steps:');
  log('  1. Restart Claude Code');
  log('  2. Open a project and use flow_list or devflow_init');
  log('  3. Browser opens for authentication (first time)');
  log('  4. Select a project to link it');
  log('');
  log('To update: git pull && npm run build');
}

// Run if called directly
setup().catch((error) => {
  log(`Setup failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
