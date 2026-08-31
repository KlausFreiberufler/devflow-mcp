#!/usr/bin/env node
/**
 * DF-339 Phase 3 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a state-transition to `review` (in_progress → review),
 * this hook reminds the agent to invoke the `devflow-code-critic` skill BEFORE
 * the transition.
 *
 * DF-535 — the reminder now leads with the **fresh-context dispatch**: the
 * implementation is judged by 2-3 read-only reviewer subagents that never saw
 * it being written (lenses: correctness / security / does-it-reproduce). The
 * critic-persona self-review is only the fallback for clients without a
 * subagent tool (ADR-135). A self-review shares a context window with the
 * author and inherits the author's reasoning as a premise — evidence case
 * DF-520 R3, where two self-reviews greenlit a validator that never validated.
 *
 * The 7 quality dimensions are unchanged; the dispatch changes *who* answers:
 *
 *   1. AC-Implementation   — every AC actually implemented in code
 *   2. Test-Coverage       — tests added AND executed for every behavior change
 *   3. Iron-Laws           — TDD/pattern-reuse/knowledge-completer respected
 *   4. ADR-Compliance      — code follows applicable ADRs
 *   5. Plan-Reconciliation — diff plan vs reality, flag deviations
 *   6. Knowledge-Drafts    — new patterns/ADRs surfaced as drafts
 *   7. Code-Quality        — obvious bugs, security issues, anti-patterns
 *
 * Phase 3 (this commit): informational reminder. Phase 2 loop semantics apply.
 *
 * Companion to:
 *   - pre-flow-update-plan-critic.js   (DF-339 P1)
 *   - pre-flow-update-knowledge-auto-resolve.js (DF-320)
 *   - pre-flow-update-self-approval.js (DF-323)
 *
 * Pattern: [[auto-self-approval-via-pre-tool-use-hook]]
 */

import { emitContext, warn } from './lib/hook-output.js'

let input = ''
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}')
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    // DF-434 — Claude Code's PreToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool
    if (!toolName || !toolName.endsWith('__flow_update')) return

    const args = payload.tool_input || payload.input || {}
    const targetState = args.currentState

    // Code-critic fires only on transition to `review` (i.e. impl complete)
    if (targetState !== 'review') return

    // If the agent already passed `codeCriticVerdict` (future field), respect it.
    if (args.codeCriticVerdict !== undefined) return

    const lines = [
      '🔍 devflow-code-critic — fresh-context review reminder (DF-535)',
      '',
      'Before submitting to review, do NOT review your own code from inside your',
      'own context. Run the `devflow-code-critic` skill in its primary mode:',
      '',
      'PRIMARY — fresh-context dispatch:',
      '   Dispatch 2-3 READ-ONLY reviewer subagents (Agent/Task tool, an agent type',
      '   without Edit/Write — e.g. feature-dev:code-reviewer or Explore), one lens',
      '   each, in parallel (one message, multiple tool calls):',
      '',
      '     · correctness        — every AC really implemented? bugs? diff vs plan?  (dim 1·5·7)',
      '     · security           — CLAUDE.md Security Hygiene Checklist vs the diff  (dim 4·7)',
      '     · does-it-reproduce  — were the tests RUN, not just written? assertions   (dim 2)',
      '                            strong enough to fail on a regression?',
      '',
      '   Context boundary — what may cross into the dispatch prompt:',
      '     ✓ the git diff (or diff range + repo path), the acceptance criteria',
      '       verbatim, the approved plan excerpt, the command to run the tests',
      '     ✗ NEVER your assumptions, rationale, self-assessment, prior verdict or',
      '       findings you already dismissed — that anchor is exactly what let',
      '       DF-520 R3 survive two self-reviews.',
      '',
      '   Subagents report, they never fix. You fix and re-dispatch — on iteration',
      '   2+ only the lenses that produced high-findings.',
      '',
      'YOU keep (the subagents cannot judge these):',
      '   · dimension 3 Iron-Laws       — TDD RED-first, pattern-reuse, extend > dismiss',
      '   · dimension 6 Knowledge-Drafts — new pattern/runbook/ADR surfaced as draft',
      '   · triage — run every finding through `devflow-receiving-review`:',
      '     Critical/Important/Minor, technically verified, accepted or rejected with',
      '     a reason. Never blind-accept a subagent, never blind-reject one.',
      '',
      'FALLBACK — critic-persona self-review:',
      '   ONLY when the client has no subagent tool (ADR-135: Codex, Gemini, Cursor,',
      '   Cline, Windsurf, Continue). Then walk the 7 dimensions alone, using the',
      '   three lenses as checklists, and DECLARE the weaker mode:',
      '     { "review_mode": "self-persona-fallback", "reviewers": [] }',
      '   Not having felt like dispatching is not a fallback reason.',
      '',
      'Skill location: ~/.claude/plugins/cache/.../skills/devflow-code-critic/SKILL.md',
      'Iron Law: emit verdict only after all 7 dimensions are checked.',
      '',
      'Loop semantics: max 3 iterations. If 2 consecutive iterations have',
      '0 high-findings → exit. If same finding appears twice unchanged → escalate.',
      '',
      'Phase 3: informational. Phase 2 loop will block until verdict=approved.',
    ]

    // DF-437 — inject into the AGENT's context; stderr never reached the model.
    emitContext(lines.join('\n'))
  } catch (e) {
    // Best-effort — never block the tool call, but leave a trace (DF-437 AC-3).
    warn(`code-critic hook error: ${e?.message || e}`)
  }
})
