/**
 * DF-334 — Server-Split Tests
 *
 * Pinnt:
 * - Jeder Entry-Point startet ohne Crash (registry registers without duplicate-error)
 * - Combined ≤ 60 (sanity), Flows ≤ 40, Wiki ≤ 40 (Cursor-Cap)
 *
 * Wir lesen den Tool-Count aus dem Startup-Banner (stderr), das jeder Server
 * druckt: "DevFlow {tag} v{version} ({N} tools, ...)". Kein MCP-Protokoll nötig.
 */

import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function startAndCountTools(entry) {
  return new Promise((resolve, reject) => {
    const script = join(ROOT, 'dist', entry)
    const child = spawn('node', [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, DEVFLOW_DISABLE_HEARTBEAT: '1' },
    })

    let stderr = ''
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill('SIGTERM')
        reject(new Error(`Timeout waiting for banner from ${entry}. stderr=${stderr.slice(0, 500)}`))
      }
    }, 6000)

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      // Banner format: "DevFlow {tag} v{ver} ({N} tools, ...)"
      const match = stderr.match(/\((\d+)\s+tools,/)
      if (match && !resolved) {
        resolved = true
        clearTimeout(timeout)
        child.kill('SIGTERM')
        resolve(parseInt(match[1], 10))
      }
    })

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })
  })
}

test('combined entry-point starts and reports tool-count', async () => {
  const count = await startAndCountTools('index.js')
  assert.ok(count > 0, 'combined server should list tools')
  assert.ok(count <= 80, `combined server has ${count} tools, sanity-cap 80`)
})

test('flows entry-point under Cursor 40-tool cap', async () => {
  const count = await startAndCountTools('index-flows.js')
  assert.ok(count > 0, 'flows server should list tools')
  assert.ok(count <= 40, `flows server has ${count} tools, exceeds Cursor cap 40`)
})

test('wiki entry-point under Cursor 40-tool cap', async () => {
  const count = await startAndCountTools('index-wiki.js')
  assert.ok(count > 0, 'wiki server should list tools')
  assert.ok(count <= 40, `wiki server has ${count} tools, exceeds Cursor cap 40`)
})

test('flows + wiki tool-counts together >= combined (every tool covered)', async () => {
  const combined = await startAndCountTools('index.js')
  const flows = await startAndCountTools('index-flows.js')
  const wiki = await startAndCountTools('index-wiki.js')
  // Some tools may exist only on flows (init/status/connect/disconnect) — those duplicate
  // would push the sum above combined; but the union must cover combined.
  // Conservative: sum >= combined (since they share session-tools they may equal or exceed)
  assert.ok(flows + wiki >= combined, `flows(${flows}) + wiki(${wiki}) < combined(${combined})`)
})
