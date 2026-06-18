---
name: devflow-verification-gate
description: Use during the review state to prove every acceptance criterion with a captured evidence command. No "should work" claims — each AC gets a real shell/test/curl invocation whose stdout is recorded into the flow's testingInstructions. Emits the discipline-token that makes review→done possible under agent_with_discipline self-approval (DF-292).
flow_state: review
hooks: []
discipline_token: devflow-verification-gate
ported_from: superpowers:verification-before-completion
iron_laws:
  - Each acceptance criterion gets a real evidence command — never claim "should work".
  - Capture stdout/stderr verbatim; truncation only at write-out, not during reasoning.
  - One command per criterion, deterministic, repeatable from main checkout.
---

# Skill: devflow-verification-gate

> **Iron-Law port** of Superpowers `verification-before-completion`. The review-time guard that makes self-approval possible: prove the work, don't claim it.

## When to use

In `review` state, in this exact order:

1. `devflow-receiving-review` — triage code-review findings (Critical / Important / Minor)
2. `devflow-plan-reconciliation` (DF-310) — reconcile plan ↔ actual implementation (done/partial/missing/extra/moved)
3. **`devflow-verification-gate` (this skill)** — prove every AC with a real evidence command
4. `devflow-adr-compliance` — ADR-glob path-check
5. `devflow-knowledge-completer` — close any wiki gaps
6. `flow_update review → done` with all 4 discipline-tokens

Without this exact order under `agent_with_discipline`, the gate blocks with `discipline_incomplete`.

## Process

### 1 · Gather acceptance criteria

Pull the flow's acceptance-criteria array. Each entry needs an evidence command — **the kind of command a reviewer would run to confirm it themselves**, not an internal assertion.

| AC kind | Typical evidence command |
|---|---|
| New API endpoint | `curl -X POST … \| jq` showing the 201 response |
| New backend behavior | `npm run test:api -- <suite>` |
| New frontend | `npx playwright test <spec>` or screenshot path |
| Migration | `sqlite3 data/devflow.db ".schema <table>"` |
| Doc-page | `curl /api/projects/X/docs/<id> \| jq .data.content` |
| Glob/regex helper | `vitest run <unit-test>` |

If a criterion does not lend itself to a single command, split it into smaller criteria first. **Do not write a "summary" command that doesn't actually verify anything.**

### 2 · Run each command and capture output

Execute, capture full stdout + stderr, exit code, duration. Truncate to ~30 lines per command for the testing-instructions write-out (full log goes into the discipline-token evidence).

### 3 · Format testingInstructions

Write a markdown section per criterion:

```markdown
### AC-N: <criterion text>

**Command:** `npm run test:api -- adr-compliance.test.ts`
**Exit code:** 0
**Output (truncated):**
\`\`\`
... 8 passed in 141ms ...
\`\`\`
```

Pass the full string as `testingInstructions` in the next `flow_update` call.

### 4 · Emit the discipline-token

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-verification-gate",
  "evidence": {
    "criteria": [
      { "id": "AC-1", "command": "...", "exitCode": 0, "outputSha256": "...", "durationMs": 141 }
    ],
    "totalCommands": <n>,
    "allPassed": true,
    "completedAt": "<iso>"
  }
}
```

The signed token is returned **once**. Pass it to `flow_update` along with any other required tokens:

```
PATCH /api/flows/:id
{
  "currentState": "done",
  "selfApproved": true,
  "disciplineTokens": ["<verification-gate-token>", "<adr-compliance-token>", "<plan-reconciliation-token>", "<knowledge-completer-token>"]
}
```

Backend checks `project_configs.allow_agent_self_approval` is on, fetches `pipeline_steps.required_skills` for the testing step, validates every required skill has a non-expired token in `flow_discipline_tokens`. If yes → `review→done` succeeds. If no → 403 with `gate.reason='discipline_incomplete'` and a list of missing skills.

## Iron Laws

> **Each acceptance criterion gets a real evidence command — never claim "should work".**
>
> **Capture stdout/stderr verbatim. Truncation only at write-out, not during reasoning.**
>
> **One command per criterion, deterministic, repeatable from main checkout.**

If an evidence command failed (exit code != 0), **stop**. Either fix the issue and re-verify, or — if the failure is known/intentional — escalate to the human reviewer with the failing output. Do not paper over a red command with optimistic prose.

## Output contract

- `flow.testing_instructions` is the human-readable evidence digest.
- `flow_discipline_tokens` row with `skill_name='devflow-verification-gate'` valid for 1 hour.
- `flows.code_approved_by` is set to `agent:devflow:v4.x` (not the user-id) when the self-approval succeeds — audit trail clearly shows agent-driven approval.

## Related

- [[migration-test-strategy]] — Säule A (skill triade) + Säule B
- [[knowledge-gated-workflow]] — Stage 12 in the visual diagram
- [[superpowers-migration-status]] — Live tracking
- DF-292 — port flow + agent_with_discipline activation (this implementation)
- DF-289 — discipline-tokens foundation
- DF-290 — devflow-adr-compliance (sibling skill, also gates review→done under agent_with_discipline)
- Superpowers v5.0.7 — `verification-before-completion` (original skill)
