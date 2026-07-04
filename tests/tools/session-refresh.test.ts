// DF-437 AC-4 — refreshFromBackend must refetch allowedActions/transitionPolicy
// UNCONDITIONALLY, not only when the flow state changed. A mid-session
// Self-Approval-toggle flips allowedActions without a state change; the old
// guard left the client blocking flow_update before the backend was asked.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getFlow = vi.fn()
const getNextStep = vi.fn()

vi.mock('../../src/api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/client.js')>('../../src/api/client.js')
  return {
    ...actual,
    devFlowClient: new Proxy({}, {
      get(_target, prop) {
        if (prop === 'getFlow') return getFlow
        if (prop === 'getNextStep') return getNextStep
        return vi.fn()
      },
    }),
  }
})

const { sessionContext } = await import('../../src/context/session.js')

function seedContext(overrides: Record<string, unknown> = {}) {
  sessionContext.init({
    flow: { id: 'flow-1', currentState: 'approval' } as any,
    sessionId: 'local-session',
    startedAt: new Date().toISOString(),
    tasks: [],
    allowedActions: ['flow_get'],
    nextStep: 'wait',
    transitionPolicy: 'human_only',
    ...overrides,
  } as any)
}

describe('DF-437 — refreshFromBackend unconditional allowedActions refresh', () => {
  beforeEach(() => {
    getFlow.mockReset()
    getNextStep.mockReset()
  })

  it('picks up new allowedActions even when the flow state is unchanged', async () => {
    seedContext()
    getFlow.mockResolvedValue({ success: true, data: { id: 'flow-1', currentState: 'approval' } })
    getNextStep.mockResolvedValue({
      success: true,
      data: { allowedActions: ['flow_get', 'flow_update'], transitionPolicy: 'agent_with_discipline', kind: 'review' },
    })

    const changed = await sessionContext.refreshFromBackend()

    expect(getNextStep).toHaveBeenCalledTimes(1)
    expect(changed).toBe(true)
    expect(sessionContext.get()?.allowedActions).toContain('flow_update')
    expect(sessionContext.get()?.transitionPolicy).toBe('agent_with_discipline')
  })

  it('returns false when neither state nor allowedActions changed', async () => {
    seedContext()
    getFlow.mockResolvedValue({ success: true, data: { id: 'flow-1', currentState: 'approval' } })
    getNextStep.mockResolvedValue({
      success: true,
      data: { allowedActions: ['flow_get'], transitionPolicy: 'human_only', kind: 'review' },
    })

    const changed = await sessionContext.refreshFromBackend()
    expect(changed).toBe(false)
  })

  it('still detects plain state changes', async () => {
    seedContext()
    getFlow.mockResolvedValue({ success: true, data: { id: 'flow-1', currentState: 'ready' } })
    getNextStep.mockResolvedValue({
      success: true,
      data: { allowedActions: ['flow_get'], transitionPolicy: 'auto', kind: 'work' },
    })

    const changed = await sessionContext.refreshFromBackend()
    expect(changed).toBe(true)
    expect(sessionContext.get()?.flow.currentState).toBe('ready')
  })
})
