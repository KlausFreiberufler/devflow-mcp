#!/usr/bin/env node
/**
 * DevFlow MCP Server - Multi-Client Setup
 *
 * Usage:
 *   npx devflow-mcp setup                          # Claude Code (default)
 *   npx devflow-mcp setup --client cursor           # Cursor
 *   npx devflow-mcp setup --client codex            # OpenAI Codex
 *   npx devflow-mcp setup --client gemini           # Gemini CLI
 *   npx devflow-mcp setup --client windsurf         # Windsurf
 *   npx devflow-mcp setup --url https://custom.url  # Custom backend URL
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readlinkSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { installWrapper } from './wrapper.js';

const DEFAULT_URL = 'https://api.app.dev-flow.tech';
const SUPPORTED_CLIENTS = ['claude', 'cursor', 'codex', 'gemini', 'windsurf'] as const;
type ClientType = typeof SUPPORTED_CLIENTS[number];

// Normalize aliases to canonical setup names
const CLIENT_ALIASES: Record<string, ClientType> = {
  'claude-code': 'claude',
};

function log(msg: string): void {
  process.stderr.write(msg + '\n');
}

function parseArgs(): { url: string; client: ClientType } {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let client: ClientType = 'claude';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[i + 1];
      i++;
    } else if (args[i] === '--client' && args[i + 1]) {
      const c = args[i + 1].toLowerCase();
      const resolved = CLIENT_ALIASES[c] || c;
      if (SUPPORTED_CLIENTS.includes(resolved as ClientType)) {
        client = resolved as ClientType;
      } else {
        log(`ERROR: Unknown client "${c}". Supported: ${SUPPORTED_CLIENTS.join(', ')}, claude-code`);
        process.exit(1);
      }
      i++;
    }
  }

  return { url, client };
}

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Invalid JSON, start fresh
  }
  return {};
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getMcpServerEntry(wrapperPath: string, devflowUrl: string, client: ClientType) {
  return {
    command: wrapperPath,
    args: [] as string[],
    env: {
      DEVFLOW_URL: devflowUrl,
      DEVFLOW_CLIENT: client,
    },
  };
}

// ─── Client-specific setup functions ────────────────────────────

function setupClaude(wrapperPath: string, devflowUrl: string): void {
  log('[3/3] Configuring Claude Code MCP server...');

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
    // Doesn't exist yet
  }

  const addCmd = `npx @anthropic-ai/claude-code mcp add devflow --scope user "${wrapperPath}" -e DEVFLOW_URL=${devflowUrl} -e DEVFLOW_CLIENT=claude`;
  try {
    execSync(addCmd, { encoding: 'utf-8', stdio: 'inherit' });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      // Command ran but may have had non-zero exit
    } else {
      throw error;
    }
  }
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
}

function setupCursor(wrapperPath: string, devflowUrl: string): void {
  log('[3/3] Configuring Cursor MCP server...');

  const configPath = join(homedir(), '.cursor', 'mcp.json');
  const config = readJsonFile(configPath);

  if (!config.mcpServers) config.mcpServers = {};
  (config.mcpServers as Record<string, unknown>).devflow = getMcpServerEntry(wrapperPath, devflowUrl, 'cursor');

  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
}

function setupCodex(wrapperPath: string, devflowUrl: string): void {
  log('[3/3] Configuring Codex MCP server...');

  const configPath = join(homedir(), '.codex', 'config.toml');
  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Read existing TOML or start fresh
  let content = '';
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf-8');
  }

  // Remove existing devflow section if present
  content = content.replace(/\[mcp_servers\.devflow\][\s\S]*?(?=\[|$)/g, '');
  content = content.trimEnd();

  // Append devflow MCP config
  const tomlBlock = `

[mcp_servers.devflow]
command = "${wrapperPath}"
args = []

[mcp_servers.devflow.env]
DEVFLOW_URL = "${devflowUrl}"
DEVFLOW_CLIENT = "codex"
`;

  content += tomlBlock;
  writeFileSync(configPath, content.trimStart() + '\n');
  log(`      Config written to: ${configPath}`);
}

function setupGemini(wrapperPath: string, devflowUrl: string): void {
  log('[3/3] Configuring Gemini CLI MCP server...');

  const configPath = join(homedir(), '.gemini', 'settings.json');
  const config = readJsonFile(configPath);

  if (!config.mcpServers) config.mcpServers = {};
  (config.mcpServers as Record<string, unknown>).devflow = {
    ...getMcpServerEntry(wrapperPath, devflowUrl, 'gemini'),
    timeout: 600000,
  };

  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
}

function setupWindsurf(wrapperPath: string, devflowUrl: string): void {
  log('[3/3] Configuring Windsurf MCP server...');

  const configPath = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  const config = readJsonFile(configPath);

  if (!config.mcpServers) config.mcpServers = {};
  (config.mcpServers as Record<string, unknown>).devflow = getMcpServerEntry(wrapperPath, devflowUrl, 'windsurf');

  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
}

// ─── Main setup ─────────────────────────────────────────────────

const CLIENT_LABELS: Record<ClientType, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex (OpenAI)',
  gemini: 'Gemini CLI',
  windsurf: 'Windsurf',
};

const CLIENT_SETUP: Record<ClientType, (wrapperPath: string, url: string) => void> = {
  claude: setupClaude,
  cursor: setupCursor,
  codex: setupCodex,
  gemini: setupGemini,
  windsurf: setupWindsurf,
};

const CLIENT_NEXT_STEPS: Record<ClientType, string[]> = {
  claude: [
    '1. Restart Claude Code',
    '2. Open a project and use flow_list or devflow_init',
    '3. Browser opens for authentication (first time)',
  ],
  cursor: [
    '1. Restart Cursor',
    '2. Open Settings > Tools & MCP to verify "devflow" is listed',
    '3. Use @devflow in chat to access DevFlow tools',
  ],
  codex: [
    '1. Restart Codex CLI',
    '2. Run: codex --help to verify MCP servers are loaded',
    '3. DevFlow tools are available automatically',
  ],
  gemini: [
    '1. Restart Gemini CLI',
    '2. DevFlow tools are available automatically',
    '3. Use flow_list or devflow_init in your prompts',
  ],
  windsurf: [
    '1. Restart Windsurf',
    '2. Click MCPs icon in Cascade panel to verify "devflow" is listed',
    '3. DevFlow tools are available in Cascade',
  ],
};

async function setup(): Promise<void> {
  const scriptDir = join(import.meta.url.replace('file://', ''), '..', '..', '..');
  const distFile = join(scriptDir, 'dist', 'index.js');
  const { url: devflowUrl, client } = parseArgs();

  log(`=== DevFlow MCP Server Setup (${CLIENT_LABELS[client]}) ===`);
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

  // Step 2: Install wrapper + DevFlow URL
  log('');
  log(`[2/3] DevFlow URL: ${devflowUrl}`);
  if (devflowUrl !== DEFAULT_URL) {
    log('      (custom URL via --url flag)');
  }

  const wrapperPath = installWrapper(distFile);
  log(`      Wrapper installed: ${wrapperPath}`);

  // Step 3: Client-specific setup
  log('');
  CLIENT_SETUP[client](wrapperPath, devflowUrl);

  log('');
  log('=== Setup complete! ===');
  log('');
  log('Next steps:');
  for (const step of CLIENT_NEXT_STEPS[client]) {
    log(`  ${step}`);
  }
  log('');
}

// Run if called directly
setup().catch((error) => {
  log(`Setup failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
