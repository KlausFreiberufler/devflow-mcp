#!/usr/bin/env node
/**
 * DF-339 Phase 3 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a state-transition to `review` (in_progress → review),
 * this hook reminds the agent to invoke the `devflow-code-critic` skill BEFORE
 * the transition. The implementation must be deeply reviewed against 7 dimensions:
 *
 *   1. AC-Implementation   — every AC actually implemented in code
 *   2. Test-Coverage       — tests added for every behavior change
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

let input = ''
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}')
    // DF-357 — accept any host's flow_update tool (devflow, plugin_devflow_devflow, etc.)
    if (!payload.tool || !payload.tool.endsWith('__flow_update')) return

    const args = payload.tool_input || payload.input || {}
    const targetState = args.currentState

    // Code-critic fires only on transition to `review` (i.e. impl complete)
    if (targetState !== 'review') return

    // If the agent already passed `codeCriticVerdict` (future field), respect it.
    if (args.codeCriticVerdict !== undefined) return

    const lines = [
      '🔍 devflow-code-critic — deep review reminder',
      '',
      'Before submitting to review, run the `devflow-code-critic` skill against',
      'these 7 dimensions and address all high-severity findings:',
      '',
      '   1. AC-Implementation   — every AC actually implemented in code',
      '   2. Test-Coverage       — tests added for every behavior change',
      '   3. Iron-Laws           — TDD / pattern-reuse / knowledge-completer respected',
      '   4. ADR-Compliance      — code follows applicable ADRs',
      '   5. Plan-Reconciliation — diff plan vs reality, flag deviations',
      '   6. Knowledge-Drafts    — new patterns/ADRs surfaced as drafts',
      '   7. Code-Quality        — obvious bugs, security, anti-patterns',
      '',
      'Skill location: ~/.claude/plugins/cache/.../skills/devflow-code-critic/SKILL.md',
      'Iron Law: emit verdict only after all 7 dimensions are checked.',
      '',
      'Loop semantics: max 3 iterations. If 2 consecutive iterations have',
      '0 high-findings → exit. If same finding appears twice unchanged → escalate.',
      '',
      'Phase 3: informational. Phase 2 loop will block until verdict=approved.',
    ]

    console.error(lines.join('\n'))
  } catch {
    // Best-effort — never block the actual tool call from this hook
  }
})
