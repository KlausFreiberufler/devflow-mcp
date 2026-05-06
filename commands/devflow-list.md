---
description: List open flows as a Markdown table (⭐ marks own flows)
argument-hint: [state]
---

Call `mcp__devflow__flow_list` with `{ state: $1 }` if `$1` is provided (e.g. `planning`, `in_progress`), otherwise no args.

The MCP-tool returns the rendered table directly — pass it through verbatim, do **not** re-render or strip the format.

Conventions (see `devflow-flow-display` skill):
- Columns: `ID | State | Assignee | Titel`
- ⭐ prefix on the ID = flow is yours (assignee or creator = current user)
- 🔒 suffix on the assignee = active agent session
- Done-flows are hidden by default. To include them: append `(includeDone)` to the user prompt and pass `{ includeDone: true }` to the tool.
