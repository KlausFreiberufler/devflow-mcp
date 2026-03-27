/**
 * devflow_disconnect — Disconnect this project from DevFlow
 *
 * Discovery tool (works without devflow_init).
 * Adds the current directory to the ignore list so DevFlow stays quiet here.
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import type { ToolModule } from './registry.js';
import { devFlowClient } from '../api/client.js';
import { detectGitRemoteUrl } from '../utils/git.js';
import { addToIgnoreList } from '../utils/ignore-list.js';
import { sessionContext } from '../context/session.js';

export const tools: ToolModule = {
  devflow_disconnect: {
    definition: {
      name: 'devflow_disconnect',
      description:
        'Disconnect this project from DevFlow. Adds the current directory to the ignore list ' +
        'so DevFlow stays quiet here. You can re-enable anytime with devflow_connect.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    handler: async (args) => {
      const cwd = process.cwd();
      const lines: string[] = [];

      try {
        // Detect git remote and add to ignore list
        const gitRemote = await detectGitRemoteUrl(cwd);
        if (gitRemote) {
          addToIgnoreList(gitRemote);
          lines.push(`✅ Added to ignore list: ${gitRemote}`);
        }

        // Remove .devflow.json if exists
        const configPath = join(cwd, '.devflow.json');
        if (existsSync(configPath)) {
          rmSync(configPath);
          lines.push(`✅ Removed: ${configPath}`);
        } else {
          lines.push('ℹ No .devflow.json found in this directory.');
        }

        // Stop heartbeat
        devFlowClient.stopHeartbeat();
        lines.push('⏹ Heartbeat stopped');

        // Clear session context if active
        if (sessionContext.isActive()) {
          const ctx = sessionContext.get();
          if (ctx?.sessionId) {
            devFlowClient.completeAgentSession(ctx.sessionId).catch(() => {});
          }
          sessionContext.release();
          lines.push('⏹ Session context cleared');
        }

        // Clear project config
        devFlowClient.clearProjectConfig();

        lines.push('');
        lines.push('DevFlow is now disconnected from this directory.');
        lines.push('Re-enable anytime with: devflow_connect()');

        return lines.join('\n');
      } catch (error) {
        return `❌ Disconnect failed: ${error instanceof Error ? error.message : error}`;
      }
    },
  },
};
