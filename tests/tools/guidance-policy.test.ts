// DF-437 AC-5 — getGuidanceFor: approval/review guidance must be
// self-approval-aware. Under `agent_with_discipline` the agent transitions
// itself (with DF-435 body-field evidence) instead of waiting for the user.
import { describe, it, expect } from 'vitest'
import { getGuidanceFor } from '../../src/context/permissions.js'

describe('DF-437 — policy-aware next-step guidance', () => {
  it('approval + agent_with_discipline → self-approve guidance, no waiting', () => {
    const g = getGuidanceFor('approval', 'agent_with_discipline')
    expect(g).not.toMatch(/Warte auf User/i)
    expect(g).toMatch(/flow_update/)
    expect(g).toMatch(/testStrategy/)
  })

  it('review + agent_with_discipline → self-approve guidance with review evidence fields', () => {
    const g = getGuidanceFor('review', 'agent_with_discipline')
    expect(g).not.toMatch(/Warte auf User/i)
    expect(g).toMatch(/acVerification/)
    expect(g).toMatch(/planReconciliation/)
  })

  it('approval + human_only → keeps the waiting guidance', () => {
    const g = getGuidanceFor('approval', 'human_only')
    expect(g).toMatch(/Warte auf User|flow_get_feedback/i)
  })

  it('non-review states are unaffected by the policy', () => {
    const g = getGuidanceFor('in_progress', 'agent_with_discipline')
    expect(g).toMatch(/Implementierung|Tasks/i)
  })

  it('missing policy falls back to the configured default', () => {
    const g = getGuidanceFor('review', null)
    expect(typeof g).toBe('string')
    expect(g.length).toBeGreaterThan(10)
  })
})
