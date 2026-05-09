/**
 * flow_upload + flow_upload_file — Upload files as attachments to a flow.
 *
 * - flow_upload     : text content (string-based). For markdown/JSON/text written by the agent.
 * - flow_upload_file: binary file from disk path. For images/PDFs/large files. (DF-365)
 */

import { devFlowClient } from '../api/client.js';
import type { ToolModule } from './registry.js';
import { withErrorHandling } from '../utils/errors.js';
import { sessionContext } from '../context/session.js';

// DF-282: 'decision' added — backend has supported it since DF-224.
// kind='decision' attachments can be promoted to ADRs via adr_accept.
const ALLOWED_KINDS = ['plan', 'summary', 'design', 'decision', 'notes'] as const;
type AttachmentKind = typeof ALLOWED_KINDS[number];

const flowUploadDef = {
  name: 'flow_upload',
  description:
    'Upload a file as an attachment to the current flow.\n' +
    'Use this to attach markdown documents, text notes, HTML docs, or other text-based files.\n' +
    'The file will be visible in the DevFlow UI and accessible to other agents.\n\n' +
    'Common use cases:\n' +
    '- Upload implementation plans as .md files (use kind="plan" to link it to the flow)\n' +
    '- Attach analysis notes or design documents (kind="design" or "notes")\n' +
    '- Save code review summaries (kind="summary")\n' +
    '- Document architectural decisions (kind="decision" — can be promoted to ADR via adr_accept)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to attach the file to. If omitted, uses the current flow.',
      },
      filename: {
        type: 'string',
        description: 'The filename (e.g. "implementation-plan.md", "notes.txt", "spec.html")',
      },
      content: {
        type: 'string',
        description: 'The file content as a string',
      },
      kind: {
        type: 'string',
        enum: [...ALLOWED_KINDS],
        description: 'Optional classification. kind="plan" also links the file as the flow\'s implementation plan.',
      },
    },
    required: ['filename', 'content'],
  },
};

async function handleFlowUpload(args: Record<string, unknown>): Promise<string> {
  const flowId = (args.flowId as string) || sessionContext.getFlowId();
  const filename = args.filename as string;
  const content = args.content as string;
  const kindArg = typeof args.kind === 'string' ? args.kind.toLowerCase() : undefined;
  const kind = (kindArg && ALLOWED_KINDS.includes(kindArg as AttachmentKind))
    ? (kindArg as AttachmentKind)
    : undefined;

  if (!flowId) {
    return 'Error: No flowId provided and no active flow session. Call devflow_init first.';
  }

  if (!filename || !content) {
    return 'Error: filename and content are required.';
  }

  if (kindArg && !kind) {
    return `Error: Invalid kind "${kindArg}". Allowed: ${ALLOWED_KINDS.join(', ')}`;
  }

  // Determine mime type from extension
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
  };
  const mimeType = mimeTypes[ext] || 'text/plain';

  const result = await devFlowClient.uploadAttachment(flowId, filename, content, mimeType, kind);
  if (!result.success) {
    return `Error uploading file: ${result.error || 'Unknown error'}`;
  }

  const att = result.data;
  const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
  const url = att?.url?.startsWith('http') ? att.url : `${baseUrl}${att?.url || ''}`;

  const planHint = kind === 'plan'
    ? '\n\nThe file is now linked as the flow\'s implementation plan.'
    : '';

  return `File uploaded successfully.\n\n**${filename}** (${mimeType}, ${content.length} bytes)${kind ? `\nKind: ${kind}` : ''}\nURL: ${url}${planHint}`;
}

// ===========================================
// DF-365 — flow_upload_file (binary file from disk)
// ===========================================

const flowUploadFileDef = {
  name: 'flow_upload_file',
  description:
    'Attach a file from disk to the current flow. Use this for images / PDFs / large files (up to 50 MB).\n\n' +
    'For agent-written text content (markdown plans, summaries, notes), prefer `flow_upload` which takes the content as a string.\n\n' +
    'The file is read from `filePath`, the mime-type is detected from the extension, and the upload is sent as multipart/form-data with auth.\n\n' +
    'Common use cases:\n' +
    '- Attach a screenshot, photo, or generated cover image to a flow\n' +
    '- Attach a PDF report or design doc the user has on disk\n' +
    '- Attach large CSV / YAML / JSON exports that exceed the 100 KB string-content boundary',
  inputSchema: {
    type: 'object' as const,
    properties: {
      flowId: {
        type: 'string',
        description: 'The flow ID to attach the file to. If omitted, uses the current flow.',
      },
      filePath: {
        type: 'string',
        description: 'Absolute path to the file on disk (e.g. "/tmp/cover.png").',
      },
      kind: {
        type: 'string',
        enum: [...ALLOWED_KINDS],
        description: 'Optional classification. kind="plan" also links the file as the flow\'s implementation plan.',
      },
    },
    required: ['filePath'],
  },
};

async function handleFlowUploadFile(args: Record<string, unknown>): Promise<string> {
  const flowId = (args.flowId as string) || sessionContext.getFlowId();
  const filePath = args.filePath as string;
  const kindArg = typeof args.kind === 'string' ? args.kind.toLowerCase() : undefined;
  const kind = (kindArg && ALLOWED_KINDS.includes(kindArg as AttachmentKind))
    ? (kindArg as AttachmentKind)
    : undefined;

  if (!flowId) {
    return 'Error: No flowId provided and no active flow session. Call devflow_init first.';
  }
  if (!filePath) {
    return 'Error: filePath is required (absolute path to the file on disk).';
  }
  if (kindArg && !kind) {
    return `Error: Invalid kind "${kindArg}". Allowed: ${ALLOWED_KINDS.join(', ')}`;
  }

  const result = await devFlowClient.uploadAttachmentFile(flowId, filePath, kind);
  if (!result.success) {
    return `Error uploading file: ${result.error || 'Unknown error'}`;
  }

  const att = result.data;
  const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
  const url = att?.url?.startsWith('http') ? att.url : `${baseUrl}${att?.url || ''}`;
  const sizeKb = att?.fileSize ? `${(att.fileSize / 1024).toFixed(1)} KB` : 'size unknown';
  const planHint = kind === 'plan'
    ? '\n\nThe file is now linked as the flow\'s implementation plan.'
    : '';

  return `File attached.\n\n**${att?.originalName ?? 'file'}** (${att?.mimeType ?? 'unknown'}, ${sizeKb})${kind ? `\nKind: ${kind}` : ''}\nURL: ${url}${planHint}`;
}

export const tools: ToolModule = {
  flow_upload: {
    definition: flowUploadDef,
    handler: withErrorHandling('flow_upload', handleFlowUpload),
  },
  flow_upload_file: {
    definition: flowUploadFileDef,
    handler: withErrorHandling('flow_upload_file', handleFlowUploadFile),
  },
};
