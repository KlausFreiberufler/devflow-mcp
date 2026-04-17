---
description: Show the next allowed action and step for the current flow
---

Read `.devflow-active`. If missing, tell the user to run `/devflow-start <id>` first.

Otherwise call the pipeline endpoint for the active flow (`GET /api/flows/<id>/next-step` via DevFlow MCP). Present the response compactly:

- **Actor:** `<actor>` (human / agent / both / auto)
- **Next step:** `<nextStep>`
- **Allowed actions:** `<allowedActions>` (comma-separated)
- **Blocked?** yes/no — if yes, by whom (`<gate.blockedFor>`)
- **Retries:** `<retryCount>` (if > 0, show `<previousFeedback>`)

If a human gate is blocking, tell the user what to do in the DevFlow UI (approve plan / approve review / reject with feedback).
