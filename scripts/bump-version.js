#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(next)) {
  console.error('Usage: node scripts/bump-version.js <semver>');
  console.error('  e.g.  node scripts/bump-version.js 4.15.0');
  process.exit(1);
}

const targets = [
  {
    file: 'package.json',
    update: (text) => text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`),
  },
  {
    file: '.claude-plugin/plugin.json',
    update: (text) => text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`),
  },
  {
    file: 'src/config/version.ts',
    update: (text) =>
      text.replace(/(MCP_VERSION\s*=\s*['"])[^'"]+(['"])/, `$1${next}$2`),
  },
];

for (const { file, update } of targets) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf-8');
  const after = update(before);
  if (before === after) {
    console.error(`❌ ${file}: pattern did not match — aborting`);
    process.exit(1);
  }
  writeFileSync(path, after);
  console.log(`✅ ${file} → ${next}`);
}

console.log(`\nNext: npm run build && git add -u src/ && git add dist/ package.json .claude-plugin/plugin.json && git commit -m "chore: bump to ${next}"`);
