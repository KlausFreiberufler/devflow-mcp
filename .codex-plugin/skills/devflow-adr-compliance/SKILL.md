---
name: devflow-adr-compliance
description: Use during the review state of a flow with file changes. Compares the diff against accepted ADRs' affects_paths globs, persists per-file violations, and emits a discipline-token only when every violation is either resolved or explicitly marked break-by-design with a reason ≥ 10 characters. Implements Knowledge-Hook 6 of the Knowledge-Gated Workflow.
flow_state: review
hooks: [6]
discipline_token: devflow-adr-compliance
ported_from: NEW (DF-290)
iron_laws:
  - No discipline-token while any violation lacks a resolution or override reason.
---

# Skill: devflow-adr-compliance

> **Knowledge-Hook 6 implementation.** Sister-skill to [[devflow-collision-acknowledged]] (Hook 1): together they close the loop — Hook 1 records *which* ADRs apply to a flow, Hook 6 verifies the implementation actually respects them.

## When to use

Trigger this skill at review-time after the implementation is complete and a diff exists. The skill runs against **accepted** ADRs only; proposed/deprecated/superseded ADRs are not enforced.

## Process

### 0. Snapshot accepted ADRs (before diff-matching)

Before you compare paths, see which ADRs you are being measured against:

```
adr_list({ status: 'accepted' })
```

Read each result's `affects_paths` and `title` — these are the globs that the backend will run your diff against. Knowing them up front lets you (a) judge override-reasons honestly, (b) catch ADRs whose intent extends beyond their globs, and (c) spot accepted ADRs that obviously cover the area but have *empty* `affects_paths` (drift signal — flag as a finding instead of letting the compliance-check silently pass).

### 1. Collect the changed-files list

Get the file diff between the feature branch and the integration target. Typical command:

```bash
git diff --name-only main...HEAD
```

Pass the resulting array as `filesChanged` to the backend.

### 2. Run the compliance check

```
POST /api/flows/:id/adr-compliance-findings
Body:
{
  "filesChanged": ["backend/src/routes/widgets.js", "frontend/src/pages/X.tsx", ...]
}
```

Backend matches each path against every accepted ADR's `affects_paths` globs (minimatch-style: `*` within a segment, `**` across segments, `?` single char, escapes elsewhere). Each match becomes a row in `flow_compliance_findings` with `severity='violation'`. Re-running the endpoint clears prior findings and records the freshest set.

Response:
```
{
  "data": {
    "violations": <count>,
    "compliant": <bool>,
    "findings": [
      { id, adrId, adrDisplayId, adrTitle, filePath, severity, overrideReason, overridden, ... }
    ]
  }
}
```

### 3. Resolve every finding

For each finding, decide with the user:

- **Fix the violation in code** → re-edit the file so it complies, then re-run the endpoint. The finding disappears.
- **Keep the change as break-by-design** → user provides an override reason (≥ 10 characters) and the finding is marked overridden but kept for audit:

```
PATCH /api/flows/:id/adr-compliance-findings/:findingId
Body: { "overrideReason": "intentional — ADR-027 is being superseded in DF-XXX, see ADR-031" }
```

The skill **must not invent override reasons**. Always ask the user when unsure.

### 4. Emit the discipline-token

When every violation has either been removed (re-run) or has a valid `overrideReason`:

```
POST /api/flows/:id/discipline-tokens
{
  "skillName": "devflow-adr-compliance",
  "evidence": {
    "filesChanged": ["<pfad-1>", "<pfad-2>", ...],
    "compliant": true,
    "violationsOverridden": <n>,
    "completedAt": "<iso>"
  }
}
```

If `compliant=false` from the backend at this point → **stop**, do not emit a token. Self-approval will be refused.

## Iron Law

> No discipline-token while any violation lacks a resolution or override reason.

This is enforced both at the skill level (refuse to emit) and at the backend level (the future `agent_with_discipline` gate-check will verify token presence). Violation → token refused → review→done blocked under self-approval; user keeps the manual approval path in the DevFlow UI.

## Output contract

- `flow_compliance_findings` rows reflect the latest run (idempotent — re-runs clear the prior set).
- Every kept violation has an `override_reason` field with the user-provided rationale (audit-trailed via `created_by`).
- `flow_discipline_tokens` row with `skill_name='devflow-adr-compliance'` valid for 1 hour.

## Glob examples

`affects_paths` accepts simple posix-style globs. Examples used in the test-suite:

| Glob | Matches |
|---|---|
| `backend/src/routes/**/*.js` | every JS file under backend routes (recursive) |
| `frontend/src/components/auth/*.tsx` | tsx files in one folder (single segment `*`) |
| `backend/src/database/auth.js` | exact file |
| `**/*.test.ts` | every test file anywhere |
| `docs/**` | anything under docs (including subdirs) |

## Related

- [[kn-hook-6-adr-compliance]] — design doc
- [[kn-hook-1-awareness]] — sister-skill (Plan-Wikilink-Injection)
- [[migration-test-strategy]] — Säule A (skill triade) + Säule B (hook integration)
- [[knowledge-gated-workflow]] — Stage 11 in the visual diagram
- DF-290 — backend implementation flow
- DF-289 — discipline-tokens foundation
- DF-238 — original `affects_paths` work (drift-check predecessor)
