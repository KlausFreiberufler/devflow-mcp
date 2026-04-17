---
description: List flows (optionally filter by state)
argument-hint: [state]
---

If `$1` is provided, use it as the state filter (e.g. `planning`, `in_progress`).
Otherwise list all non-done flows.

Call `mcp__devflow__flow_list` with `{ state: $1 }` or no args for default.

Render as a table: `displayId | state | assignee | summary`.
Sort by state (idea → planning → approval → ready → in_progress → review), then by displayId.
