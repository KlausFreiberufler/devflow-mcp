---
description: List tasks for the current DevFlow flow
---

Read `.devflow-active` for the current flowId. If missing, instruct user to start a flow first.

Call `mcp__devflow__task_list` with the flowId.

Format results as a markdown checklist grouped by status:
- **Open:** `- [ ]` items
- **In Progress:** `- [~]` items
- **Done:** `- [x]` items

Show task IDs so user can reference them.
