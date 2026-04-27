import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, stat, writeFile, chmod, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Sandbox $HOME so saveCredentials/loadCredentials write into a temp dir
let sandboxHome: string
let originalHome: string | undefined

beforeEach(async () => {
  sandboxHome = await mkdtemp(join(tmpdir(), 'devflow-cred-test-'))
  originalHome = process.env.HOME
  process.env.HOME = sandboxHome
  vi.resetModules()
})

afterEach(async () => {
  process.env.HOME = originalHome
  await rm(sandboxHome, { recursive: true, force: true })
})

describe('credentials file permissions', () => {
  it('writes new credentials with mode 0o600', async () => {
    const mod = await import('../../src/auth/browser-auth.js')
    // saveCredentials is private — exercise it via the public load() after a manual write,
    // OR via the side effect of getToken with DEVFLOW_TOKEN env. Cleaner: use a wrapper.
    // Here we simulate the production path by calling the internal save via a re-export shim.
    // Since saveCredentials isn't exported, we test the migration-on-load path which exercises chmod.

    // Write a creds file with broad permissions, simulating an old install
    const credsPath = join(sandboxHome, '.devflow', 'credentials.json')
    await import('node:fs/promises').then((fs) => fs.mkdir(join(sandboxHome, '.devflow'), { recursive: true }))
    await writeFile(credsPath, JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3600_000 }))
    await chmod(credsPath, 0o644)

    const before = await stat(credsPath)
    expect(before.mode & 0o777).toBe(0o644)

    const token = await mod.loadCredentials()
    expect(token).toBe('tok')

    const after = await stat(credsPath)
    // chmod 600 should have been applied by the migration path
    expect(after.mode & 0o777).toBe(0o600)
  })

  it('leaves already-tight permissions alone', async () => {
    const credsPath = join(sandboxHome, '.devflow', 'credentials.json')
    await import('node:fs/promises').then((fs) => fs.mkdir(join(sandboxHome, '.devflow'), { recursive: true }))
    await writeFile(credsPath, JSON.stringify({ accessToken: 'tok2', expiresAt: Date.now() + 3600_000 }))
    await chmod(credsPath, 0o600)

    const mod = await import('../../src/auth/browser-auth.js')
    const token = await mod.loadCredentials()
    expect(token).toBe('tok2')

    const after = await stat(credsPath)
    expect(after.mode & 0o777).toBe(0o600)
  })

  it('expired credentials still get permission migration', async () => {
    const credsPath = join(sandboxHome, '.devflow', 'credentials.json')
    await import('node:fs/promises').then((fs) => fs.mkdir(join(sandboxHome, '.devflow'), { recursive: true }))
    await writeFile(credsPath, JSON.stringify({ accessToken: 'old', expiresAt: Date.now() - 1000 }))
    await chmod(credsPath, 0o644)

    const mod = await import('../../src/auth/browser-auth.js')
    const token = await mod.loadCredentials()
    expect(token).toBeNull() // expired

    const after = await stat(credsPath)
    expect(after.mode & 0o777).toBe(0o600)
  })
})
