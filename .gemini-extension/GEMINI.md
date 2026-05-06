# DevFlow — Gemini CLI Context

This project uses **DevFlow** for structured AI development workflows.

## Quick Start

1. `devflow_status()` → check connection (browser opens for first auth)
2. `flow_list()` → find a free flow, OR `flow_create({summary: "..."})` to start one
3. `devflow_init({flowId: "..."})` → begin your session
4. Tools are blocked until step 3. Follow `allowedActions` and `nextStep` from each tool response.

## Flow States

```
idea → planning → approval → ready → in_progress → review → done
```

Review states (`approval`, `review`) wait for user-approval in the DevFlow UI.

## Skills

19 skills are auto-invoked by Gemini when relevant (`devflow-tdd`, `devflow-knowledge-completer`, ...). They enforce DevFlow's iron-laws (RED/GREEN/REFACTOR for TDD, knowledge-extend > create > defer for wiki, ...).

## Help

- Slash-commands: `/devflow-status`, `/devflow-list`, `/devflow-next`, `/devflow-create`
- Backend: https://api.app.dev-flow.tech (configurable via `devflow_url` user-config)
- Repo: https://github.com/KlausFreiberufler/devflow-mcp
