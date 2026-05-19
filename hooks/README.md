# DevFlow Plugin Hooks

This directory ships the [Claude Code hook](https://docs.claude.com/en/docs/claude-code/hooks) configs that automate the DevFlow workflow.

## Files

| File | Purpose |
|---|---|
| `pre-tool-use.json` | Fires **before** a matching tool call. Enforces `.devflow-active` for `Edit/Write/NotebookEdit` (since DF-405: **blocks with exit 2 + 3 recovery options** if no active flow). Also runs the four `flow_update` pre-hooks (knowledge auto-resolve, plan-critic, code-critic, self-approval) and the `flow_create` validation hint. |
| `post-tool-use.json` | Fires **after** a `flow_update`. Reminds the agent to call `devflow_init` after a state transition. |
| `session-start.json` | Two hooks fire at session start: (1) `session-start-info.sh` shows the active flow context; (2) `check-plugin-update.js` (DF-358) prints a one-line banner if a newer plugin version is on npm (1-hour cache at `~/.cache/devflow-mcp/version-check.json`, all errors silent). |
| `stop.json` | Since DF-405: **blocks session exit (exit 2) with a precise `flow_update` reinject** when the active flow is in a non-wait state (`idea` / `planning` / `ready` / `in_progress`). Wait states (`approval` / `review` / `done`) pass through. Set `DEVFLOW_STOP_HOOK_SOFT=1` to opt out for one version (removed in 4.33.0). |

## Hook exit-code protocol (DF-405)

Claude Code respects only three paths in a hook:

| Exit code | Stream | Effect |
|---|---|---|
| **0** | (any) | Hook passed. Tool / stop proceeds. |
| **1** | (any) | "Hook crashed, continue anyway." Tool proceeds. |
| **2** | **stderr** | **BLOCK.** stderr is reinjected into the agent's context. |

**`stdout` is silent.** Writing to stdout + `exit 2` does not surface the message to the agent. Use `process.stderr.write(...)` (Node) or `>&2` (bash) for any message you want the agent to see, and pair it with `exit 2`.

Both `stop-check.js` and `check-active-flow.sh` returned exit 1 / stdout warnings before DF-405 — Claude Code treated that as silent pass. The fix uses exit 2 + stderr + a precise next-call template (filled with `flowId`, target state, required fields from `.devflow-active`). See [[Hook Exit-Code Protocol in Claude Code]] runbook and [[Pre-Stop Reinject mit präzisem next-call-template]] pattern in the wiki for the deeper why.

## Matcher convention (DF-357)

Claude Code namespaces MCP tools as `mcp__plugin_<plugin>_<server>__<tool>` (e.g. `mcp__plugin_devflow_devflow__flow_update`). Earlier versions of this plugin matched the literal `mcp__devflow__flow_update`, so **none** of the `flow_update` hooks fired in plugin-installed sessions.

The fix: matcher uses the **regex suffix** `.*__flow_update$`. That matches every plausible host namespacing — `mcp__devflow__flow_update`, `mcp__plugin_devflow_devflow__flow_update`, `mcp__cursor_devflow__flow_update`, future renamings.

```json
{
  "matcher": ".*__flow_update$",
  "hooks": [
    { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/pre-flow-update-knowledge-auto-resolve.js" }
  ]
}
```

Each hook script applies a **belt-and-braces** internal guard so a stricter Claude Code matcher cannot silently break behavior:

```js
if (!payload.tool || !payload.tool.endsWith('__flow_update')) return
```

## When you add or rename a hook

1. Pick the right matcher form. Use the regex suffix above for any tool-name match — never the literal string.
2. Mirror the guard in the script (`endsWith('__flow_update')`).
3. Add a row in `scripts/tests/hooks-matcher.test.js` to pin the new matcher and verify it accepts every namespace variant.
4. Add a script test in `scripts/tests/pre-flow-update-suffix-match.test.js` covering: silent on non-flow_update, fires on plugin namespace, fires on legacy namespace, respects explicit override args.
5. Update this README's table.

## Bundle parity

The Codex (`.codex-plugin/hooks/hooks.json`), Gemini (`.gemini-extension/hooks/hooks.json`) and Cursor (`.cursor/hooks.json`) bundles ship their own copies of the matcher because each host uses a slightly different config schema. They use a less strict `mcp__devflow.*__flow_update` regex which does match each host's tool naming. If you change the Claude Code matcher, decide deliberately whether to mirror in the bundles.

## Tests

```bash
node --test scripts/tests/hooks-matcher.test.js \
            scripts/tests/pre-flow-update-suffix-match.test.js \
            scripts/tests/post-flow-update.test.js \
            scripts/tests/stop-check.test.js

bats scripts/tests/check-active-flow.bats
```

`hooks-matcher`, `pre-flow-update-suffix-match`, `post-flow-update`, and (since DF-405) `stop-check` are part of `npm test`. The bats suite for `check-active-flow.sh` runs separately — it requires `bats` (`brew install bats-core`).
