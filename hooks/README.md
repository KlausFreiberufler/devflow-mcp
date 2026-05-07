# DevFlow Plugin Hooks

This directory ships the [Claude Code hook](https://docs.claude.com/en/docs/claude-code/hooks) configs that automate the DevFlow workflow.

## Files

| File | Purpose |
|---|---|
| `pre-tool-use.json` | Fires **before** a matching tool call. Enforces `.devflow-active` for `Edit/Write/NotebookEdit` and runs the four `flow_update` pre-hooks (knowledge auto-resolve, plan-critic, code-critic, self-approval). |
| `post-tool-use.json` | Fires **after** a `flow_update`. Reminds the agent to call `devflow_init` after a state transition. |
| `session-start.json` | Renders the bootstrap banner on each Claude Code session start. |
| `stop.json` | Reminds the agent of unfinished tasks before stop. |

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
            scripts/tests/post-flow-update.test.js
```

These tests are part of `npm test` in CI.
