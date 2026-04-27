/**
 * State-aware Planning + Resolution Tools (DF-269)
 *
 * Four tools that let Claude use the backend features from DF-261/263/264:
 *   - pending_work              — 4-bucket snapshot of in-flight work
 *   - intent_resolve            — close a forward-intent page
 *   - knowledge_autotag_suggest — TF-IDF tag suggestions from existing project tags
 *   - knowledge_check_resolve   — resolve a knowledge-check warning (adr/pattern/runbook/intent_defer/dismiss)
 */
import type { ToolModule } from './registry.js';
export declare const tools: ToolModule;
