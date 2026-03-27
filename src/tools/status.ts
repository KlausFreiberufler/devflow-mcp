/**
 * devflow_status — Connection management tool
 *
 * Discovery tool (works without devflow_init).
 * Shows status, reconnects, links/unlinks projects.
 */

import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import type { ToolModule } from './registry.js';
import { devFlowClient } from '../api/client.js';
import { detectClientType } from '../context/client-detect.js';
import { syncConfig } from '../config/sync.js';
import { MCP_VERSION } from '../config/version.js';
import { detectGitRemoteUrl } from '../utils/git.js';
import { isIgnored } from '../utils/ignore-list.js';

export const tools: ToolModule = {
  devflow_status: {
    definition: {
      name: 'devflow_status',
      description:
        'Show DevFlow MCP connection status or manage the connection.\n' +
        'Works without devflow_init.\n\n' +
        'Actions:\n' +
        '- status (default): Show version, auth, project, heartbeat\n' +
        '- reconnect: Refresh auth token and restart heartbeat\n' +
        '- link: Link to a project (requires projectId)\n' +
        '- unlink: Remove project link (passive mode)\n' +
        '- projects: List available projects',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'reconnect', 'link', 'unlink', 'projects'],
            description: 'Action to perform (default: status)',
          },
          projectId: {
            type: 'string',
            description: 'Project ID for link action',
          },
        },
      },
    },
    handler: async (args) => {
      const action = (args.action as string) || 'status';

      switch (action) {
        case 'status':
          return await handleStatus();
        case 'reconnect':
          return handleReconnect();
        case 'link':
          return handleLink(args.projectId as string | undefined);
        case 'unlink':
          return handleUnlink();
        case 'projects':
          return handleListProjects();
        default:
          return `Unknown action: ${action}. Use: status, reconnect, link, unlink, projects`;
      }
    },
  },
};

async function handleStatus(): Promise<string> {
  const authenticated = devFlowClient.isAuthenticated();
  const projectName = devFlowClient.getLinkedProjectName();
  const projectId = devFlowClient.getLinkedProjectId();
  const clientType = detectClientType();
  const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
  const hasHeartbeat = devFlowClient.hasActiveHeartbeat();
  const workingDir = process.cwd();

  // Auto-discovery: detect git remote and check project status
  const discoveryLines: string[] = [];
  const gitRemote = await detectGitRemoteUrl(workingDir);

  if (gitRemote && isIgnored(gitRemote)) {
    discoveryLines.push('📁 Project: Ignored (DevFlow disabled for this directory)');
    discoveryLines.push('💡 Use devflow_connect to re-enable DevFlow here.');
  } else if (devFlowClient.hasLinkedProject()) {
    discoveryLines.push(`📁 Project: ${projectName} (managed)`);
  } else if (gitRemote) {
    // Not linked, not ignored — try to discover
    if (authenticated) {
      try {
        const discovery = await devFlowClient.discoverProject(gitRemote);
        if (discovery.found && discovery.project) {
          discoveryLines.push(`📁 Project discovered: "${discovery.project.name}"`);
          discoveryLines.push('💡 This directory\'s git remote matches a DevFlow project.');
          discoveryLines.push('→ Use devflow_connect to link it, or devflow_disconnect to ignore.');
        } else {
          discoveryLines.push(`📁 Unknown project (git remote: ${gitRemote})`);
          discoveryLines.push('💡 This directory is not linked to DevFlow.');
          discoveryLines.push('→ Use devflow_connect to link or create a project, or devflow_disconnect to ignore.');
        }
      } catch {
        // Discovery failed — show git remote info without discovery
        discoveryLines.push(`📁 Unknown project (git remote: ${gitRemote})`);
        discoveryLines.push('💡 This directory is not linked to DevFlow.');
        discoveryLines.push('→ Use devflow_connect to link or create a project, or devflow_disconnect to ignore.');
      }
    } else {
      discoveryLines.push(`📁 Unknown project (git remote: ${gitRemote})`);
      discoveryLines.push('💡 This directory is not linked to DevFlow.');
      discoveryLines.push('→ Use devflow_connect to link or create a project, or devflow_disconnect to ignore.');
    }
  } else {
    discoveryLines.push('📁 No git remote detected');
    discoveryLines.push('💡 Use devflow_status({ action: "link", projectId: "..." }) to link manually.');
  }

  const lines = [
    `DevFlow MCP v${MCP_VERSION}`,
    '─'.repeat(30),
    ...discoveryLines,
    '',
    `Server:     ${baseUrl}`,
    `Auth:       ${authenticated ? '✅ Authenticated' : '❌ Not authenticated'}`,
    `Project:    ${projectName ? `${projectName} (${projectId})` : 'None (passive mode)'}`,
    `Client:     ${clientType}`,
    `Heartbeat:  ${hasHeartbeat ? '✅ Active' : '⏸ Inactive'}`,
    `Mode:       ${authenticated && projectName ? 'Enforcement active' : 'Passive'}`,
    '',
    'Available actions: reconnect, link, unlink, projects',
  ];

  if (!authenticated) {
    lines.push('');
    lines.push('💡 Run devflow_status({ action: "reconnect" }) to authenticate.');
  }

  if (!projectName) {
    lines.push('💡 Run devflow_status({ action: "projects" }) to see available projects.');
  }

  return lines.join('\n');
}

async function handleReconnect(): Promise<string> {
  const lines = ['Reconnecting...', ''];

  try {
    devFlowClient.stopHeartbeat();
    lines.push('⏹ Heartbeat stopped');

    await devFlowClient.reconnect();
    lines.push('✅ Authentication refreshed');

    if (devFlowClient.isAuthenticated()) {
      await syncConfig();
      lines.push('✅ Config synced');

      await devFlowClient.sendHeartbeat();
      devFlowClient.startHeartbeat();
      lines.push('✅ Heartbeat started');
    }

    lines.push('');
    lines.push('Connection restored successfully.');
  } catch (error) {
    lines.push(`❌ Reconnect failed: ${error instanceof Error ? error.message : error}`);
    lines.push('');
    lines.push('Try: restart your editor, or re-run the setup command.');
  }

  return lines.join('\n');
}

async function handleLink(projectId: string | undefined): Promise<string> {
  if (!projectId) {
    return [
      'Missing projectId. Usage:',
      '  devflow_status({ action: "link", projectId: "<id>" })',
      '',
      'Run devflow_status({ action: "projects" }) to see available projects.',
    ].join('\n');
  }

  if (!devFlowClient.isAuthenticated()) {
    return 'Not authenticated. Run devflow_status({ action: "reconnect" }) first.';
  }

  try {
    // Fetch project info to get the name
    const result = await devFlowClient.listProjects();
    if (!result.success || !result.data) {
      return `Failed to list projects: ${result.error || 'Unknown error'}`;
    }
    const project = result.data.find(p => p.id === projectId);

    if (!project) {
      return `Project not found: ${projectId}\nRun devflow_status({ action: "projects" }) to see available projects.`;
    }

    // Write .devflow.json in CWD
    const configPath = join(process.cwd(), '.devflow.json');
    const config = {
      projectId: project.id,
      projectName: project.name,
      linkedAt: new Date().toISOString(),
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    // Reload config in client
    await devFlowClient.reloadProjectConfig();

    // Start heartbeat if not running
    if (!devFlowClient.hasActiveHeartbeat()) {
      await devFlowClient.sendHeartbeat();
      devFlowClient.startHeartbeat();
    }

    await syncConfig();

    return [
      `✅ Linked to project: ${project.name}`,
      `   Config: ${configPath}`,
      '',
      'DevFlow is now active in this directory.',
    ].join('\n');
  } catch (error) {
    return `❌ Link failed: ${error instanceof Error ? error.message : error}`;
  }
}

function handleUnlink(): string {
  const configPath = join(process.cwd(), '.devflow.json');

  if (!existsSync(configPath)) {
    return 'No project linked in this directory.';
  }

  try {
    unlinkSync(configPath);
    devFlowClient.stopHeartbeat();
    devFlowClient.clearProjectConfig();

    return [
      '✅ Project unlinked',
      `   Removed: ${configPath}`,
      '   Heartbeat stopped',
      '',
      'DevFlow is now in passive mode for this directory.',
    ].join('\n');
  } catch (error) {
    return `❌ Unlink failed: ${error instanceof Error ? error.message : error}`;
  }
}

async function handleListProjects(): Promise<string> {
  if (!devFlowClient.isAuthenticated()) {
    return 'Not authenticated. Run devflow_status({ action: "reconnect" }) first.';
  }

  try {
    const result = await devFlowClient.listProjects();

    if (!result.success || !result.data || result.data.length === 0) {
      return 'No projects found. Create one in the DevFlow UI first.';
    }

    const currentProjectId = devFlowClient.getLinkedProjectId();
    const lines = [
      'Available Projects:',
      '─'.repeat(30),
    ];

    for (const p of result.data) {
      const linked = p.id === currentProjectId ? ' ← linked' : '';
      lines.push(`  ${p.name} (${p.id})${linked}`);
    }

    lines.push('');
    lines.push('To link: devflow_status({ action: "link", projectId: "<id>" })');

    return lines.join('\n');
  } catch (error) {
    return `❌ Failed to list projects: ${error instanceof Error ? error.message : error}`;
  }
}
