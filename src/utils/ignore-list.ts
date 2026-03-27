import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const IGNORE_PATH = join(homedir(), '.devflow', 'ignored-projects.json');

/**
 * Normalize a git remote URL for consistent matching.
 * git@github.com:owner/repo.git → github.com/owner/repo
 * https://github.com/owner/repo.git → github.com/owner/repo
 */
export function normalizeRepoUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim();
  // git@host:owner/repo → host/owner/repo
  normalized = normalized.replace(/^git@([^:]+):/, '$1/');
  // https://host/... → host/...
  normalized = normalized.replace(/^https?:\/\//, '');
  // Remove trailing .git
  normalized = normalized.replace(/\.git$/, '');
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  // Lowercase
  normalized = normalized.toLowerCase();
  return normalized;
}

function loadIgnoreList(): string[] {
  try {
    if (!existsSync(IGNORE_PATH)) return [];
    const data = JSON.parse(readFileSync(IGNORE_PATH, 'utf-8'));
    return Array.isArray(data.ignored) ? data.ignored : [];
  } catch {
    return [];
  }
}

function saveIgnoreList(list: string[]): void {
  const dir = dirname(IGNORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(IGNORE_PATH, JSON.stringify({ ignored: list }, null, 2), 'utf-8');
}

export function isIgnored(repoUrl: string): boolean {
  const normalized = normalizeRepoUrl(repoUrl);
  if (!normalized) return false;
  return loadIgnoreList().includes(normalized);
}

export function addToIgnoreList(repoUrl: string): void {
  const normalized = normalizeRepoUrl(repoUrl);
  if (!normalized) return;
  const list = loadIgnoreList();
  if (!list.includes(normalized)) {
    list.push(normalized);
    saveIgnoreList(list);
  }
}

export function removeFromIgnoreList(repoUrl: string): void {
  const normalized = normalizeRepoUrl(repoUrl);
  if (!normalized) return;
  const list = loadIgnoreList().filter(url => url !== normalized);
  saveIgnoreList(list);
}

export function getIgnoreList(): string[] {
  return loadIgnoreList();
}
