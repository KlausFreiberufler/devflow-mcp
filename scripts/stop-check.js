#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WAIT_STATES = new Set(['approval', 'review', 'done']);

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
  process.exit(0);
}

if (!WAIT_STATES.has(active.state)) {
  process.stdout.write(
    `⚠️  Active flow ${active.displayId} is in state '${active.state}' — ` +
    `not a wait state. Consider completing tasks, submitting review, or transitioning state before ending.\n`
  );
}
