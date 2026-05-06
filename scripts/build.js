#!/usr/bin/env node
import { build } from 'esbuild';
import { rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });

// Bundle JS — single file per entry, all deps inlined.
// Node built-ins stay external (esbuild handles that automatically).
await build({
  entryPoints: {
    index: 'src/index.ts',
    'index-flows': 'src/index-flows.ts',
    'index-wiki': 'src/index-wiki.ts',
    'setup/setup': 'src/setup/setup.ts',
  },
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outdir: 'dist',
  outExtension: { '.js': '.js' },
  // shebang lives in src/index.ts and src/setup/setup.ts — esbuild preserves it
  // ESM + bundling needs this so dynamic require() in deps still works
  define: { 'import.meta.url': 'import.meta.url' },
  // Mark as side-effect-free via package's type=module
  legalComments: 'none',
  minify: false,        // keep stack traces readable
  sourcemap: false,
  logLevel: 'info',
});

// chmod +x on bin entries (banner already injects shebang)
await chmod(join(dist, 'index.js'), 0o755);
await chmod(join(dist, 'index-flows.js'), 0o755);
await chmod(join(dist, 'index-wiki.js'), 0o755);
await chmod(join(dist, 'setup', 'setup.js'), 0o755);

// Type declarations: tsc emits *.d.ts only, no JS (we already wrote those).
console.log('\n→ Generating .d.ts via tsc');
execSync('npx tsc --emitDeclarationOnly --outDir dist', { stdio: 'inherit' });

console.log('\n✅ Build complete');
