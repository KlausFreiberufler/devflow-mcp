// DF-436 — shouldAutoCompleteSession: unter agent_with_discipline bleibt die
// Agent-Session bei approval/review AKTIV (der Agent self-approved und
// arbeitet weiter); nur echte Human-Handoffs und done beenden sie.
import { describe, it, expect, vi } from 'vitest'
import { createMockDevFlowClient, buildMockConfig } from '../fixtures/mockDevFlowClient.js'

const mockClient = createMockDevFlowClient()
const mockConfig = buildMockConfig()

vi.mock('../../src/api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/client.js')>('../../src/api/client.js')
  return {
    ...actual,
    devFlowClient: new Proxy({}, {
      get(_target, prop) {
        // @ts-expect-error — dynamic dispatch
        return mockClient[prop]
      },
    }),
  }
})

vi.mock('../../src/config/sync.js', () => ({
  getConfig: () => mockConfig,
}))

vi.mock('../../src/utils/resolve-flow-id.js', () => ({
  resolveFlowId: vi.fn(async (id: string) => id),
}))

const { shouldAutoCompleteSession } = await import('../../src/tools/flow.js')

describe('DF-436 — shouldAutoCompleteSession', () => {
  it('approval + agent_with_discipline → Session bleibt aktiv', () => {
    expect(shouldAutoCompleteSession('approval', 'agent_with_discipline')).toBe(false)
  })

  it('review + agent_with_discipline → Session bleibt aktiv', () => {
    expect(shouldAutoCompleteSession('review', 'agent_with_discipline')).toBe(false)
  })

  it('done → Session wird IMMER beendet (auch unter agent_with_discipline)', () => {
    expect(shouldAutoCompleteSession('done', 'agent_with_discipline')).toBe(true)
    expect(shouldAutoCompleteSession('done', 'human_only')).toBe(true)
  })

  it('approval/review + human_only bzw. ohne Policy → Session wird beendet (Handoff)', () => {
    expect(shouldAutoCompleteSession('approval', 'human_only')).toBe(true)
    expect(shouldAutoCompleteSession('review', 'human_or_agent')).toBe(true)
    expect(shouldAutoCompleteSession('approval', null)).toBe(true)
    expect(shouldAutoCompleteSession('approval', undefined)).toBe(true)
  })

  it('Arbeits-States beenden nie', () => {
    expect(shouldAutoCompleteSession('in_progress', 'human_only')).toBe(false)
    expect(shouldAutoCompleteSession('planning', null)).toBe(false)
  })
})
