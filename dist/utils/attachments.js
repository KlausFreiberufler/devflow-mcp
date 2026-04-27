/**
 * Format flow attachments for MCP output
 */
function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function formatAttachmentList(attachments) {
    const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
    const lines = [`## Attachments (${attachments.length})\n`];
    for (const att of attachments) {
        const url = att.url.startsWith('http') ? att.url : `${baseUrl.replace(/\/$/, '')}${att.url}`;
        const size = formatFileSize(att.fileSize);
        lines.push(`- **${att.originalName}** (${att.mimeType}, ${size}) — ${url}`);
    }
    return lines.join('\n');
}
