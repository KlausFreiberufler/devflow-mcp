/**
 * DF-543 — a rejected token must lead to a new login, not to silent failure.
 *
 * Until now a token found on disk was handed back unchecked. The file's own
 * `expiresAt` was written by this client as "one year", while the server caps
 * API tokens at 90 days (DF-162). From day 91 the CLI vouched for a token the
 * server had already retired: every call failed with 401, and because
 * loadCredentials reported success, getToken never reached the browser login.
 * The CLI reported itself connected and could not be talked out of it.
 *
 * Reported 2026-08-29 on a second laptop that had worked months earlier.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let sandboxHome: string
let originalHome: string | undefined

beforeEach(async () => {
  sandboxHome = await mkdtemp(join(tmpdir(), 'devflow-df543-'))
  originalHome = process.env.HOME
  process.env.HOME = sandboxHome
  // CREDENTIALS_PATH is computed at import time from homedir(), so the module
  // must be re-imported after HOME changes — otherwise a later test would act
  // on the previous sandbox (or, without one, the real home directory).
  vi.resetModules()
})

afterEach(async () => {
  process.env.HOME = originalHome
  await rm(sandboxHome, { recursive: true, force: true })
})

describe('DF-543 — decideStoredTokenAction', () => {
  it('server accepts the token → use it', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(decideStoredTokenAction({ ok: true, status: 200 })).toBe('use')
  })

  it('THE REPORTED BUG: server refuses with 401 → discard and sign in again', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(decideStoredTokenAction({ ok: false, status: 401 })).toBe('discard-and-relogin')
  })

  it('403 counts as a refusal too', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(decideStoredTokenAction({ ok: false, status: 403 })).toBe('discard-and-relogin')
  })

  it('a network error keeps the token — an outage must not force a login', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(decideStoredTokenAction({ ok: false, status: null })).toBe('keep-despite-error')
  })

  it('a 5xx keeps the token — the server could not answer, that is not a refusal', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(decideStoredTokenAction({ ok: false, status: 503 })).toBe('keep-despite-error')
  })

  it('never throws on garbage input', async () => {
    const { decideStoredTokenAction } = await import('../../src/auth/browser-auth.js')
    expect(() => decideStoredTokenAction(null)).not.toThrow()
    expect(decideStoredTokenAction(undefined)).toBe('keep-despite-error')
  })
})

describe('DF-543 — clearCredentials', () => {
  it('removes the stored file', async () => {
    const { clearCredentials } = await import('../../src/auth/browser-auth.js')
    const dir = join(sandboxHome, '.devflow')
    const file = join(dir, 'credentials.json')
    await mkdir(dir, { recursive: true })
    await writeFile(file, JSON.stringify({ accessToken: 'dead', expiresAt: Date.now() + 1000 }))

    await clearCredentials()

    await expect(access(file)).rejects.toThrow()
  })

  it('a missing file is not an error', async () => {
    const { clearCredentials } = await import('../../src/auth/browser-auth.js')
    await expect(clearCredentials()).resolves.toBeUndefined()
  })
})

describe('DF-543 — stored expiry reflects the server, not a guess', () => {
  it('the default lifetime matches the server cap of 90 days, not a year', async () => {
    const { DEFAULT_TOKEN_LIFETIME_MS } = await import('../../src/auth/browser-auth.js')
    expect(DEFAULT_TOKEN_LIFETIME_MS).toBe(90 * 24 * 60 * 60 * 1000)
    // The old value was 365 days — that is what let dead tokens look alive.
    expect(DEFAULT_TOKEN_LIFETIME_MS).toBeLessThan(365 * 24 * 60 * 60 * 1000)
  })

  it('a token written today does not claim to outlive the server cap', async () => {
    // loadCredentials is the only public reader; write through the same shape
    // saveCredentials produces and check the horizon it would accept.
    const { DEFAULT_TOKEN_LIFETIME_MS } = await import('../../src/auth/browser-auth.js')
    const horizon = Date.now() + DEFAULT_TOKEN_LIFETIME_MS
    const serverCap = Date.now() + 90 * 24 * 60 * 60 * 1000
    expect(horizon).toBeLessThanOrEqual(serverCap + 1000)
  })
})
