// DF-437 — shared output helpers for the plugin hooks.
//
// Claude Code's hook protocol: plain stdout with exit 0 goes ONLY to the
// debug log for PreToolUse/PostToolUse — the model never sees it. To inject
// information into the agent's context, hooks must print a JSON envelope
// with `hookSpecificOutput.additionalContext` (verified against
// code.claude.com/docs/en/hooks, 2026-07-04). stderr stays the channel for
// human-visible diagnostics.

/**
 * Print `text` so it reaches the AGENT's context (not just the transcript).
 * @param {string} text
 * @param {'PreToolUse'|'PostToolUse'} [eventName]
 */
export function emitContext(text, eventName = 'PreToolUse') {
  if (!text) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: text,
      },
    }) + '\n'
  );
}

/**
 * Human-visible diagnostic on stderr. Hooks must never block a tool call
 * (always exit 0) — but they must never fail silently either (DF-437 AC-3).
 * @param {string} text
 */
export function warn(text) {
  process.stderr.write(`[devflow-hook] ${text}\n`);
}
