/**
 * Discipline-Token Tools (DF-289 + DF-292)
 *
 * Two tools that let Claude emit + list HMAC-signed discipline-tokens, the
 * proof-of-discipline mechanism that powers `agent_with_discipline` self-approval:
 *
 *   - devflow_token_emit  — emit a fresh signed token for a skill on a flow
 *   - devflow_tokens_list — list active (non-expired) tokens for a flow
 *
 * Tokens are returned ONCE on emit (the backend stores only a hash). Claude
 * should keep the signed token in session memory and pass it to flow_update
 * when transitioning under `agent_with_discipline`.
 */
import type { ToolModule } from './registry.js';
export declare const tools: ToolModule;
