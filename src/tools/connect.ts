/**
 * devflow_connect — Connect this project to DevFlow
 *
 * Discovery tool (works without devflow_init).
 * Links the current directory to a DevFlow project, enabling flow tracking.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { ToolModule } from './registry.js';
import { devFlowClient } from '../api/client.js';
import { detectGitRemoteUrl } from '../utils/git.js';
import { removeFromIgnoreList } from '../utils/ignore-list.js';
import { syncConfig } from '../config/sync.js';

export const tools: ToolModule = {
  devflow_connect: {
    definition: {
      name: 'devflow_connect',
      description:
        'Connect this project to DevFlow. Links the current directory to a DevFlow project, ' +
        'enabling flow tracking and enforcement. Use when you want to start using DevFlow in this directory.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          projectId: {
            type: 'string',
            description: 'ID of existing DevFlow project to link to',
          },
          createNew: {
            type: 'boolean',
            description: 'Create a new DevFlow project and link it',
          },
          name: {
            type: 'string',
            description: 'Name for the new project (required with createNew)',
          },
        },
      },
    },
    handler: async (args) => {
      if (!devFlowClient.isAuthenticated()) {
        return 'Not authenticated. Run devflow_status({ action: "reconnect" }) first.';
      }

      const projectId = args.projectId as string | undefined;
      const createNew = args.createNew as boolean | undefined;
      const name = args.name as string | undefined;
      const cwd = process.cwd();

      try {
        // Detect git remote
        const gitRemote = await detectGitRemoteUrl(cwd);

        // Remove from ignore list if present
        if (gitRemote) {
          removeFromIgnoreList(gitRemote);
        }

        let linkedProjectId: string;
        let linkedProjectName: string;

        if (createNew) {
          // Create new project
          if (!name) {
            return 'Missing name. Usage: devflow_connect({ createNew: true, name: "My Project" })';
          }

          const createResult = await devFlowClient.createProject({
            name,
            repoUrl: gitRemote || undefined,
          });

          if (!createResult.success || !createResult.data) {
            return `Failed to create project: ${createResult.error || 'Unknown error'}`;
          }

          linkedProjectId = createResult.data.id;
          linkedProjectName = createResult.data.name;
        } else if (projectId) {
          // Link to existing project
          const result = await devFlowClient.listProjects();
          if (!result.success || !result.data) {
            return `Failed to list projects: ${result.error || 'Unknown error'}`;
          }

          const project = result.data.find(p => p.id === projectId);
          if (!project) {
            return [
              `Project not found: ${projectId}`,
              '',
              'Run devflow_connect() without arguments to see available projects.',
            ].join('\n');
          }

          linkedProjectId = project.id;
          linkedProjectName = project.name;

          // Set repo_url on backend if git remote detected and not already set
          if (gitRemote) {
            await devFlowClient.updateProject(projectId, { repoUrl: gitRemote }).catch(() => {});
          }
        } else {
          // Guided mode: try auto-discovery, then list projects
          if (gitRemote) {
            const discovery = await devFlowClient.discoverProject(gitRemote);
            if (discovery.found && discovery.project) {
              // Auto-link to discovered project
              linkedProjectId = discovery.project.id;
              linkedProjectName = discovery.project.name;

              // Write config, reload, start heartbeat
              const configPath = join(cwd, '.devflow.json');
              const config = {
                projectId: linkedProjectId,
                projectName: linkedProjectName,
                linkedAt: new Date().toISOString(),
              };
              writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

              await devFlowClient.reloadProjectConfig();

              if (!devFlowClient.hasActiveHeartbeat()) {
                await devFlowClient.sendHeartbeat();
                devFlowClient.startHeartbeat();
              }

              await syncConfig();

              return [
                `✅ Auto-discovered and linked to: ${linkedProjectName}`,
                `   Config: ${configPath}`,
                '',
                'DevFlow is now active in this directory.',
              ].join('\n');
            }
          }

          // No auto-discovery match — list available projects
          const result = await devFlowClient.listProjects();
          if (!result.success || !result.data || result.data.length === 0) {
            return [
              'No projects found.',
              '',
              'Create a new project:',
              '  devflow_connect({ createNew: true, name: "My Project" })',
            ].join('\n');
          }

          const lines = [
            'No project linked yet. Choose one or create a new one:',
            '',
            'Existing projects:',
            '─'.repeat(30),
          ];

          for (const p of result.data) {
            lines.push(`  ${p.name} (${p.id})`);
          }

          lines.push('');
          lines.push('Link to existing:');
          lines.push('  devflow_connect({ projectId: "<id>" })');
          lines.push('');
          lines.push('Create new:');
          lines.push('  devflow_connect({ createNew: true, name: "My Project" })');

          return lines.join('\n');
        }

        // Write .devflow.json
        const configPath = join(cwd, '.devflow.json');
        const config = {
          projectId: linkedProjectId,
          projectName: linkedProjectName,
          linkedAt: new Date().toISOString(),
        };
        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

        // Reload project config in client
        await devFlowClient.reloadProjectConfig();

        // Start heartbeat if not running
        if (!devFlowClient.hasActiveHeartbeat()) {
          await devFlowClient.sendHeartbeat();
          devFlowClient.startHeartbeat();
        }

        // Sync config
        await syncConfig();

        const lines = [
          `✅ Connected to project: ${linkedProjectName}`,
          `   Config: ${configPath}`,
        ];

        if (gitRemote) {
          lines.push(`   Repo: ${gitRemote}`);
        }

        lines.push('');
        lines.push('DevFlow is now active in this directory.');

        return lines.join('\n');
      } catch (error) {
        return `❌ Connect failed: ${error instanceof Error ? error.message : error}`;
      }
    },
  },
};
