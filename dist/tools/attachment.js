/**
 * flow_upload — Upload files as attachments to a flow
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
import { sessionContext } from '../context/session.js';
// DF-282: 'decision' added — backend has supported it since DF-224.
// kind='decision' attachments can be promoted to ADRs via adr_accept.
const ALLOWED_KINDS = ['plan', 'summary', 'design', 'decision', 'notes'];
const flowUploadDef = {
    name: 'flow_upload',
    description: 'Upload a file as an attachment to the current flow.\n' +
        'Use this to attach markdown documents, text notes, HTML docs, or other text-based files.\n' +
        'The file will be visible in the DevFlow UI and accessible to other agents.\n\n' +
        'Common use cases:\n' +
        '- Upload implementation plans as .md files (use kind="plan" to link it to the flow)\n' +
        '- Attach analysis notes or design documents (kind="design" or "notes")\n' +
        '- Save code review summaries (kind="summary")\n' +
        '- Document architectural decisions (kind="decision" — can be promoted to ADR via adr_accept)',
    inputSchema: {
        type: 'object',
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
async function handleFlowUpload(args) {
    const flowId = args.flowId || sessionContext.getFlowId();
    const filename = args.filename;
    const content = args.content;
    const kindArg = typeof args.kind === 'string' ? args.kind.toLowerCase() : undefined;
    const kind = (kindArg && ALLOWED_KINDS.includes(kindArg))
        ? kindArg
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
    const mimeTypes = {
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
export const tools = {
    flow_upload: {
        definition: flowUploadDef,
        handler: withErrorHandling('flow_upload', handleFlowUpload),
    },
};
