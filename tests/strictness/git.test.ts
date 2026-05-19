import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockDevFlowClient, buildMockConfig } from '../fixtures/mockDevFlowClient.js'

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

const { handleFlowUpdate } = await import('../../src/tools/flow.js')

describe('Git Strictness Matrix', () => {
  beforeEach(() => {
    mockClient = createMockDevFlowClient({ currentState: 'in_progress' })
    mockClient.tasks.push({ id: 't1', isCompleted: true, summary: 'fertig' })
  })

  describe('gitDiscipline with gitEnabled=false', () => {
    it('Level 5: skips all git checks when gitEnabled is false', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: false })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })
  })

  describe('gitDiscipline Level 4 (branch required)', () => {
    it('warns (soft) without branchName — transition still succeeds', async () => {
      // Since DF-377 / v4.30.0 the plugin emits informational warnings instead of
      // hard-blocking; the backend may still enforce a gate at this strictness level.
      mockConfig = buildMockConfig({ gitDiscipline: 4, docsUpdate: 1 }, { gitEnabled: true })
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).toMatch(/Flow updated successfully/)
      expect(result).toMatch(/🌿.*branchName/)
    })

    it('passes with branchName set in the call', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 4, docsUpdate: 1 }, { gitEnabled: true })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        branchName: 'feature/DF-218-test',
      })
      expect(result).not.toMatch(/⛔/)
    })

    it('passes with branchName persisted on flow', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 4, docsUpdate: 1 }, { gitEnabled: true })
      mockClient.flow.branchName = 'feature/DF-218-test'
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })
  })

  describe('gitDiscipline Level 5 (branch + PR + commits required)', () => {
    beforeEach(() => {
      mockClient.flow.branchName = 'feature/DF-218-test'
    })

    it('warns (soft) without prUrl — transition still succeeds', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: true })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        commits: [{ hash: 'abc', message: 'feat: x' }],
      })
      expect(result).toMatch(/Flow updated successfully/)
      expect(result).toMatch(/🔗.*prUrl/)
    })

    it('warns (soft) without any commits — transition still succeeds', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: true })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        prUrl: 'https://github.com/x/y/pull/1',
      })
      expect(result).toMatch(/Flow updated successfully/)
      expect(result).toMatch(/📦.*commits/)
    })

    it('passes with branch + prUrl + commits all in same call', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: true })
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        prUrl: 'https://github.com/x/y/pull/1',
        commits: [{ hash: 'abc', message: 'feat: x' }],
      })
      expect(result).not.toMatch(/⛔/)
    })

    it('passes when commits persisted from prior call (DF-218 fix)', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: true })
      mockClient.flow.commits = [{ hash: 'abc', message: 'feat: earlier' }]
      const result = await handleFlowUpdate({
        flowId: 'test-flow',
        currentState: 'review',
        prUrl: 'https://github.com/x/y/pull/1',
      })
      expect(result).not.toMatch(/⛔/)
    })

    it('passes when prUrl persisted from prior call', async () => {
      mockConfig = buildMockConfig({ gitDiscipline: 5, docsUpdate: 1 }, { gitEnabled: true })
      mockClient.flow.prUrl = 'https://github.com/x/y/pull/1'
      mockClient.flow.commits = [{ hash: 'abc', message: 'feat: earlier' }]
      const result = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'review' })
      expect(result).not.toMatch(/⛔/)
    })
  })
})
