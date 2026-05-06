---
name: devflow-flow-display
description: Use whenever listing flows, presenting flow status, or summarizing the flow backlog. Enforces a uniform Markdown-table format across MCP-tool, slash-commands, and free-form agent responses so the user gets a consistent view everywhere.
---

# DevFlow — Flow-List Display Convention

When showing flows to the user — in any form — render them as a **Markdown table** with these columns and rules.

## Format

```
| ID | State | Assignee | Titel |
|---|---|---|---|
| ⭐ **DF-329** | 🔨 in_progress | klaus 🔒 | flow_list MCP-Tool: Browser-Sortierung + … |
| **DF-328** | 💡 idea | — | Knowledge Draft "Accept All" komischer dialog |
```

## Iron Laws

1. **⭐ for own flows.** If `flow.isMine === true` (server-computed: assignee or creator equals the authenticated user), prefix the ID with `⭐ `. No exceptions — this is what makes the user's own work scannable at a glance.

2. **Lock-status separated from assignee.** Active agent sessions get a 🔒 suffix on the assignee column. An idle flow shows just the assignee name (or `—` if unassigned). **Never** write `(frei)` or other lock-pseudo-text — that conflates two orthogonal concepts.

3. **Hide done-flows by default.** The backlog is about open work. Show only `idea | planning | approval | ready | in_progress | review`. Show `done` only when the user explicitly asks for it ("show all flows", "include done", `includeDone: true`).

4. **State icon prefix.** Use the canonical icons:
   - `💡 idea` · `📋 planning` · `🔒 approval` · `▶️ ready` · `🔨 in_progress` · `🔍 review` · `✅ done`

5. **Order matches the browser.** The backend already returns flows in the same order as the FlowsPage (kanban_sort_order ASC for project-scope, updated_at DESC for cross-project). Do **not** re-sort by display_id or alphabetically — preserve the server order.

6. **No re-rendering of the MCP-tool output.** When `mcp__devflow__flow_list` returns a table, pass it through verbatim. Re-rendering it loses the conventions and risks drift.

## When this triggers

- User asks `/devflow-list`, `flow_list`, "show me the flows", "what's open", "what's in the backlog"
- User asks for status across flows ("what am I working on", "what's mine")
- You proactively surface flows during planning (e.g. "you also have DF-X open in this area")

## When this does NOT apply

- Single-flow detail-views (use `flow_get` / `formatFlowDetail` instead)
- Compact one-line references in prose (e.g. "see DF-326") — natural prose stays prose

## Source-of-truth

Format produced by `formatFlowList()` in `devflow-mcp/src/tools/flow.ts`. The skill is the reader-facing contract; the function is the implementation. Keep them in lock-step — if you change one, change the other.
