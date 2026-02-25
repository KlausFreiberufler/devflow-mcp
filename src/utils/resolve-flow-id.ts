import { devFlowClient } from '../api/client.js';

/**
 * Resolve a partial flow ID to a full ID.
 * Supports display IDs (e.g., "WF-21", "DF-5", "5A2-24"), internal IDs, and prefix matching.
 */
export async function resolveFlowId(partialId: string): Promise<string | null> {
  // Check if input looks like a display ID (e.g., "WF-21", "DF-5", "5A2-24")
  const isDisplayId = /^[A-Za-z0-9]+-\d+$/i.test(partialId);

  if (isDisplayId) {
    const list = await devFlowClient.listFlows();
    if (!list.success || !list.data) {
      return null;
    }
    const normalizedInput = partialId.toUpperCase();
    const match = list.data.find(w => w.displayId?.toUpperCase() === normalizedInput);
    return match ? match.id : null;
  }

  // Try exact match with internal ID
  const exact = await devFlowClient.getFlow(partialId);
  if (exact.success && exact.data) {
    return partialId;
  }

  // Fallback: prefix match on internal ID
  const list = await devFlowClient.listFlows();
  if (!list.success || !list.data) {
    return null;
  }

  const matches = list.data.filter(w => w.id.startsWith(partialId));
  if (matches.length === 1) {
    return matches[0].id;
  }

  return null;
}
