/**
 * DevFlow API Client
 * Handles authentication and API communication with the DevFlow backend
 * Uses 'flow' terminology (backend endpoints: /api/flows)
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { getToken, loadProjectConfig } from '../auth/browser-auth.js';
import { detectClientType } from '../context/client-detect.js';
import { MCP_VERSION } from '../config/version.js';
import { getWorkingDir } from '../utils/working-dir.js';
export class DevFlowClient {
    baseUrl;
    credentials = null;
    credentialsPath;
    projectConfig = null;
    workingDir;
    agentSessionId = null;
    scopedProjectId = null;
    heartbeatInterval = null;
    constructor(baseUrl, workingDir) {
        this.baseUrl = baseUrl || process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
        this.credentialsPath = join(homedir(), '.devflow', 'credentials.json');
        this.workingDir = workingDir || getWorkingDir();
        // Project scoping via environment variable
        this.scopedProjectId = process.env.DEVFLOW_PROJECT_ID || null;
    }
    /**
     * Initialize the client - load credentials, project config, or authenticate via browser
     */
    async init() {
        // Load project configuration if available
        this.projectConfig = await loadProjectConfig(this.workingDir);
        if (this.projectConfig) {
            console.error(`Linked to project: ${this.projectConfig.projectName}`);
        }
        // First check for environment variable
        const envToken = process.env.DEVFLOW_TOKEN;
        if (envToken) {
            this.setToken(envToken);
            return;
        }
        // Try to load saved credentials
        try {
            const data = await readFile(this.credentialsPath, 'utf-8');
            this.credentials = JSON.parse(data);
            // Check if token is expired
            if (this.credentials && this.credentials.expiresAt < Date.now()) {
                // Token expired - need to re-authenticate
                this.credentials = null;
            }
        }
        catch {
            // No credentials file
            this.credentials = null;
        }
        // If no valid credentials and no project linked, run in passive mode
        // (no browser auth popup, no heartbeat — just register tools silently)
        if (!this.credentials && !this.projectConfig) {
            console.error('No project linked and no credentials — running in passive mode.');
            console.error('Use devflow_init or flow_create to activate.');
            return;
        }
        // If no valid credentials but project is linked, authenticate via browser
        if (!this.credentials) {
            try {
                const token = await getToken(this.baseUrl, this.workingDir);
                this.setToken(token);
                // Reload project config after auth (in case user just linked a project)
                this.projectConfig = await loadProjectConfig(this.workingDir);
            }
            catch (error) {
                console.error('Authentication failed:', error);
                // Will show error when tools are called
            }
        }
        // Send initial heartbeat and start periodic heartbeat (only when authenticated)
        if (this.credentials) {
            await this.sendHeartbeat();
            this.startHeartbeat();
        }
    }
    /**
     * Check if client is authenticated
     */
    isAuthenticated() {
        return this.credentials !== null && this.credentials.expiresAt > Date.now();
    }
    /**
     * Get linked project ID (if any)
     */
    getLinkedProjectId() {
        return this.scopedProjectId || this.projectConfig?.projectId || null;
    }
    /**
     * Get linked project name (if any)
     */
    getLinkedProjectName() {
        return this.projectConfig?.projectName || null;
    }
    /**
     * Check if a project is linked
     */
    hasLinkedProject() {
        return this.projectConfig !== null;
    }
    /**
     * Get authentication instructions for the user
     */
    getAuthInstructions() {
        return `
Authentication required. The browser should open automatically.
If it doesn't, please:

1. Open DevFlow: ${this.baseUrl.replace('api.', 'app.')}
2. Log in with your credentials
3. The connection will be established automatically

Or set: export DEVFLOW_TOKEN="your-token"
`;
    }
    /**
     * Set credentials directly (from environment variable)
     */
    setToken(token) {
        this.credentials = {
            accessToken: token,
            refreshToken: '',
            expiresAt: Date.now() + 100 * 365.25 * 24 * 60 * 60 * 1000 // ~100 years (never expires, revoke via UI)
        };
    }
    /**
     * Save credentials to file
     */
    async saveCredentials() {
        if (!this.credentials)
            return;
        const dir = join(homedir(), '.devflow');
        await mkdir(dir, { recursive: true });
        await writeFile(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
    }
    /**
     * Refresh access token using refresh token
     */
    async refreshTokens() {
        if (!this.credentials?.refreshToken) {
            throw new Error('No refresh token available');
        }
        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.credentials.refreshToken })
        });
        if (!response.ok) {
            this.credentials = null;
            throw new Error('Token refresh failed - please re-authenticate');
        }
        const data = await response.json();
        if (data.success && data.data) {
            this.credentials = {
                accessToken: data.data.accessToken,
                refreshToken: data.data.refreshToken,
                expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
            };
            await this.saveCredentials();
        }
    }
    /**
     * Parse response and handle non-JSON responses gracefully
     */
    async parseResponse(response, path) {
        const contentType = response.headers.get('content-type') || '';
        // Check if response is JSON
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            // Check if we got HTML (likely a redirect to login page or 404 page)
            if (text.includes('<!DOCTYPE') || text.includes('<html')) {
                return {
                    success: false,
                    error: `Endpoint ${path} returned HTML instead of JSON (status: ${response.status}). Check if the endpoint exists and authentication is valid.`
                };
            }
            return {
                success: false,
                error: `Unexpected response type: ${contentType} (status: ${response.status})`
            };
        }
        // Handle HTTP error status codes
        if (!response.ok) {
            try {
                const errorData = await response.json();
                const result = {
                    success: false,
                    error: errorData.error || errorData.message || `HTTP ${response.status}`,
                    statusCode: response.status,
                };
                if (errorData.gate) {
                    result.gate = errorData.gate;
                }
                return result;
            }
            catch {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    statusCode: response.status,
                };
            }
        }
        return await response.json();
    }
    /**
     * Make authenticated API request
     */
    async request(method, path, body) {
        // Check for token from environment first
        const envToken = process.env.DEVFLOW_TOKEN;
        if (envToken && !this.credentials) {
            this.setToken(envToken);
        }
        if (!this.credentials) {
            return {
                success: false,
                error: `Not authenticated. ${this.getAuthInstructions()}`
            };
        }
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.credentials.accessToken}`,
        };
        if (this.agentSessionId) {
            headers['X-Agent-Session'] = this.agentSessionId;
        }
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}${path}`, options);
                // Handle 401 - try to refresh or re-authenticate
                if (response.status === 401) {
                    if (this.credentials?.refreshToken) {
                        // Try refresh token first
                        try {
                            await this.refreshTokens();
                            headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
                            const retryResponse = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
                            return await this.parseResponse(retryResponse, path);
                        }
                        catch {
                            // Refresh failed - fall through to browser auth
                        }
                    }
                    // No refresh token or refresh failed - re-authenticate via browser
                    try {
                        const token = await getToken(this.baseUrl, this.workingDir);
                        this.setToken(token);
                        await this.saveCredentials();
                        headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
                        const retryResponse = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
                        return await this.parseResponse(retryResponse, path);
                    }
                    catch (authError) {
                        // Auth failed - return original 401 response
                        return await this.parseResponse(response, path);
                    }
                }
                // Retry on 5xx server errors
                if (response.status >= 500 && attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                return await this.parseResponse(response, path);
            }
            catch (error) {
                // Retry on network errors
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                const msg = error instanceof Error ? error.message : 'Unknown error';
                if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
                    return {
                        success: false,
                        error: `Server nicht erreichbar (${this.baseUrl}). Läuft der Backend-Server? Versuche: docker-compose up`
                    };
                }
                return {
                    success: false,
                    error: `API request failed: ${msg}`
                };
            }
        }
        return { success: false, error: 'Max retries exceeded' };
    }
    // ============ Project Methods ============
    async listProjects() {
        const result = await this.request('GET', '/api/projects');
        if (result.success && result.data) {
            return { success: true, data: result.data.map(transformProject) };
        }
        return result;
    }
    async getProject(projectId) {
        const result = await this.request('GET', `/api/projects/${projectId}`);
        if (result.success && result.data) {
            return { success: true, data: transformProject(result.data) };
        }
        return result;
    }
    /**
     * Get the current linked project (convenience method)
     */
    async getCurrentProject() {
        const projectId = this.getLinkedProjectId();
        if (!projectId) {
            return {
                success: false,
                error: 'No project linked. Run flow_list to see all flows, or re-authenticate to link a project.'
            };
        }
        return this.getProject(projectId);
    }
    async createProject(data) {
        const result = await this.request('POST', '/api/projects', data);
        if (result.success && result.data) {
            return { success: true, data: transformProject(result.data) };
        }
        return result;
    }
    async updateProject(projectId, data) {
        const result = await this.request('PATCH', `/api/projects/${projectId}`, data);
        if (result.success && result.data) {
            return { success: true, data: transformProject(result.data) };
        }
        return result;
    }
    // ============ Flow Methods ============
    /**
     * List flows - requires a linked project
     */
    async listFlows(projectId) {
        const effectiveProjectId = projectId || this.getLinkedProjectId();
        if (!effectiveProjectId) {
            return { success: false, error: 'No project linked. Create a .devflow.json or re-authenticate to link a project.' };
        }
        const path = `/api/flows?projectId=${effectiveProjectId}`;
        const result = await this.request('GET', path);
        if (result.success && result.data) {
            return { success: true, data: result.data.map(transformFlow) };
        }
        return result;
    }
    async createFlow(flow) {
        // Map to backend field names
        const apiFlow = {
            projectId: flow.projectId,
            ticketSummary: flow.summary,
            ticketDescription: flow.description,
            flowType: flow.flowType || 'feature',
        };
        if (flow.acceptanceCriteria) {
            apiFlow.acceptanceCriteria = flow.acceptanceCriteria;
        }
        const result = await this.request('POST', '/api/flows', apiFlow);
        if (result.success && result.data) {
            return { success: true, data: transformFlow(result.data) };
        }
        return result;
    }
    async getFlow(flowId) {
        const result = await this.request('GET', `/api/flows/${flowId}`);
        if (result.success && result.data) {
            return { success: true, data: transformFlow(result.data) };
        }
        return result;
    }
    async updateFlow(flowId, update) {
        const result = await this.request('PATCH', `/api/flows/${flowId}`, update);
        if (result.success && result.data) {
            return { success: true, data: transformFlow(result.data) };
        }
        return result;
    }
    async getFlowFeedback(flowId) {
        return this.request('GET', `/api/flows/${flowId}/feedback`);
    }
    async getAttachments(flowId) {
        return this.request('GET', `/api/flows/${flowId}/attachments`);
    }
    async uploadAttachment(flowId, filename, content, mimeType = 'text/markdown', kind) {
        if (!this.credentials) {
            return { success: false, error: 'Not authenticated.' };
        }
        const blob = new Blob([content], { type: mimeType });
        const formData = new FormData();
        formData.append('file', blob, filename);
        if (kind)
            formData.append('kind', kind);
        const headers = {
            'Authorization': `Bearer ${this.credentials.accessToken}`,
        };
        if (this.agentSessionId) {
            headers['X-Agent-Session'] = this.agentSessionId;
        }
        const response = await fetch(`${this.baseUrl}/api/flows/${flowId}/attachments`, {
            method: 'POST',
            headers,
            body: formData,
        });
        return response.json();
    }
    /**
     * DF-208: Fetch raw attachment content from the auth-protected endpoint.
     * Returns either text (for text-like MIME types) or base64 (for binary).
     */
    async getAttachmentContent(flowId, attachmentId) {
        if (!this.credentials) {
            return { success: false, error: 'Not authenticated.' };
        }
        const headers = {
            'Authorization': `Bearer ${this.credentials.accessToken}`,
        };
        if (this.agentSessionId) {
            headers['X-Agent-Session'] = this.agentSessionId;
        }
        const url = `${this.baseUrl}/api/flows/${flowId}/attachments/${attachmentId}/content`;
        const response = await fetch(url, { headers });
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        const mimeType = response.headers.get('content-type')?.split(';')[0].trim() || 'application/octet-stream';
        const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
        if (isText) {
            const text = await response.text();
            return { success: true, mimeType, text };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        return { success: true, mimeType, base64: buffer.toString('base64') };
    }
    /**
     * DF-208: Fetch arbitrary URL (e.g. TipTap-embedded image) and return base64 + mimeType.
     * Uses Bearer auth if URL is on the DevFlow base URL.
     */
    async fetchBinaryAsBase64(url) {
        const headers = {};
        // Only send auth for same-origin URLs
        if (url.startsWith(this.baseUrl) && this.credentials) {
            headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
        }
        try {
            const response = await fetch(url, { headers });
            if (!response.ok)
                return { success: false, error: `HTTP ${response.status}` };
            const mimeType = response.headers.get('content-type')?.split(';')[0].trim() || 'application/octet-stream';
            const buffer = Buffer.from(await response.arrayBuffer());
            return { success: true, mimeType, base64: buffer.toString('base64') };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    // ============ Task/Todo Methods ============
    async listTasks(flowId) {
        const result = await this.request('GET', `/api/flows/${flowId}/todos`);
        if (result.success && result.data) {
            return { success: true, data: result.data.map(transformTask) };
        }
        return result;
    }
    async createTask(task) {
        // API expects 'text' instead of 'summary'
        const apiTask = {
            flowId: task.flowId,
            parentId: task.parentId,
            text: task.summary, // Map summary -> text
            description: task.description,
            acceptanceCriteria: task.acceptanceCriteria
        };
        const result = await this.request('POST', '/api/todos', apiTask);
        if (result.success && result.data) {
            return { success: true, data: transformTask(result.data) };
        }
        return result;
    }
    async updateTask(taskId, update) {
        // Map MCP field names to backend field names
        const apiUpdate = {};
        if (update.isCompleted !== undefined)
            apiUpdate.checked = update.isCompleted;
        if (update.summary !== undefined)
            apiUpdate.text = update.summary;
        if (update.description !== undefined)
            apiUpdate.description = update.description;
        if (update.status !== undefined)
            apiUpdate.status = update.status;
        if (update.acceptanceCriteria !== undefined)
            apiUpdate.acceptanceCriteria = update.acceptanceCriteria;
        const result = await this.request('PATCH', `/api/todos/${taskId}`, apiUpdate);
        if (result.success && result.data) {
            return { success: true, data: transformTask(result.data) };
        }
        return result;
    }
    // ============ Agent Session Methods ============
    async listAgentSessions(flowId) {
        const path = flowId
            ? `/api/agent-sessions/flow/${flowId}`
            : '/api/agent-sessions';
        return this.request('GET', path);
    }
    async createAgentSession(data) {
        return this.request('POST', '/api/agent-sessions', data);
    }
    async logAgentSession(sessionId, data) {
        return this.request('POST', `/api/agent-sessions/${sessionId}/log`, data);
    }
    async completeAgentSession(sessionId, data) {
        return this.request('POST', `/api/agent-sessions/${sessionId}/complete`, data || {});
    }
    // ============ Docs Methods (DF-157) ============
    async getProjectDocs(projectId) {
        return this.request('GET', `/api/projects/${projectId}/docs`);
    }
    async getDocPage(projectId, docId) {
        return this.request('GET', `/api/projects/${projectId}/docs/${docId}`);
    }
    async createDocPage(projectId, data) {
        return this.request('POST', `/api/projects/${projectId}/docs`, data);
    }
    async updateDocPage(projectId, docId, data) {
        return this.request('PATCH', `/api/projects/${projectId}/docs/${docId}`, data);
    }
    async deleteDocPage(projectId, docId) {
        return this.request('DELETE', `/api/projects/${projectId}/docs/${docId}`);
    }
    // ============ Knowledge Wiki Methods (DF-226) ============
    async searchWiki(projectId, q, limit = 20) {
        return this.request('GET', `/api/knowledge/search?projectId=${projectId}&q=${encodeURIComponent(q)}&limit=${limit}`);
    }
    async getBacklinks(assetType, assetId) {
        return this.request('GET', `/api/knowledge/backlinks?assetType=${assetType}&assetId=${encodeURIComponent(assetId)}`);
    }
    async getOutgoing(assetType, assetId) {
        return this.request('GET', `/api/knowledge/outgoing?assetType=${assetType}&assetId=${encodeURIComponent(assetId)}`);
    }
    async fetchGraph(projectId, types, tags) {
        const params = new URLSearchParams({ projectId });
        if (types?.length)
            params.set('types', types.join(','));
        if (tags?.length)
            params.set('tags', tags.join(','));
        return this.request('GET', `/api/knowledge/graph?${params.toString()}`);
    }
    async resolveWikiLink(projectId, raw) {
        return this.request('GET', `/api/knowledge/resolve?projectId=${projectId}&raw=${encodeURIComponent(raw)}`);
    }
    // ============ ADR Methods (DF-226) ============
    async fetchAdrs(projectId, status) {
        const q = status ? `?status=${status}` : '';
        return this.request('GET', `/api/projects/${projectId}/adrs${q}`);
    }
    async fetchAdr(projectId, number) {
        return this.request('GET', `/api/projects/${projectId}/adrs/${number}`);
    }
    async acceptAdrFromAttachment(projectId, attachmentId, opts = {}) {
        return this.request('POST', `/api/projects/${projectId}/adrs/accept`, { attachmentId, ...opts });
    }
    async updateAdrStatus(adrId, status) {
        return this.request('PATCH', `/api/adrs/${adrId}`, { status });
    }
    async fetchAdrAuditLog(adrId) {
        return this.request('GET', `/api/adrs/${adrId}/audit-log`);
    }
    // ============ Knowledge Drafts Methods (DF-245) ============
    async prepareKnowledgeBackfill(projectId, limit = 50) {
        return this.request('GET', `/api/projects/${projectId}/knowledge-backfill/prepare?limit=${limit}`);
    }
    async createKnowledgeDraft(data) {
        return this.request('POST', '/api/knowledge-drafts', data);
    }
    async listKnowledgeDrafts(projectId, status) {
        const q = status ? `?status=${status}` : '';
        return this.request('GET', `/api/projects/${projectId}/knowledge-drafts${q}`);
    }
    async acceptKnowledgeDraft(id) {
        return this.request('POST', `/api/knowledge-drafts/${id}/accept`);
    }
    async rejectKnowledgeDraft(id, notes) {
        return this.request('POST', `/api/knowledge-drafts/${id}/reject`, notes ? { notes } : {});
    }
    async prepareKnowledgeHarvest(flowId) {
        return this.request('GET', `/api/flows/${flowId}/knowledge-harvest/prepare`);
    }
    async prepareKnowledgeCheck(flowId) {
        return this.request('GET', `/api/flows/${flowId}/knowledge-check/prepare`);
    }
    async fetchPlanningContext(flowId) {
        return this.request('GET', `/api/flows/${flowId}/planning-context`);
    }
    async flowSealBackfill(projectId) {
        return this.request('POST', `/api/projects/${projectId}/flow-seal-backfill`);
    }
    async updateAdrAffectsPaths(adrId, paths) {
        return this.request('PATCH', `/api/adrs/${adrId}`, { affectsPaths: paths });
    }
    // ============ DF-269 — State-aware planning + resolutions ============
    async fetchPendingWork(projectId, opts = {}) {
        const qs = new URLSearchParams();
        if (opts.tags?.length)
            qs.set('tags', opts.tags.join(','));
        if (opts.paths?.length)
            qs.set('paths', opts.paths.join(','));
        if (opts.excludeFlowId)
            qs.set('excludeFlowId', opts.excludeFlowId);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request('GET', `/api/projects/${projectId}/pending-work${suffix}`);
    }
    async resolveIntent(flowId, pageId, note) {
        return this.request('POST', `/api/flows/${flowId}/intents/${pageId}/resolve`, note ? { note } : {});
    }
    async suggestAutoTags(projectId, content, opts = {}) {
        return this.request('POST', `/api/knowledge/autotag-suggest?projectId=${projectId}`, {
            content,
            existingTags: opts.existingTags || [],
            limit: opts.limit ?? 5
        });
    }
    async createKnowledgeResolution(flowId, payload) {
        return this.request('POST', `/api/flows/${flowId}/knowledge-resolutions`, payload);
    }
    // ============ Guidelines Methods ============
    async getProjectGuidelines(projectId) {
        const id = projectId || this.getLinkedProjectId();
        if (!id) {
            return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
        }
        return this.request('GET', `/api/projects/${id}/guidelines`);
    }
    async updateProjectGuidelines(guidelines, projectId) {
        const id = projectId || this.getLinkedProjectId();
        if (!id) {
            return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
        }
        return this.request('PATCH', `/api/projects/${id}/guidelines`, { guidelines });
    }
    // ============ Release Methods ============
    async listReleases(projectId) {
        const id = projectId || this.getLinkedProjectId();
        if (!id) {
            return { success: false, error: 'No project linked. Create a .devflow.json or re-authenticate to link a project.' };
        }
        return this.request('GET', `/api/releases?projectId=${id}`);
    }
    async getRelease(releaseId) {
        return this.request('GET', `/api/releases/${releaseId}`);
    }
    async createRelease(data) {
        const body = {
            ...data,
            projectId: data.projectId || this.getLinkedProjectId(),
        };
        if (!body.projectId) {
            return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
        }
        return this.request('POST', '/api/releases', body);
    }
    async updateRelease(releaseId, data) {
        return this.request('PATCH', `/api/releases/${releaseId}`, data);
    }
    async activateRelease(releaseId) {
        return this.request('POST', `/api/releases/${releaseId}/activate`);
    }
    async deactivateRelease(releaseId) {
        return this.request('POST', `/api/releases/${releaseId}/deactivate`);
    }
    async updateReleaseBranch(releaseId, data) {
        return this.request('PATCH', `/api/releases/${releaseId}/branch`, data);
    }
    async getGitSettings(projectId) {
        const id = projectId || this.getLinkedProjectId();
        if (!id) {
            return { success: false, error: 'No project ID.' };
        }
        return this.request('GET', `/api/projects/${id}/git-settings`);
    }
    // ============ Heartbeat Methods ============
    async sendHeartbeat() {
        const projectId = this.getLinkedProjectId();
        const clientType = detectClientType();
        try {
            await this.request('POST', '/api/mcp/heartbeat', {
                clientType,
                projectId: projectId || undefined,
                mcpVersion: MCP_VERSION,
                sessionId: this.getAgentSessionId() || undefined,
                workingDirectory: process.cwd(),
            });
        }
        catch {
            // Heartbeat failure is non-critical, don't crash
        }
    }
    startHeartbeat() {
        const intervalMs = parseInt(process.env.DEVFLOW_HEARTBEAT_INTERVAL || '300000', 10);
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    // ============ Config Methods ============
    /**
     * Get the base URL for direct API calls
     */
    getBaseUrl() {
        return this.baseUrl;
    }
    setAgentSessionId(sessionId) {
        this.agentSessionId = sessionId;
    }
    getAgentSessionId() {
        return this.agentSessionId;
    }
    /**
     * Get the current access token (or null if not authenticated)
     */
    getAccessToken() {
        return this.credentials?.accessToken ?? null;
    }
    async getProjectConfig(projectId) {
        const id = projectId || this.getLinkedProjectId();
        if (!id) {
            return { success: false, error: 'No project ID for config sync.' };
        }
        return this.request('GET', `/api/projects/${id}/config`);
    }
    // ============ Connection Management Methods ============
    /**
     * Check if heartbeat is currently running
     */
    hasActiveHeartbeat() {
        return this.heartbeatInterval !== null;
    }
    /**
     * Reconnect: refresh token (or re-authenticate), restart heartbeat
     */
    async reconnect() {
        this.stopHeartbeat();
        if (this.credentials?.refreshToken) {
            try {
                await this.refreshTokens();
                await this.saveCredentials();
                return;
            }
            catch {
                // Refresh failed, try browser auth
            }
        }
        // Re-authenticate via browser
        const { getToken } = await import('../auth/browser-auth.js');
        const token = await getToken(this.baseUrl, this.workingDir);
        this.setToken(token);
        await this.saveCredentials();
        // Reload project config
        this.projectConfig = await loadProjectConfig(this.workingDir);
    }
    /**
     * Reload project config from .devflow.json in working directory
     */
    async reloadProjectConfig() {
        this.projectConfig = await loadProjectConfig(this.workingDir);
    }
    /**
     * Clear project config (for unlink)
     */
    clearProjectConfig() {
        this.projectConfig = null;
    }
    // ============ Agent Slot Methods ============
    /**
     * Check if the current user has a free agent slot.
     * Returns slot status: { active: boolean, flow?: { id, summary, agentStatus, since } }
     * 404 means the backend doesn't support slots yet → treat as free.
     */
    async getAgentSlotStatus() {
        const result = await this.request('GET', '/api/agent-slots/status');
        // If endpoint doesn't exist, treat slot as free
        if (!result.success && result.error?.includes('404')) {
            return { success: true, data: { active: false } };
        }
        return result;
    }
    // ============ Session Init Methods ============
    async initSession(flowId) {
        return this.request('POST', '/api/agent-sessions/init', { flowId });
    }
    async touchSessionActivity(sessionId) {
        return this.request('PATCH', `/api/agent-sessions/${sessionId}/activity`);
    }
    /**
     * Get the next pipeline step for a flow.
     * Returns allowedActions, pipelineStep, kind, transitionPolicy, etc.
     */
    async getNextStep(flowId) {
        return this.request('GET', `/api/flows/${flowId}/next-step`);
    }
    // ============ Discovery Methods ============
    async discoverProject(repoUrl) {
        const result = await this.request('GET', `/api/projects/discover?repoUrl=${encodeURIComponent(repoUrl)}`);
        if (result.success && result.data) {
            return result.data;
        }
        return { found: false };
    }
    // ============ Search Methods ============
    async search(query, type) {
        const params = new URLSearchParams({ q: query });
        if (type && type !== 'all')
            params.set('type', type);
        const response = await this.request('GET', `/api/search?${params.toString()}`);
        // Backend wraps results in { results: [...] }, unwrap for consumers
        if (response.success && response.data) {
            return { success: true, data: response.data.results || [] };
        }
        return { success: false, error: response.error || 'Search failed' };
    }
}
// ============ Response Transformers ============
/**
 * Transform snake_case API response to camelCase
 */
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
function transformKeys(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => transformKeys(item));
    }
    if (typeof obj === 'object') {
        const transformed = {};
        for (const [key, value] of Object.entries(obj)) {
            const camelKey = snakeToCamel(key);
            transformed[camelKey] = transformKeys(value);
        }
        return transformed;
    }
    return obj;
}
/**
 * Transform API project response to typed Project
 */
export function transformProject(raw) {
    const p = transformKeys(raw);
    return {
        id: p.id,
        name: p.name,
        description: p.description,
        techStack: p.techStack,
        isActive: Boolean(p.isActive),
        createdAt: p.createdAt,
    };
}
/**
 * Transform API flow response to typed Flow
 */
export function transformFlow(raw) {
    const w = transformKeys(raw);
    return {
        id: w.id,
        projectId: w.projectId,
        ticketKey: w.ticketKey,
        summary: w.ticketSummary,
        description: w.ticketDescription,
        descriptionJson: w.ticketDescriptionJson,
        acceptanceCriteria: w.acceptanceCriteria,
        currentState: w.currentState,
        agentStatus: w.agentStatus,
        agentMessage: w.agentMessage,
        implementationPlan: w.implementationPlan,
        planFeedback: w.planFeedback,
        codeFeedback: w.codeFeedback,
        agentSummary: w.agentSummary,
        testingInstructions: w.testingInstructions,
        planUpdatedAt: w.planUpdatedAt,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
        displayId: w.displayId,
        testingNotes: w.testingNotes,
        approvedBy: w.approvedBy,
        approvedAt: w.approvedAt,
        approvedComment: w.approvedComment,
        planCreatedBy: w.planCreatedBy,
        planCreatedAt: w.planCreatedAt,
        planApprovedBy: w.planApprovedBy,
        planApprovedAt: w.planApprovedAt,
        codeApprovedBy: w.codeApprovedBy,
        codeApprovedAt: w.codeApprovedAt,
        // Assignment
        assigneeName: w.assigneeName,
        // Git workflow fields
        branchName: w.branchName,
        branchCreated: Boolean(w.branchCreated),
        prUrl: w.prUrl,
        prNumber: w.prNumber,
        prState: w.prState,
        commits: w.commits,
    };
}
/**
 * Transform API task response to typed Task
 */
export function transformTask(raw) {
    const t = transformKeys(raw);
    return {
        id: t.id,
        flowId: t.flowId,
        parentId: t.parentId,
        summary: (t.text || t.summary), // API returns 'text', we use 'summary'
        description: t.description,
        acceptanceCriteria: t.acceptanceCriteria,
        isCompleted: Boolean(t.checked),
        sortOrder: (t.orderIndex ?? 0),
        createdAt: t.createdAt,
        status: t.status,
    };
}
// Export singleton instance
export const devFlowClient = new DevFlowClient();
