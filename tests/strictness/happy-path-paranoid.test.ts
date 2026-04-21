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

/**
 * Walk a flow from `planning` all the way to `done` under Paranoid strictness
 * (every gate at level 5). Each transition must pass with realistic data.
 *
 * This covers the user-visible contract: if a project enables maximum strictness
 * and the agent feeds realistic state at each step, the system should not block
 * them.
 */
describe('Happy-path idea → done on Paranoid (all gates level 5)', () => {
  beforeEach(() => {
    mockConfig = buildMockConfig(
      {
        flowRequired: 5,
        planRequired: 5,
        taskTracking: 5,
        gitDiscipline: 5,
        reviewRequired: 5,
        docsUpdate: 5,
      },
      { gitEnabled: true }
    )
  })

  it('completes the whole chain without any ⛔', async () => {
    mockClient = createMockDevFlowClient({ currentState: 'idea' })

    // idea → planning: no gates enforced on this transition
    let r = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'planning' })
    expect(r).not.toMatch(/⛔/)

    // planning → approval: planRequired=5 requires implementationPlan
    r = await handleFlowUpdate({
      flowId: 'test-flow',
      currentState: 'approval',
      implementationPlan: '# Detailed plan\n\n## AC\n- ...',
    })
    expect(r).not.toMatch(/⛔/)

    // Seed the state the backend would have by now.
    mockClient.flow.currentState = 'in_progress'
    mockClient.tasks.push(
      { id: 't1', isCompleted: true, summary: 'Build feature' },
      { id: 't2', isCompleted: true, summary: 'Write tests' },
      { id: 't3', isCompleted: true, summary: 'Update docs' }
    )
    mockClient.flow.branchName = 'feature/DF-218-happy'
    mockClient.flow.commits = [
      { hash: 'aaaa', message: 'feat: core logic' },
      { hash: 'bbbb', message: 'docs: updated guide' },
      { hash: 'cccc', message: 'test: add coverage' },
    ]
    mockClient.flow.prUrl = 'https://github.com/KlausFreiberufler/devflow/pull/999'

    // in_progress → review: taskTracking=5 (all done), docsUpdate=5 (has docs commit),
    // gitDiscipline=5 (branch + PR + commits), reviewRequired=5 (summary + instructions)
    r = await handleFlowUpdate({
      flowId: 'test-flow',
      currentState: 'review',
      agentSummary: 'All phases complete',
      testingInstructions: 'Run npm test + manual smoke',
    })
    expect(r).not.toMatch(/⛔/)

    // review → done: no strictness-side gates enforced here
    r = await handleFlowUpdate({ flowId: 'test-flow', currentState: 'done' })
    expect(r).not.toMatch(/⛔/)
  })

  it('scenario: docs commit sent separately, then review without commits — passes (DF-217 bug)', async () => {
    mockClient = createMockDevFlowClient({ currentState: 'in_progress' })
    mockClient.tasks.push({ id: 't1', isCompleted: true, summary: 'fertig' })
    mockClient.flow.branchName = 'feature/DF-218-sep'
    mockClient.flow.prUrl = 'https://github.com/x/y/pull/1'

    // Step 1: register docs commit in separate call
    await handleFlowUpdate({
      flowId: 'test-flow',
      commits: [{ hash: 'docs01', message: 'docs: guide' }],
    })
    // Simulate backend persistence
    mockClient.flow.commits = [{ hash: 'docs01', message: 'docs: guide' }]

    // Step 2: transition to review WITHOUT commits in this call
    const r = await handleFlowUpdate({
      flowId: 'test-flow',
      currentState: 'review',
      agentSummary: 'done',
      testingInstructions: 'test',
    })
    expect(r).not.toMatch(/⛔/)
  })
})
