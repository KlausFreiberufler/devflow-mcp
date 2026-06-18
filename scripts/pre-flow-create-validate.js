#!/usr/bin/env node
/**
 * DF-378 — Pre-tool-use hook for mcp__*__flow_create.
 * DF-412 Paket C — also surfaces wiki-similarity hints before the create
 * is sent, so the agent considers extending an existing ADR/pattern/flow
 * instead of duplicating it. Iron Law of the LLM-Wiki: extend > create.
 *
 * Surfaces actionable 1-line hints to the agent BEFORE the tool-call is
 * sent to the backend, so the agent can self-correct (split a long
 * summary into title + description, add an acceptance criterion, etc.)
 * without burning a 400-roundtrip.
 *
 * Pattern: [[mcp-pre-tool-use-hook-for-state-transition-gates]]
 *
 * Iron rules:
 *  - Always exit 0. The hook is informational, not blocking.
 *  - Limits MUST stay in sync with backend/src/services/flowMetadataValidation.js.
 *  - Stub-create (summary='Untitled' + no description + no AC) is silently
 *    accepted: the UI uses it for click-and-edit, and the agent shouldn't
 *    be encouraged to mimic that pattern.
 *  - Wiki-similarity check (DF-412) NEVER blocks — network errors, missing
 *    env-vars, missing projectId, or empty results all stay silent. The
 *    hook only surfaces a hint when there is concrete evidence of overlap.
 */

const LIMITS = {
  SUMMARY_MIN: 3,
  SUMMARY_MAX: 80,
  DESCRIPTION_MIN: 30,
  AC_MIN_COUNT: 1,
  AC_ITEM_MIN_LEN: 10,
  STUB_SUMMARY: 'Untitled',
};

function trimmedLen(v) {
  return typeof v === 'string' ? v.trim().length : 0;
}

function isFullStub(input) {
  const noDesc = input.description == null || trimmedLen(input.description) === 0;
  const noAc = input.acceptanceCriteria == null
    || (Array.isArray(input.acceptanceCriteria) && input.acceptanceCriteria.length === 0);
  return input.summary === LIMITS.STUB_SUMMARY && noDesc && noAc;
}

function collectHints(input) {
  const hints = [];
  const summary = input.summary;
  const description = input.description;
  const ac = input.acceptanceCriteria;

  // Skip silently for the stub-create UX path.
  if (isFullStub(input)) return hints;

  // Summary checks
  if (typeof summary !== 'string' || trimmedLen(summary) === 0) {
    hints.push('summary is required');
  } else {
    const len = summary.trim().length;
    if (len < LIMITS.SUMMARY_MIN) {
      hints.push(`summary too short (${len}/${LIMITS.SUMMARY_MIN}+ chars)`);
    } else if (len > LIMITS.SUMMARY_MAX) {
      hints.push(`summary too long (${len}/${LIMITS.SUMMARY_MAX} chars) — split it into a short title and put the body into description`);
    }
  }

  // Description checks (skip if the summary is the stub-sentinel)
  if (summary !== LIMITS.STUB_SUMMARY) {
    if (description == null || trimmedLen(description) === 0) {
      hints.push(`description is required (≥${LIMITS.DESCRIPTION_MIN} chars)`);
    } else if (typeof description === 'string' && description.trim().length < LIMITS.DESCRIPTION_MIN) {
      hints.push(`description too short (${description.trim().length}/${LIMITS.DESCRIPTION_MIN}+ chars) — explain the goal, motivation, and constraints`);
    }
  }

  // Acceptance criteria checks
  if (summary !== LIMITS.STUB_SUMMARY) {
    if (ac == null) {
      hints.push(`acceptanceCriteria is required (≥${LIMITS.AC_MIN_COUNT} item, each ≥${LIMITS.AC_ITEM_MIN_LEN} chars)`);
    } else if (!Array.isArray(ac)) {
      hints.push('acceptanceCriteria must be an array of strings');
    } else if (ac.length < LIMITS.AC_MIN_COUNT) {
      hints.push(`acceptanceCriteria too few (${ac.length}/${LIMITS.AC_MIN_COUNT}+ items)`);
    } else {
      ac.forEach((item, idx) => {
        if (typeof item !== 'string') {
          hints.push(`acceptanceCriteria[${idx}] must be a string`);
        } else if (item.trim().length < LIMITS.AC_ITEM_MIN_LEN) {
          hints.push(`acceptanceCriteria[${idx}] too short (${item.trim().length}/${LIMITS.AC_ITEM_MIN_LEN}+ chars)`);
        }
      });
    }
  }

  return hints;
}

/**
 * DF-412 Paket C — non-blocking wiki-similarity hint.
 * Calls /api/projects/:id/cmd-k-search (DF-368) and writes a 1-paragraph
 * stdout hint when nearby ADRs / patterns / flows / drafts are found.
 * Silent on every failure mode: missing env, missing projectId, network
 * error, non-2xx, empty results. The agent is never blocked.
 */
async function maybeBuildWikiHint(args) {
  const base = process.env.DEVFLOW_API_BASE;
  const token = process.env.DEVFLOW_API_TOKEN;
  if (!base || !token) return null;
  if (!args || !args.projectId || typeof args.summary !== 'string') return null;
  const q = args.summary.trim();
  if (q.length < 3) return null;

  const baseUrl = base.replace(/\/$/, '');
  const url = `${baseUrl}/api/projects/${encodeURIComponent(args.projectId)}/cmd-k-search?q=${encodeURIComponent(q.slice(0, 120))}&limit=3`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res || !res.ok) return null;
    const json = await res.json();
    const payload = json && (json.data || json);
    const results = Array.isArray(payload) ? payload : (payload && payload.results) || [];
    if (!Array.isArray(results) || results.length === 0) return null;
    const lines = results.slice(0, 3).map((r) => {
      const type = r.type || r.documentType || 'wiki';
      const title = r.title || r.summary || r.displayId || r.slug || '(untitled)';
      const ref = r.displayId || r.slug || r.id;
      return ref ? `${type}: ${title} (${ref})` : `${type}: ${title}`;
    });
    return `🛈 Wiki has nearby entries — Iron Law: extend > create. Review before duplicating:\n  - ${lines.join('\n  - ')}\n`;
  } catch {
    return null; // never block
  }
}

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const payload = JSON.parse(input || '{}');
    // DF-434 — Claude Code's PreToolUse payload uses `tool_name`, not `tool`.
    const toolName = payload.tool_name || payload.tool;
    if (!toolName || !toolName.endsWith('__flow_create')) {
      return;
    }
    const args = payload.tool_input || payload.input || {};
    const hints = collectHints(args);
    if (hints.length > 0) {
      process.stdout.write(`🛈 flow_create input issues:\n  - ${hints.join('\n  - ')}\n`);
    }

    // DF-412 Paket C — wiki similarity hint, only when validation passed.
    if (hints.length === 0 && !isFullStub(args)) {
      const wikiHint = await maybeBuildWikiHint(args);
      if (wikiHint) process.stdout.write(wikiHint);
    }
  } catch {
    // Always exit 0: malformed input shouldn't block the agent.
  }
});

// Export for tests (no-op when run as script via stdin path).
export { maybeBuildWikiHint, collectHints };
