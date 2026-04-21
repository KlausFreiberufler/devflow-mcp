import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockDevFlowClient, buildMockConfig } from '../fixtures/mockDevFlowClient.js'

// Hoisted mock handles — reassigned in beforeEach
let mockClient = createMockDevFlowClient()
let mockConfig = buildMockConfig()

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

// Import AFTER mocks
const { handleFlowUpdate } = await import('../../src/tools/flow.js')

describe('Rules Strictness Matrix', () => {
  beforeEach(() => {
    mockClient = createMockDevFlowClient({ currentState: 'approval' })
    mockConfig = buildMockConfig()
  })

  describe('planRequired', () => {
    it('Level 4: blocks approval transition without implementationPlan', async () => {
      mockConfig = buildMockConfig({ planRequired: 4 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'approval' })
      expect(result).toMatch(/⛔/)
      expect(result).toMatch(/Pflichtfelder/)
    })

    it('Level 4: passes approval transition with implementationPlan', async () => {
      mockConfig = buildMockConfig({ planRequired: 4 })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'approval',
        implementationPlan: '# Plan',
      })
      expect(result).not.toMatch(/⛔/)
    })

    it('Level 3: passes approval without implementationPlan (balanced)', async () => {
      mockConfig = buildMockConfig({ planRequired: 3 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'approval' })
      expect(result).not.toMatch(/⛔/)
    })
  })

  describe('taskTracking', () => {
    beforeEach(() => {
      mockClient = createMockDevFlowClient({ currentState: 'in_progress' })
      // For review transition, required fields must be satisfied.
      // Use reviewRequired 3 so agentSummary/testingInstructions aren't required.
    })

    it('Level 3: warns but passes review when no tasks', async () => {
      mockConfig = buildMockConfig({ taskTracking: 3, docsUpdate: 1 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })

    it('Level 4: blocks review when no tasks', async () => {
      mockConfig = buildMockConfig({ taskTracking: 4, docsUpdate: 1 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).toMatch(/⛔.*mindestens einen Task/)
    })

    it('Level 5: blocks review when tasks incomplete', async () => {
      mockConfig = buildMockConfig({ taskTracking: 5, docsUpdate: 1 })
      mockClient.tasks.push(
        { id: 't1', isCompleted: false, summary: 'offen' },
        { id: 't2', isCompleted: true, summary: 'fertig' },
      )
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).toMatch(/⛔.*Tasks.*abgeschlossen/)
    })

    it('Level 5: passes review when all tasks done', async () => {
      mockConfig = buildMockConfig({ taskTracking: 5, docsUpdate: 1 })
      mockClient.tasks.push(
        { id: 't1', isCompleted: true, summary: 'fertig 1' },
        { id: 't2', isCompleted: true, summary: 'fertig 2' },
      )
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })
  })

  describe('docsUpdate (THE BUG from DF-217)', () => {
    beforeEach(() => {
      mockClient = createMockDevFlowClient({ currentState: 'in_progress' })
      mockClient.tasks.push({ id: 't1', isCompleted: true, summary: 'fertig' })
    })

    it('Level 5: blocks review without any docs commit', async () => {
      mockConfig = buildMockConfig({ docsUpdate: 5 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).toMatch(/⛔.*Docs-Update/)
    })

    it('Level 5: passes review when docs commit is in SAME call', async () => {
      mockConfig = buildMockConfig({ docsUpdate: 5 })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        commits: [{ hash: 'abc', message: 'docs: new guide' }],
      })
      expect(result).not.toMatch(/⛔/)
    })

    it('Level 5: passes review when docs commit is PERSISTED (prior call)', async () => {
      // This is the DF-217 bug — after Phase A fix, should pass.
      mockConfig = buildMockConfig({ docsUpdate: 5 })
      mockClient.flow.commits = [{ hash: 'abc', message: 'docs: pre-existing' }]
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })

    it('Level 3: warns but passes without docs commit', async () => {
      mockConfig = buildMockConfig({ docsUpdate: 3 })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })
  })

  describe('reviewRequired', () => {
    beforeEach(() => {
      mockClient = createMockDevFlowClient({ currentState: 'in_progress' })
      mockClient.tasks.push({ id: 't1', isCompleted: true, summary: 'fertig' })
    })

    it('Level 4: blocks review without agentSummary', async () => {
      mockConfig = buildMockConfig({ reviewRequired: 4, docsUpdate: 1 })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        testingInstructions: 'test it',
      })
      expect(result).toMatch(/⛔.*Pflichtfelder/)
    })

    it('Level 4: blocks review without testingInstructions', async () => {
      mockConfig = buildMockConfig({ reviewRequired: 4, docsUpdate: 1 })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        agentSummary: 'summary',
      })
      expect(result).toMatch(/⛔.*Pflichtfelder/)
    })

    it('Level 4: passes review with both', async () => {
      mockConfig = buildMockConfig({ reviewRequired: 4, docsUpdate: 1 })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        agentSummary: 'summary',
        testingInstructions: 'test it',
      })
      expect(result).not.toMatch(/⛔/)
    })
  })
})
