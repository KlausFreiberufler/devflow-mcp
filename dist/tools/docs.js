/**
 * Docs MCP Tools (DF-157)
 * Tools for managing project documentation in DevFlow
 * Replaces the deprecated project_knowledge tools
 */
import { devFlowClient } from '../api/client.js';
import { withErrorHandling } from '../utils/errors.js';
// ============ Tool Definitions ============
const docPageListDef = {
    name: 'doc_page_list',
    description: `List all documentation pages for a project, grouped by section.
Returns sections with their pages (title, id, section, sortOrder).
Use this to see what documentation exists before creating or updating pages.

Automatically uses the linked project if no projectId is provided.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            }
        }
    }
};
const docPageGetDef = {
    name: 'doc_page_get',
    description: `Get a single documentation page with its full content.
Returns title, section, content (markdown), tags, and metadata.

Use doc_page_list first to find the page ID.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            docId: {
                type: 'string',
                description: 'The doc page ID to retrieve'
            }
        },
        required: ['docId']
    }
};
const docPageCreateDef = {
    name: 'doc_page_create',
    description: `Create a new documentation page in a project.
Use this to add new knowledge, guides, or documentation.
Pages are organized by sections (e.g. "Architecture", "Getting Started", "API Reference").

Automatically uses the linked project if no projectId is provided.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            title: {
                type: 'string',
                description: 'Page title'
            },
            section: {
                type: 'string',
                description: 'Section name for grouping (e.g. "Architecture", "Getting Started")'
            },
            content: {
                type: 'string',
                description: 'Page content in markdown'
            }
        },
        required: ['title', 'section', 'content']
    }
};
const docPageUpdateDef = {
    name: 'doc_page_update',
    description: `Update an existing documentation page.
All fields are optional — only provide the fields you want to change.

Use doc_page_list first to find the page ID.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            docId: {
                type: 'string',
                description: 'The doc page ID to update'
            },
            title: {
                type: 'string',
                description: 'New page title'
            },
            section: {
                type: 'string',
                description: 'New section name'
            },
            content: {
                type: 'string',
                description: 'New page content in markdown'
            }
        },
        required: ['docId']
    }
};
const docPageDeleteDef = {
    name: 'doc_page_delete',
    description: `Delete a documentation page.
Use doc_page_list first to find the page ID.`,
    inputSchema: {
        type: 'object',
        properties: {
            projectId: {
                type: 'string',
                description: 'The project ID. If omitted, uses the linked project.'
            },
            docId: {
                type: 'string',
                description: 'The doc page ID to delete'
            }
        },
        required: ['docId']
    }
};
function resolveProjectId(args) {
    return args.projectId || devFlowClient.getLinkedProjectId();
}
async function handleDocPageList(args) {
    const projectId = resolveProjectId(args);
    if (!projectId) {
        return 'Error: projectId is required. No linked project found.';
    }
    const result = await devFlowClient.getProjectDocs(projectId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to list docs'}`;
    }
    const { sections, totalPages } = result.data;
    if (totalPages === 0) {
        return '# Project Documentation\n\n*No documentation pages yet. Use doc_page_create to add pages.*';
    }
    const lines = [`# Project Documentation (${totalPages} pages)\n`];
    for (const section of sections) {
        lines.push(`## ${section.name} (${section.pages.length})`);
        for (const page of section.pages) {
            lines.push(`- **${page.title}** (ID: ${page.id})`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
async function handleDocPageGet(args) {
    const projectId = resolveProjectId(args);
    const docId = args.docId;
    if (!projectId) {
        return 'Error: projectId is required. No linked project found.';
    }
    const result = await devFlowClient.getDocPage(projectId, docId);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Doc page not found'}`;
    }
    const page = result.data;
    return [
        `# ${page.title}`,
        `**Section:** ${page.section} | **Source:** ${page.source} | **Updated:** ${page.updatedAt}`,
        '',
        page.content || '*No content*',
    ].join('\n');
}
async function handleDocPageCreate(args) {
    const projectId = resolveProjectId(args);
    if (!projectId) {
        return 'Error: projectId is required. No linked project found.';
    }
    const result = await devFlowClient.createDocPage(projectId, {
        title: args.title,
        section: args.section,
        content: args.content,
    });
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to create doc page'}`;
    }
    return `Doc page created: **${result.data.title}** (ID: ${result.data.id}) in section "${result.data.section}"`;
}
async function handleDocPageUpdate(args) {
    const projectId = resolveProjectId(args);
    const docId = args.docId;
    if (!projectId) {
        return 'Error: projectId is required. No linked project found.';
    }
    const body = {};
    if (args.title)
        body.title = args.title;
    if (args.section)
        body.section = args.section;
    if (args.content)
        body.content = args.content;
    const result = await devFlowClient.updateDocPage(projectId, docId, body);
    if (!result.success || !result.data) {
        return `Error: ${result.error || 'Failed to update doc page'}`;
    }
    return `Doc page updated: **${result.data.title}** (ID: ${result.data.id})`;
}
async function handleDocPageDelete(args) {
    const projectId = resolveProjectId(args);
    const docId = args.docId;
    if (!projectId) {
        return 'Error: projectId is required. No linked project found.';
    }
    const result = await devFlowClient.deleteDocPage(projectId, docId);
    if (!result.success) {
        return `Error: ${result.error || 'Failed to delete doc page'}`;
    }
    return `Doc page deleted successfully.`;
}
// ============ Tool Registry Export ============
export const tools = {
    doc_page_list: {
        definition: docPageListDef,
        handler: withErrorHandling('doc_page_list', handleDocPageList),
    },
    doc_page_get: {
        definition: docPageGetDef,
        handler: withErrorHandling('doc_page_get', handleDocPageGet),
    },
    doc_page_create: {
        definition: docPageCreateDef,
        handler: withErrorHandling('doc_page_create', handleDocPageCreate),
    },
    doc_page_update: {
        definition: docPageUpdateDef,
        handler: withErrorHandling('doc_page_update', handleDocPageUpdate),
    },
    doc_page_delete: {
        definition: docPageDeleteDef,
        handler: withErrorHandling('doc_page_delete', handleDocPageDelete),
    },
};
