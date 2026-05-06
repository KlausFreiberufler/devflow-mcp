---
name: devflow-area-ideation
description: Use when the user pasted an Area-Idea-Hunt-Prompt from the IdeasPage Garage. Drives a Wiki-grounded ideation routine — never out-of-thin-air-brainstorming, every idea must reference real wiki entries. Output is 3 Pick&Plan-ready proposals as JSON.
flow_state: any
hooks: []
discipline_token: devflow-area-ideation
ported_from: NEW (DF-318)
iron_laws:
  - Every idea must cite at least one real ADR / pattern / runbook from the wiki — no hallucinated entities.
  - Prefer extending existing decisions over inventing new abstractions (DF-310 Iron Law).
  - Each idea is Pick&Plan-ready (clean summary + 2-3 sentence description) — not vague brainstorm bullets.
---

# Skill: devflow-area-ideation

> **Wiki-grounded ideation.** When the user clicks "Copy prompt" on the IdeasPage and pastes the result into Claude, this skill drives the response. The prompt has the Wiki-context pre-loaded — don't ignore it, use it.

## When to use

- The user pasted a prompt that starts with `# Idea-Hunt: <area> for this project`.
- The prompt contains a `## Context` section with ADRs / patterns / runbooks already listed.
- Tasks ask for "3 concrete next-step ideas" or "3 market-opportunity ideas".

## Process

### 1. Read the prompt's Context section completely

The IdeasPage already pulled the relevant wiki snapshot. Don't re-fetch the same data — extend it:

- **`wiki_get_briefing({ flowId })`** — only if you have an active flow context (rare for ideation).
- **`wiki_search({ q: <area-name> })`** — to surface entries the prompt didn't pre-load.
- **`wiki_get_index({ projectId })`** — to see if the area has more entries grouped by lifecycle.
- **`pending_work({ projectId, tags: [<area>] })`** — what's already in flight.

### 2. For each candidate idea — verify wiki-grounding

For every idea you generate, ask: which existing ADR / pattern / runbook does this build on? If you can't name one, the idea is too thin — discard or refine.

If the area is `market` (signal: prompt says "market-opportunity ideas"), allow looser grounding — but still name ONE wiki entry per idea ("extends [[ADR-X]]" or "fills the gap left by [[pattern:Y]]").

### 3. Output exactly 3 ideas as JSON

```json
[
  {
    "summary": "Concise ticket-style summary (≤80 chars)",
    "description": "2-3 sentences: what + why, grounded in wiki",
    "wikiEvidence": ["ADR-014", "pattern:rate-limit"],
    "kindOfWork": "feature" | "refactor" | "research" | "runbook" | "adr"
  }
]
```

After the JSON, add a 2-line **verdict** explaining if the area looks healthy (rich context → easy ideation) or thin (worth investing in wiki harvesting first).

### 4. Optional: emit discipline-token

```ts
devflow_token_emit({
  flowId: <currentFlowId or null>,
  skillName: 'devflow-area-ideation',
  evidence: {
    area: '<area-name>',
    ideas: [{ summary, kindOfWork, wikiEvidence }],
    verdict: 'healthy' | 'thin',
    completedAt: new Date().toISOString()
  }
})
```

## Why this exists

Three failure-modes this skill prevents:

1. **Pure-LLM-Brainstorm** — Claude invents 10 generic startup-ideas with zero project-grounding. Useless for an existing codebase.
2. **Ignored wiki-context** — the prompt has all the context but Claude still goes meta-research-mode. Wastes the curation work.
3. **Vague bullet-points** — "improve performance" instead of "extend ADR-027 with a connection-pool variant for SQLite WAL mode". Pick&Plan needs concrete tickets.

## Cross-references

- DF-318 introduced the IdeasPage Prompt-Garage + this skill.
- DF-310 LLM-Wiki Pattern — the underlying compounding-artifact philosophy.
- `devflow-knowledge-completer` — Iron Law sister (extend > dismiss).
- `devflow-pattern-reuse` — used during planning when an idea becomes a flow.
