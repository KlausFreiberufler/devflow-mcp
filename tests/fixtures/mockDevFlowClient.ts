import { vi } from 'vitest'
import type { Flow } from '../../src/api/client.js'

export interface MockFlowOverrides {
  id?: string
  projectId?: string
  currentState?: Flow['currentState']
  commits?: { hash: string; message: string }[] | null
  implementationPlan?: string
  agentSummary?: string
  testingInstructions?: string
  branchName?: string
  prUrl?: string
  prNumber?: number
  prState?: string
}

/**
 * Build a stub devFlowClient with configurable behavior for strictness tests.
 * Returned object is safe to spread into `vi.mock(...)` factories.
 */
export function createMockDevFlowClient(overrides: MockFlowOverrides = {}) {
  const flow: Partial<Flow> = {
    id: 'test-flow',
    projectId: 'test-project',
    summary: 'Test',
    currentState: 'approval',
    createdAt: new Date().toISOString(),
    commits: null,
    ...overrides,
  }
  const tasks: Array<{ id: string; isCompleted: boolean; summary: string }> = []

  return {
    flow,
    tasks,
    getFlow: vi.fn(async (_id: string) => ({ success: true, data: { ...flow } as Flow })),
    updateFlow: vi.fn(async (_id: string, patch: Partial<Flow>) => {
      Object.assign(flow, patch)
      if (Array.isArray(patch.commits)) {
        flow.commits = [...(flow.commits || []), ...patch.commits]
      }
      return { success: true, data: { ...flow } as Flow }
    }),
    listTasks: vi.fn(async () => ({ success: true, data: [...tasks] })),
    getFlows: vi.fn(async () => ({ success: true, data: [{ ...flow } as Flow] })),
  }
}

export interface MockConfig {
  strictness: {
    flowRequired: number
    planRequired: number
    taskTracking: number
    gitDiscipline: number
    reviewRequired: number
    docsUpdate: number
  }
  gitEnabled: boolean
  requiredFields: Record<string, { fields: string[]; message: string }>
}

export function buildMockConfig(overrides: Partial<MockConfig['strictness']> = {}, opts: { gitEnabled?: boolean } = {}): MockConfig {
  const strictness = {
    flowRequired: 3,
    planRequired: 3,
    taskTracking: 3,
    gitDiscipline: 3,
    reviewRequired: 3,
    docsUpdate: 3,
    ...overrides,
  }
  return {
    strictness,
    gitEnabled: opts.gitEnabled ?? false,
    requiredFields: {
      approval: strictness.planRequired >= 4
        ? { fields: ['implementationPlan'], message: `⛔ Plan fehlt (Level ${strictness.planRequired}).` }
        : { fields: [], message: '' },
      review: strictness.reviewRequired >= 4
        ? {
            fields: ['agentSummary', 'testingInstructions'],
            message: `⛔ agentSummary + testingInstructions erforderlich (Level ${strictness.reviewRequired}).`,
          }
        : { fields: [], message: '' },
    },
  }
}
