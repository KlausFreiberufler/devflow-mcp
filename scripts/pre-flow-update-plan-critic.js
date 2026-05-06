#!/usr/bin/env node
/**
 * DF-339 Phase 1 — Pre-tool-use hook for mcp__devflow__flow_update.
 *
 * When the agent submits a state-transition to `approval` (planning → approval),
 * this hook reminds the agent to invoke the `devflow-plan-critic` skill BEFORE
 * the transition. The plan must be deeply reviewed against 7 dimensions:
 *
 *   1. AC-Coverage         — every AC has a task, tasks cover all ACs
 *   2. Task-Granularity    — atomic, no task > 1 day
 *   3. Edge Cases          — empty input, concurrency, permission edge, existing state
 *   4. Wiki-Coverage       — relevant ADRs/patterns referenced, no drift
 *   5. Past-Flow-Anchor    — similar past flows referenced as anchor
 *   6. Architecture-Risks  — schema, migration, cross-project, backward-compat
 *   7. Test-Strategy       — TDD paths planned
 *
 * Phase 1 (this commit): informational only, prints reminder.
 * Phase 2 (later): blocking until critic verdict is reached.
 *
 * Operates in concert with:
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
    if (payload.tool !== 'mcp__devflow__flow_update') return

    const args = payload.tool_input || payload.input || {}
    const targetState = args.currentState

    // Plan-critic fires only on transition to `approval` (i.e. plan submission)
    if (targetState !== 'approval') return

    // If the agent already passed `planCriticVerdict` (future field), respect it.
    if (args.planCriticVerdict !== undefined) return

    const lines = [
      '🔍 devflow-plan-critic — deep review reminder',
      '',
      'Before approving the plan, run the `devflow-plan-critic` skill against',
      'these 7 dimensions and address all high-severity findings:',
      '',
      '   1. AC-Coverage        — every AC has a task, tasks cover all ACs',
      '   2. Task-Granularity   — atomic, no task > 1 day',
      '   3. Edge Cases         — empty input, concurrency, permission, existing state',
      '   4. Wiki-Coverage      — relevant ADRs/patterns referenced, no drift',
      '   5. Past-Flow-Anchor   — similar past flows referenced as anchor',
      '   6. Architecture-Risks — schema, migration, cross-project, BC',
      '   7. Test-Strategy      — TDD paths planned',
      '',
      'Skill location: ~/.claude/plugins/cache/.../skills/devflow-plan-critic/SKILL.md',
      'Iron Law: emit verdict only after all 7 dimensions are checked.',
      '',
      'Phase 1 (this hook): informational. Phase 2 will block until verdict=approved.',
    ]

    // Print to stderr so it shows as informational hint (per Claude Code convention).
    console.error(lines.join('\n'))
  } catch {
    // Best-effort — never block the actual tool call from this hook
  }
})
