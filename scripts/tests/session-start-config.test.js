import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.join(__dirname, '..', '..', 'hooks');

test('session-start.json wires check-plugin-update.js', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(hooksDir, 'session-start.json'), 'utf8'));
  const sessionStartEntry = (cfg.hooks || []).find(h => h.matcher === 'SessionStart');
  assert.ok(sessionStartEntry, 'SessionStart hook entry must exist');
  const cmds = (sessionStartEntry.hooks || []).map(h => h.command);
  assert.ok(
    cmds.some(c => c.includes('check-plugin-update.js')),
    `SessionStart must wire check-plugin-update.js. Got: ${JSON.stringify(cmds)}`
  );
  assert.ok(
    cmds.some(c => c.includes('session-start-info.sh')),
    'Existing session-start-info.sh wiring must be preserved'
  );
});
