// DF-439 — (a) wiki health/curation reads are DISCOVERY_TOOLS (usable without
// devflow_init), (b) devflow_init embeds a compact wiki briefing, tolerant of
// backend failures.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchWikiContext = vi.fn()

vi.mock('../../src/api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/client.js')>('../../src/api/client.js')
  return {
    ...actual,
    devFlowClient: new Proxy({}, {
      get(_target, prop) {
        if (prop === 'fetchWikiContext') return fetchWikiContext
        return vi.fn()
      },
    }),
  }
})

const { DISCOVERY_TOOLS } = await import('../../src/context/permissions.js')
const { buildInitWikiBriefing } = await import('../../src/tools/init.js')

describe('DF-439 — Wiki-Discovery-Tools', () => {
  it('die 6 Curation-Reads sind ohne devflow_init nutzbar', () => {
    for (const tool of ['wiki_get_lint', 'wiki_get_index', 'wiki_get_log', 'ideas_get', 'idea_prompts_get', 'error_context_get']) {
      expect(DISCOVERY_TOOLS.has(tool), `${tool} fehlt in DISCOVERY_TOOLS`).toBe(true)
    }
  })
})

describe('DF-439 — Init-Wiki-Briefing', () => {
  beforeEach(() => fetchWikiContext.mockReset())

  it('rendert kompakte Briefing-Section mit ADRs, Docs und Gaps', async () => {
    fetchWikiContext.mockResolvedValue({
      success: true,
      data: {
        relatedAdrs: [{ number: 134, title: 'Self-Approval Toggle Resolution' }],
        relatedDocs: [{ title: 'Pipeline Allowlist Computation', documentType: 'pattern' }],
        gaps: [{ topic: 'webhook' }, { topic: 'queue' }],
      },
    })
    const out = await buildInitWikiBriefing('flow-1')
    expect(out).toContain('## Wiki-Briefing')
    expect(out).toContain('ADR-134 Self-Approval Toggle Resolution')
    expect(out).toContain('Pipeline Allowlist Computation (pattern)')
    expect(out).toContain('Offene Knowledge-Gaps:** 2')
    expect(out).toContain('webhook')
  })

  it('leerer Kontext → leerer String (keine leere Section)', async () => {
    fetchWikiContext.mockResolvedValue({ success: true, data: { relatedAdrs: [], relatedDocs: [], gaps: [] } })
    expect(await buildInitWikiBriefing('flow-1')).toBe('')
  })

  it('Backend-Fehler → leerer String, kein Throw', async () => {
    fetchWikiContext.mockResolvedValue({ success: false, error: 'boom' })
    expect(await buildInitWikiBriefing('flow-1')).toBe('')
  })

  it('maximal 3 ADRs/Docs, Gap-Liste gekürzt', async () => {
    fetchWikiContext.mockResolvedValue({
      success: true,
      data: {
        relatedAdrs: Array.from({ length: 5 }, (_, i) => ({ number: i + 1, title: `A${i + 1}` })),
        relatedDocs: [],
        gaps: Array.from({ length: 5 }, (_, i) => ({ topic: `t${i + 1}` })),
      },
    })
    const out = await buildInitWikiBriefing('flow-1')
    expect(out).toContain('ADR-3 A3')
    expect(out).not.toContain('ADR-4')
    expect(out).toContain('t3, …')
  })
})
