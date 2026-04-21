# DF-218 A.1 — Root-Cause Findings

## Symptom
Docs-strictness (docsUpdate=5) blocks `review` transition even when a prior `flow_update({commits:[{message:'docs: ...'}]})` call successfully persisted a docs commit.

## Investigation
Traced the commits-read chain in `src/tools/flow.ts:490-507`:

```typescript
const flowData = currentFlow.success ? currentFlow.data as unknown as Record<string, unknown> : null;
const existingCommits = flowData?.commits
  ? (typeof flowData.commits === 'string' ? JSON.parse(flowData.commits as string) : flowData.commits)
  : [];
```

`currentFlow = await devFlowClient.getFlow(resolvedId)` calls `src/api/client.ts:438`, which passes raw backend JSON through `transformFlow()` (line 1128).

## Root Cause
`transformFlow()` at `src/api/client.ts:1128-1169` is a **whitelist mapper**. It constructs the typed `Flow` object by cherry-picking fields — any backend field not in the list is silently dropped.

Inspected fields: id, projectId, ticketKey, summary, description, descriptionJson, acceptanceCriteria, currentState, agentStatus, agentMessage, implementationPlan, planFeedback, codeFeedback, agentSummary, testingInstructions, planUpdatedAt, createdAt, completedAt, displayId, testingNotes, approvedBy, approvedAt, approvedComment, planCreatedBy, planCreatedAt, planApprovedBy, planApprovedAt, codeApprovedBy, codeApprovedAt, assigneeName, branchName, branchCreated, prUrl, prNumber, prState.

**`commits` is not in this list.** It gets dropped on the way from backend → typed Flow.

So `flowData.commits` in `flow.ts:493` is always `undefined`, regardless of whether the backend has them persisted.

## Verification
Backend persists commits correctly (verified earlier during DF-217 analysis):
- `backend/src/database/flows.js:155-161` merges + JSON.stringifies them into `flows.commits` column.
- `backend/src/routes/flows.js:46` parses them back: `commits: flow.commits ? JSON.parse(flow.commits) : null`.
- `GET /api/flows/:id` response shape contains `commits: [{hash,message}, …]` or `null`.

The problem is strictly on the MCP client-side transformer.

## Hypothesis Confirmed
- **H1 (backend persist issue):** ❌ ruled out — backend persists and returns commits correctly.
- **H2 (field name mismatch):** ❌ ruled out — backend returns `commits` (camelCase), MCP reads `flowData.commits`.
- **H3 (regex won't match):** ❌ ruled out — `\bdocs?\b` matches "docs: …" strings.
- **H4 (stale cache in MCP):** ❌ ruled out — `getFlow` is freshly awaited inside `handleFlowUpdate`.
- **H5 (transformer drops field):** ✅ **confirmed**.

## Fix Scope
Two changes in `src/api/client.ts`:
1. Add `commits?: { hash: string; message: string }[] | null` to `Flow` type (around line 951 area).
2. Add the field to `transformFlow()` mapping (line 1168):
   ```typescript
   commits: w.commits as { hash: string; message: string }[] | null | undefined,
   ```

After this, the existing check in `src/tools/flow.ts:490-507` works as intended with zero changes. Same applies to git-discipline check at line 511 — it currently only requires commits in the same call; once the transformer exposes persisted commits, we should relax that check too (see Phase B.3 Step 2).

## Secondary Finding
The tool-description of `flow_update` does not explain the commits-semantics. Users naturally split "register commits" from "transition state" into separate calls, which works functionally but has been tripping the docs gate. Description update (A.3) will clarify this regardless of the fix.
