/**
 * devflow-mcp uninstall — Remove DevFlow MCP from a client
 *
 * Reverse of `devflow-mcp setup`:
 * 1. Remove devflow entry from client config file
 * 2. Remove instruction file markers (.cursorrules, AGENTS.md, etc.)
 * 3. Remove .devflow.json
 * 4. Deregister from backend
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { CURSORRULES_MARKER_START, CURSORRULES_MARKER_END } from '../templates/cursorrules.js';
import { AGENTS_MARKER_START, AGENTS_MARKER_END } from '../templates/agents-md.js';
import { GEMINI_MARKER_START, GEMINI_MARKER_END } from '../templates/gemini-md.js';
import { WINDSURFRULES_MARKER_START, WINDSURFRULES_MARKER_END } from '../templates/windsurfrules.js';
import { MARKER_START, MARKER_END } from '../templates/claude-md.js';

const SUPPORTED_CLIENTS = ['claude', 'cursor', 'codex', 'gemini', 'windsurf', 'droid'] as const;
type ClientType = typeof SUPPORTED_CLIENTS[number];
type Scope = 'project' | 'global';

const CLIENT_NAMES: Record<ClientType, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  windsurf: 'Windsurf',
  droid: 'Droid',
};

function log(msg: string) {
  console.log(msg);
}

// ─── Config file paths per client ────────────────────────────

function getConfigPath(client: ClientType, scope: Scope): string | null {
  switch (client) {
    case 'claude':
      return null; // Claude uses `claude mcp remove`
    case 'cursor':
      return scope === 'project'
        ? join(process.cwd(), '.cursor', 'mcp.json')
        : join(homedir(), '.cursor', 'mcp.json');
    case 'codex':
      return join(homedir(), '.codex', 'config.toml');
    case 'gemini':
      return join(homedir(), '.gemini', 'settings.json');
    case 'windsurf':
      return scope === 'project'
        ? join(process.cwd(), '.windsurf', 'mcp.json')
        : join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
    case 'droid':
      return scope === 'project'
        ? join(process.cwd(), '.droid', 'mcp.json')
        : join(homedir(), '.droid', 'mcp.json');
    default:
      return null;
  }
}

// ─── Instruction file markers per client ────────────────────

const INSTRUCTION_FILES: Record<ClientType, { fileName: string; markerStart: string; markerEnd: string }> = {
  claude: { fileName: 'CLAUDE.md', markerStart: MARKER_START, markerEnd: MARKER_END },
  cursor: { fileName: '.cursorrules', markerStart: CURSORRULES_MARKER_START, markerEnd: CURSORRULES_MARKER_END },
  codex: { fileName: 'AGENTS.md', markerStart: AGENTS_MARKER_START, markerEnd: AGENTS_MARKER_END },
  gemini: { fileName: 'GEMINI.md', markerStart: GEMINI_MARKER_START, markerEnd: GEMINI_MARKER_END },
  windsurf: { fileName: '.windsurfrules', markerStart: WINDSURFRULES_MARKER_START, markerEnd: WINDSURFRULES_MARKER_END },
  droid: { fileName: 'CLAUDE.md', markerStart: MARKER_START, markerEnd: MARKER_END },
};

// ─── Remove from client config ──────────────────────────────

function removeFromClaude(): void {
  try {
    execSync('claude mcp remove devflow', { stdio: 'pipe' });
    log('   Removed devflow from Claude Code MCP servers.');
  } catch {
    log('   ⚠️  Could not run "claude mcp remove devflow". Remove manually if needed.');
  }
}

function removeFromJsonConfig(configPath: string): void {
  if (!existsSync(configPath)) {
    log(`   Config not found: ${configPath}`);
    return;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.mcpServers?.devflow) {
      delete config.mcpServers.devflow;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      log(`   Removed devflow from: ${configPath}`);
    } else {
      log(`   No devflow entry in: ${configPath}`);
    }
  } catch (err) {
    log(`   ⚠️  Could not parse config: ${configPath}`);
  }
}

function removeFromTomlConfig(configPath: string): void {
  if (!existsSync(configPath)) {
    log(`   Config not found: ${configPath}`);
    return;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    // Remove [mcp_servers.devflow] section and its content
    const lines = content.split('\n');
    const filtered: string[] = [];
    let inDevflowSection = false;

    for (const line of lines) {
      if (line.match(/^\[mcp_servers\.devflow/)) {
        inDevflowSection = true;
        continue;
      }
      if (inDevflowSection && line.match(/^\[/)) {
        inDevflowSection = false; // New section starts
      }
      if (!inDevflowSection) {
        filtered.push(line);
      }
    }

    writeFileSync(configPath, filtered.join('\n'));
    log(`   Removed devflow from: ${configPath}`);
  } catch {
    log(`   ⚠️  Could not parse TOML config: ${configPath}`);
  }
}

// ─── Remove instruction file markers ────────────────────────

function removeInstructionFile(client: ClientType): void {
  const config = INSTRUCTION_FILES[client];
  if (!config) return;

  const filePath = join(process.cwd(), config.fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf-8');
  if (!content.includes(config.markerStart) || !content.includes(config.markerEnd)) {
    return; // No DevFlow markers found
  }

  const startIdx = content.indexOf(config.markerStart);
  const endIdx = content.indexOf(config.markerEnd) + config.markerEnd.length;
  const updated = content.substring(0, startIdx) + content.substring(endIdx);
  const trimmed = updated.replace(/\n{3,}/g, '\n\n').trim();

  if (trimmed.length === 0) {
    // File is empty after removing markers — delete it
    unlinkSync(filePath);
    log(`   Deleted ${config.fileName} (was only DevFlow content).`);
  } else {
    writeFileSync(filePath, trimmed + '\n');
    log(`   Removed DevFlow section from ${config.fileName}.`);
  }
}

// ─── Main uninstall function ────────────────────────────────

export async function uninstall(args: string[]): Promise<void> {
  let client: ClientType | null = null;
  let scope: Scope = 'project';
  let keepConfig = false;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--client' && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      if (val === 'claude-code') client = 'claude';
      else if (SUPPORTED_CLIENTS.includes(val as ClientType)) client = val as ClientType;
      else {
        console.error(`Unknown client: ${args[i + 1]}. Supported: ${SUPPORTED_CLIENTS.join(', ')}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--scope' && args[i + 1]) {
      scope = args[i + 1] as Scope;
      i++;
    } else if (args[i] === '--keep-config') {
      keepConfig = true;
    }
  }

  if (!client) {
    console.error('Usage: devflow-mcp uninstall --client <claude|cursor|codex|gemini|windsurf|droid>');
    process.exit(1);
  }

  // Default scope
  if (!args.includes('--scope')) {
    scope = client === 'claude' ? 'global' : 'project';
  }

  log(`\n🗑  Uninstalling DevFlow MCP from ${CLIENT_NAMES[client]}...\n`);

  // 1. Remove from client config
  if (!keepConfig) {
    log('[1/3] Removing MCP config...');
    if (client === 'claude') {
      removeFromClaude();
    } else {
      const configPath = getConfigPath(client, scope);
      if (configPath) {
        if (client === 'codex') {
          removeFromTomlConfig(configPath);
        } else {
          removeFromJsonConfig(configPath);
        }
      }
    }
  } else {
    log('[1/3] Skipping config removal (--keep-config).');
  }

  // 2. Remove instruction file
  log('[2/3] Removing instruction file...');
  removeInstructionFile(client);

  // 3. Remove .devflow.json
  log('[3/3] Cleaning up...');
  const devflowJsonPath = join(process.cwd(), '.devflow.json');
  if (existsSync(devflowJsonPath)) {
    unlinkSync(devflowJsonPath);
    log('   Removed .devflow.json');
  }

  log(`\n✅ DevFlow MCP removed from ${CLIENT_NAMES[client]}.`);
  log(`   Restart ${CLIENT_NAMES[client]} to apply changes.\n`);
}
