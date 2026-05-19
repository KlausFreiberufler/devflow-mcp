#!/usr/bin/env node
/**
 * Stop-Hook for DevFlow — DF-405
 *
 * Replaces the previous informational-only stop-check.
 *
 * Before: printed a "consider transitioning" warning to stdout, exited 0,
 *         agent ignored it and ended the session anyway.
 * After:  if the active flow is in a non-terminal state, returns exit 2
 *         and reinjects the precise next tool call the agent must make.
 *
 * Exit codes (Claude Code hook protocol):
 *   0  → pass through, agent may end session
 *   2  → BLOCK · stderr is reinjected into agent context
 *
 * Escape hatch:
 *   DEVFLOW_STOP_HOOK_SOFT=1  → warn but don't block (removed in 4.33.0).
 *
 * State semantics:
 *   idea, planning, ready, in_progress  → must transition forward
 *   approval, review, done              → wait states · safe to end session
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WAIT_STATES = new Set(['approval', 'review', 'done']);

const NEXT_TRANSITION = {
  idea: { target: 'planning', why: 'create implementation plan' },
  planning: { target: 'approval', why: 'submit plan for approval' },
  ready: { target: 'in_progress', why: 'begin implementation' },
  in_progress: {
    target: 'review',
    why: 'mark implementation ready for review',
    requires: ['agentSummary', 'testingInstructions'],
  },
};

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'CLAUDE.md')) || existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

const root = findRepoRoot(process.cwd());
if (!root) process.exit(0);

// Only enforce in DevFlow-managed projects.
const claudeMd = path.join(root, 'CLAUDE.md');
if (!existsSync(claudeMd) || !readFileSync(claudeMd, 'utf-8').includes('devflow_init')) {
  process.exit(0);
}

const activeFile = path.join(root, '.devflow-active');
if (!existsSync(activeFile)) process.exit(0);

let active;
try {
  active = JSON.parse(readFileSync(activeFile, 'utf-8'));
} catch {
  // Corrupt active file — fail open so a broken JSON never traps the agent.
  process.stderr.write('[devflow] .devflow-active is unreadable — skipping stop-check\n');
  process.exit(0);
}

// Wait state? Agent may legitimately end the session.
if (WAIT_STATES.has(active.state)) {
  process.exit(0);
}

const next = NEXT_TRANSITION[active.state];
if (!next) {
  // Unknown state — fail open instead of trapping the agent forever.
  process.stderr.write(
    `[devflow] flow ${active.displayId} is in unknown state '${active.state}' — passing through\n`
  );
  process.exit(0);
}

// Escape hatch: opt out of the hard block for one version.
if (process.env.DEVFLOW_STOP_HOOK_SOFT === '1') {
  process.stderr.write(
    `[devflow] Soft mode — would have blocked exit on flow ${active.displayId} (state: ${active.state}).\n` +
    `Set DEVFLOW_STOP_HOOK_SOFT=0 (or unset) to enforce. Soft mode is removed in 4.33.0.\n`
  );
  process.exit(0);
}

const requiredFields = next.requires
  ? `,\n    ${next.requires.map((f) => `${f}: "..."`).join(',\n    ')}`
  : '';

process.stderr.write(
  `[devflow] Cannot end session.\n` +
  `\n` +
  `  Active flow:  ${active.displayId} (${active.title || 'untitled'})\n` +
  `  State:        ${active.state}  →  expected ${next.target}\n` +
  `  Reason:       ${next.why}\n` +
  `\n` +
  `Required next action — call this tool now:\n` +
  `\n` +
  `  flow_update({\n` +
  `    flowId: "${active.flowId}",\n` +
  `    currentState: "${next.target}"${requiredFields}\n` +
  `  })\n` +
  `\n` +
  `After the transition lands, you may end the session.\n` +
  `If you genuinely cannot complete the transition (e.g. blocked on user input),\n` +
  `instead call flow_update with currentState: "approval" or "review" so the flow\n` +
  `rests in a wait state.\n`
);

process.exit(2);
