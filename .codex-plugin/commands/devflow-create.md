---
description: Create a new flow with a one-line summary
argument-hint: <summary>
---

Use `$*` (the full argument text) as the `summary`.

If empty, ask for a summary interactively.

Call `mcp__devflow__flow_create` with `{ summary: $* }`.

After creation, show the new flow's displayId. Ask the user:
- **Start working on it now?** → call `devflow_init` + transition to `planning`
- **Leave in idea state?** → just report the ID
