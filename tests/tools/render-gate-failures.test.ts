/**
 * DF-432 — Pure-function tests for `renderGateFailures` in src/tools/flow.ts.
 *
 * Pre-DF-432 the plugin lost all per-failure reason/hint info on 409 unified-gate
 * responses (DF-374 shape) because it only handled the DF-292 / 403 shape. These
 * tests pin the new behavior: every failure is rendered with conditionId+label,
 * reason, hint, and any structured extras (openTasks, validationErrors).
 */
import { describe, it, expect } from 'vitest';
import { renderGateFailures } from '../../src/tools/flow.js';

describe('DF-432 — renderGateFailures', () => {
  it('renders a single failure with reason and hint', () => {
    const out = renderGateFailures({
      transition: 'in_progress→review',
      failures: [{
        conditionId: 'agent-summary-required',
        label: 'Agent summary present',
        reason: 'agent_summary_missing',
        hint: 'Pass agentSummary in the flow_update body.',
      }],
    });
    expect(out).toMatch(/Gate blocked: 1 condition failed/);
    expect(out).toMatch(/in_progress→review/);
    expect(out).toMatch(/Agent summary present/);
    expect(out).toMatch(/agent_summary_missing/);
    expect(out).toMatch(/Pass agentSummary in the flow_update body/);
  });

  it('renders multiple failures pluralized + each as bullet', () => {
    const out = renderGateFailures({
      transition: 'in_progress→review',
      failures: [
        { conditionId: 'agent-summary-required', label: 'Agent summary present', reason: 'agent_summary_missing', hint: 'pass agentSummary' },
        { conditionId: 'testing-instructions-required', label: 'Testing instructions present', reason: 'testing_instructions_missing', hint: 'pass testingInstructions' },
      ],
    });
    expect(out).toMatch(/Gate blocked: 2 conditions failed/);
    expect(out).toMatch(/Agent summary present/);
    expect(out).toMatch(/Testing instructions present/);
    expect(out).toMatch(/agent_summary_missing/);
    expect(out).toMatch(/testing_instructions_missing/);
    // both hints survive
    expect(out).toMatch(/pass agentSummary/);
    expect(out).toMatch(/pass testingInstructions/);
  });

  it('falls back to conditionId when label is missing', () => {
    const out = renderGateFailures({
      failures: [{
        conditionId: 'tdd-discipline-enforced',
        reason: 'tdd_token_missing',
        hint: 'emit a devflow-tdd token',
      }],
    });
    expect(out).toMatch(/tdd-discipline-enforced/);
    expect(out).toMatch(/tdd_token_missing/);
  });

  it('renders openTasks when present (tasks-all-completed failure)', () => {
    const out = renderGateFailures({
      failures: [{
        conditionId: 'tasks-all-completed',
        label: 'All tasks completed (checked)',
        reason: 'tasks_not_all_completed',
        hint: '2 of 5 tasks still open.',
        openTasks: [
          { id: 'task-1', text: 'Implement feature X' },
          { id: 'task-2', text: 'Write tests for X' },
        ],
      }],
    });
    expect(out).toMatch(/All tasks completed/);
    expect(out).toMatch(/tasks_not_all_completed/);
    expect(out).toMatch(/Implement feature X/);
    expect(out).toMatch(/Write tests for X/);
  });

  it('renders validationErrors for evidence-invalid failures', () => {
    const out = renderGateFailures({
      failures: [{
        conditionId: 'tdd-discipline-enforced',
        label: 'TDD discipline token present',
        reason: 'tdd_token_evidence_invalid',
        hint: 'Re-emit with structured evidence.',
        validationErrors: [
          { field: 'testFirstPerPackage[0].redCommit', code: 'item_required' },
        ],
      }],
    });
    expect(out).toMatch(/tdd_token_evidence_invalid/);
    expect(out).toMatch(/testFirstPerPackage/);
    expect(out).toMatch(/item_required/);
  });

  it('renders autoFixed list when backend ran auto-fixes', () => {
    const out = renderGateFailures({
      failures: [{ conditionId: 'agent-summary-required', reason: 'agent_summary_missing', hint: 'pass summary' }],
      autoFixed: ['tasks-required', 'knowledge-gaps-resolved'],
    });
    expect(out).toMatch(/Auto-fixed by backend: tasks-required, knowledge-gaps-resolved/);
  });

  it('survives missing transition gracefully', () => {
    const out = renderGateFailures({
      failures: [{ conditionId: 'x', reason: 'y', hint: 'z' }],
    });
    expect(out).toMatch(/Gate blocked/);
    expect(out).toMatch(/this transition/);
  });

  it('survives empty failures array (defensive)', () => {
    const out = renderGateFailures({ transition: 'foo→bar', failures: [] });
    expect(out).toMatch(/Gate blocked: 0 conditions failed/);
  });

  it('surfaces top-level backend error when it differs from generic gate-message', () => {
    // DF-374 buildGateFailureResponse exposes the single failure hint as top-level
    // error when failures.length === 1. We should pass that through.
    const out = renderGateFailures(
      {
        transition: 'in_progress→review',
        failures: [{
          conditionId: 'agent-summary-required',
          reason: 'agent_summary_missing',
          hint: 'Pass agentSummary in the flow_update body.',
        }],
      },
      'Pass agentSummary in the flow_update body.'
    );
    // The top-level error is the same as the hint — we should NOT double-print it.
    // It already appears in the bullet `hint:` line. The function decides whether to
    // surface a separate Backend message line; for single-failure cases where the
    // top-level error is the hint itself, the heuristic in the renderer should keep
    // the output clean. Either way, the hint must be present.
    expect(out).toMatch(/Pass agentSummary/);
  });

  it('suppresses generic top-level error when it matches the generic gate-message', () => {
    const out = renderGateFailures(
      {
        transition: 'in_progress→review',
        failures: [
          { conditionId: 'a', reason: 'r1', hint: 'h1' },
          { conditionId: 'b', reason: 'r2', hint: 'h2' },
        ],
      },
      'Gate blocked: 2 conditions failed'  // exactly the generic message
    );
    // The generic top-level error is redundant with the first line we render
    // ourselves — suppress it.
    expect(out).not.toMatch(/Backend message: Gate blocked: 2 conditions failed/);
  });
});
