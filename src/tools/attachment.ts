/**
 * flow_upload — Upload files as attachments to a flow
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';
import { sessionContext } from '../context/session.js';

const flowUploadDef = {
  name: 'flow_upload',
  description:
    'Upload a file as an attachment to the current flow.\n' +
    'Use this to attach markdown documents, text notes, or other text-based files.\n' +
    'The file will be visible in the DevFlow UI and accessible to other agents.\n\n' +
    'Common use cases:\n' +
    '- Upload implementation plans as .md files\n' +
    '- Attach analysis notes or design documents\n' +
    '- Save code review summaries',
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to attach the file to. If omitted, uses the current flow.',
      },
      filename: {
        type: 'string',
        description: 'The filename (e.g. "implementation-plan.md", "notes.txt")',
      },
      content: {
        type: 'string',
        description: 'The file content as a string',
      },
    },
    required: ['filename', 'content'],
  },
};

async function handleFlowUpload(args: Record<string, unknown>): Promise<string> {
  const flowId = (args.flowId as string) || sessionContext.getFlowId();
  const filename = args.filename as string;
  const content = args.content as string;

  if (!flowId) {
    return 'Error: No flowId provided and no active flow session. Call devflow_init first.';
  }

  if (!filename || !content) {
    return 'Error: filename and content are required.';
  }

  // Determine mime type from extension
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
  };
  const mimeType = mimeTypes[ext] || 'text/plain';

  const result = await devFlowClient.uploadAttachment(flowId, filename, content, mimeType);
  if (!result.success) {
    return `Error uploading file: ${result.error || 'Unknown error'}`;
  }

  const att = result.data;
  const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
  const url = att?.url?.startsWith('http') ? att.url : `${baseUrl}${att?.url || ''}`;

  return `File uploaded successfully.\n\n**${filename}** (${mimeType}, ${content.length} bytes)\nURL: ${url}`;
}

export const tools: ToolModule = {
  flow_upload: {
    definition: flowUploadDef,
    handler: withErrorHandling('flow_upload', handleFlowUpload),
  },
};
