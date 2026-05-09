/**
 * flow_upload + flow_upload_file — Upload files as attachments to a flow.
 *
 * - flow_upload     : text content (string-based). For markdown/JSON/text written by the agent.
 * - flow_upload_file: binary file from disk path. For images/PDFs/large files. (DF-365)
 */
import type { ToolModule } from './registry.js';
export declare const tools: ToolModule;
