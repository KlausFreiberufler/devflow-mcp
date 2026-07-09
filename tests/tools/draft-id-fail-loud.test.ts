// DF-477 — knowledge_draft_accept/reject must fail loud when the draft id
// is missing (the MCP layer does not enforce the schema) and must accept
// `draftId` as an alias for `id`. Before this fix, an undefined id traveled
// into the backend URL and came back as a misleading "Draft not found".
import { describe, it, expect, vi, beforeEach } from 'vitest'

const acceptKnowledgeDraft = vi.fn()
const rejectKnowledgeDraft = vi.fn()

vi.mock('../../src/api/client.js', () => ({
  devFlowClient: {
    acceptKnowledgeDraft: (...a: unknown[]) => acceptKnowledgeDraft(...a),
    rejectKnowledgeDraft: (...a: unknown[]) => rejectKnowledgeDraft(...a),
    getLinkedProjectId: () => null,
  },
}))

import { tools, resolveDraftId } from '../../src/tools/knowledgeDrafts.js'

describe('DF-477 — draft id fail-loud + draftId alias', () => {
  beforeEach(() => {
    acceptKnowledgeDraft.mockReset().mockResolvedValue({ success: true })
    rejectKnowledgeDraft.mockReset().mockResolvedValue({ success: true })
  })

  it('resolveDraftId prefers id, falls back to draftId, rejects garbage', () => {
    expect(resolveDraftId({ id: 'a' })).toBe('a')
    expect(resolveDraftId({ draftId: 'b' })).toBe('b')
    expect(resolveDraftId({ id: 'a', draftId: 'b' })).toBe('a')
    expect(resolveDraftId({})).toBeNull()
    expect(resolveDraftId({ id: '' })).toBeNull()
    expect(resolveDraftId({ id: 42 })).toBeNull()
  })

  it('accept with draftId alias reaches the client with the right id', async () => {
    const out = await tools.knowledge_draft_accept.handler({ draftId: 'd-1' })
    expect(acceptKnowledgeDraft).toHaveBeenCalledWith('d-1')
    expect(out).toContain('d-1 accepted')
  })

  it('accept without any id fails loud and never calls the backend', async () => {
    const out = await tools.knowledge_draft_accept.handler({})
    expect(out).toMatch(/id .*is required/i)
    expect(acceptKnowledgeDraft).not.toHaveBeenCalled()
  })

  it('accept with plain id keeps working unchanged', async () => {
    const out = await tools.knowledge_draft_accept.handler({ id: 'd-2' })
    expect(acceptKnowledgeDraft).toHaveBeenCalledWith('d-2')
    expect(out).toContain('d-2 accepted')
  })

  it('reject mirrors the same behavior (alias + fail-loud)', async () => {
    await tools.knowledge_draft_reject.handler({ draftId: 'd-3', notes: 'nope' })
    expect(rejectKnowledgeDraft).toHaveBeenCalledWith('d-3', 'nope')

    const out = await tools.knowledge_draft_reject.handler({})
    expect(out).toMatch(/id .*is required/i)
    expect(rejectKnowledgeDraft).toHaveBeenCalledTimes(1)
  })
})
