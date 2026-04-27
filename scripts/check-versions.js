#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sources = {
  'package.json': () => JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version,
  '.claude-plugin/plugin.json': () =>
    JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf-8')).version,
  'src/config/version.ts': () => {
    const text = readFileSync(join(root, 'src', 'config', 'version.ts'), 'utf-8');
    const match = text.match(/MCP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (!match) throw new Error('Could not find MCP_VERSION in src/config/version.ts');
    return match[1];
  },
};

const versions = Object.fromEntries(
  Object.entries(sources).map(([file, read]) => [file, read()])
);

const distinct = new Set(Object.values(versions));

if (distinct.size === 1) {
  const [v] = distinct;
  console.log(`✅ Versions in sync: ${v}`);
  process.exit(0);
}

console.error('❌ Version drift detected:');
for (const [file, version] of Object.entries(versions)) {
  console.error(`  ${file.padEnd(36)} ${version}`);
}
console.error('\nRun: node scripts/bump-version.js <new-version>');
process.exit(1);
