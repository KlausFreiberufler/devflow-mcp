/**
 * DevFlow API Client
 * Handles authentication and API communication with the DevFlow backend
 * Uses 'flow' terminology (backend endpoints: /api/flows)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { getToken, authenticateViaBrowser, loadProjectConfig } from '../auth/browser-auth.js';

interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ProjectConfig {
  projectId: string;
  projectName: string;
  linkedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class DevFlowClient {
  private baseUrl: string;
  private credentials: Credentials | null = null;
  private credentialsPath: string;
  private projectConfig: ProjectConfig | null = null;
  private workingDir: string;
  private scopedProjectId: string | null = null;

  constructor(baseUrl?: string, workingDir?: string) {
    this.baseUrl = baseUrl || process.env.DEVFLOW_URL || 'https://api.flow.dev';
    this.credentialsPath = join(homedir(), '.devflow', 'credentials.json');
    this.workingDir = workingDir || process.cwd();
    // Project scoping via environment variable
    this.scopedProjectId = process.env.DEVFLOW_PROJECT_ID || null;
  }

  /**
   * Initialize the client - load credentials, project config, or authenticate via browser
   */
  async init(): Promise<void> {
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
    } catch {
      // No credentials file
      this.credentials = null;
    }

    // If no valid credentials, authenticate via browser
    if (!this.credentials) {
      try {
        const token = await getToken(this.baseUrl, this.workingDir);
        this.setToken(token);
        // Reload project config after auth (in case user just linked a project)
        this.projectConfig = await loadProjectConfig(this.workingDir);
      } catch (error) {
        console.error('Authentication failed:', error);
        // Will show error when tools are called
      }
    }

    // If authenticated but no project linked, re-authenticate to select a project
    if (this.credentials && !this.getLinkedProjectId()) {
      console.error('No project linked. Opening browser for project selection...');
      try {
        const token = await authenticateViaBrowser(this.baseUrl, this.workingDir);
        this.setToken(token);
        this.projectConfig = await loadProjectConfig(this.workingDir);
      } catch (error) {
        console.error('Project linking failed:', error);
      }
    }
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.credentials !== null && this.credentials.expiresAt > Date.now();
  }

  /**
   * Get linked project ID (if any)
   */
  getLinkedProjectId(): string | null {
    return this.scopedProjectId || this.projectConfig?.projectId || null;
  }

  /**
   * Get linked project name (if any)
   */
  getLinkedProjectName(): string | null {
    return this.projectConfig?.projectName || null;
  }

  /**
   * Check if a project is linked
   */
  hasLinkedProject(): boolean {
    return this.projectConfig !== null;
  }

  /**
   * Get authentication instructions for the user
   */
  getAuthInstructions(): string {
    return `
Authentication required. The browser should open automatically.
If it doesn't, please:

1. Open DevFlow: ${this.baseUrl.replace(':6011', ':6010')}
2. Log in with your credentials
3. The connection will be established automatically

Or set: export DEVFLOW_TOKEN="your-token"
`;
  }

  /**
   * Set credentials directly (from environment variable)
   */
  setToken(token: string): void {
    this.credentials = {
      accessToken: token,
      refreshToken: '',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  /**
   * Save credentials to file
   */
  private async saveCredentials(): Promise<void> {
    if (!this.credentials) return;

    const dir = join(homedir(), '.devflow');
    await mkdir(dir, { recursive: true });
    await writeFile(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshTokens(): Promise<void> {
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

    const data = await response.json() as ApiResponse<{ accessToken: string; refreshToken: string }>;
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
  private async parseResponse<T>(response: Response, path: string): Promise<ApiResponse<T>> {
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
        const errorData = await response.json() as { error?: string; message?: string };
        return {
          success: false,
          error: errorData.error || errorData.message || `HTTP ${response.status}`
        };
      } catch {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
    }

    return await response.json() as ApiResponse<T>;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.credentials.accessToken}`
    };

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, options);

        // Handle 401 - try to refresh token
        if (response.status === 401 && this.credentials.refreshToken) {
          await this.refreshTokens();
          headers['Authorization'] = `Bearer ${this.credentials.accessToken}`;
          const retryResponse = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
          return await this.parseResponse<T>(retryResponse, path);
        }

        // Retry on 5xx server errors
        if (response.status >= 500 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        return await this.parseResponse<T>(response, path);
      } catch (error) {
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

  async listProjects(): Promise<ApiResponse<Project[]>> {
    const result = await this.request<unknown[]>('GET', '/api/projects');
    if (result.success && result.data) {
      return { success: true, data: result.data.map(transformProject) };
    }
    return result as ApiResponse<Project[]>;
  }

  async getProject(projectId: string): Promise<ApiResponse<Project>> {
    const result = await this.request<unknown>('GET', `/api/projects/${projectId}`);
    if (result.success && result.data) {
      return { success: true, data: transformProject(result.data) };
    }
    return result as ApiResponse<Project>;
  }

  /**
   * Get the current linked project (convenience method)
   */
  async getCurrentProject(): Promise<ApiResponse<Project>> {
    const projectId = this.getLinkedProjectId();
    if (!projectId) {
      return {
        success: false,
        error: 'No project linked. Run flow_list to see all flows, or re-authenticate to link a project.'
      };
    }
    return this.getProject(projectId);
  }

  // ============ Flow Methods ============

  /**
   * List flows - requires a linked project
   */
  async listFlows(projectId?: string): Promise<ApiResponse<Flow[]>> {
    const effectiveProjectId = projectId || this.getLinkedProjectId();
    if (!effectiveProjectId) {
      return { success: false, error: 'No project linked. Create a .devflow.json or re-authenticate to link a project.' };
    }

    const path = `/api/flows?projectId=${effectiveProjectId}`;
    const result = await this.request<unknown[]>('GET', path);
    if (result.success && result.data) {
      return { success: true, data: result.data.map(transformFlow) };
    }
    return result as ApiResponse<Flow[]>;
  }

  async createFlow(flow: FlowCreate): Promise<ApiResponse<Flow>> {
    // Map to backend field names
    const apiFlow: Record<string, unknown> = {
      projectId: flow.projectId,
      ticketSummary: flow.summary,
      ticketDescription: flow.description,
      flowType: flow.flowType || 'feature',
    };
    if (flow.acceptanceCriteria) {
      apiFlow.acceptanceCriteria = JSON.stringify(flow.acceptanceCriteria);
    }

    const result = await this.request<unknown>('POST', '/api/flows', apiFlow);
    if (result.success && result.data) {
      return { success: true, data: transformFlow(result.data) };
    }
    return result as ApiResponse<Flow>;
  }

  async getFlow(flowId: string): Promise<ApiResponse<Flow>> {
    const result = await this.request<unknown>('GET', `/api/flows/${flowId}`);
    if (result.success && result.data) {
      return { success: true, data: transformFlow(result.data) };
    }
    return result as ApiResponse<Flow>;
  }

  async updateFlow(
    flowId: string,
    update: FlowUpdate
  ): Promise<ApiResponse<Flow>> {
    const result = await this.request<unknown>('PATCH', `/api/flows/${flowId}`, update);
    if (result.success && result.data) {
      return { success: true, data: transformFlow(result.data) };
    }
    return result as ApiResponse<Flow>;
  }

  async getFlowFeedback(flowId: string): Promise<ApiResponse<FlowFeedback>> {
    return this.request<FlowFeedback>('GET', `/api/flows/${flowId}/feedback`);
  }

  // ============ Task/Todo Methods ============

  async listTasks(flowId: string): Promise<ApiResponse<Task[]>> {
    const result = await this.request<unknown[]>('GET', `/api/flows/${flowId}/todos`);
    if (result.success && result.data) {
      return { success: true, data: result.data.map(transformTask) };
    }
    return result as ApiResponse<Task[]>;
  }

  async createTask(task: TaskCreate): Promise<ApiResponse<Task>> {
    // API expects 'text' instead of 'summary'
    const apiTask = {
      flowId: task.flowId,
      parentId: task.parentId,
      text: task.summary,  // Map summary -> text
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria
    };
    const result = await this.request<unknown>('POST', '/api/todos', apiTask);
    if (result.success && result.data) {
      return { success: true, data: transformTask(result.data) };
    }
    return result as ApiResponse<Task>;
  }

  async updateTask(taskId: string, update: TaskUpdate): Promise<ApiResponse<Task>> {
    // Map MCP field names to backend field names
    const apiUpdate: Record<string, unknown> = {};
    if (update.isCompleted !== undefined) apiUpdate.checked = update.isCompleted;
    if (update.summary !== undefined) apiUpdate.text = update.summary;
    if (update.description !== undefined) apiUpdate.description = update.description;
    if (update.status !== undefined) apiUpdate.status = update.status;
    if (update.acceptanceCriteria !== undefined) apiUpdate.acceptanceCriteria = update.acceptanceCriteria;

    const result = await this.request<unknown>('PATCH', `/api/todos/${taskId}`, apiUpdate);
    if (result.success && result.data) {
      return { success: true, data: transformTask(result.data) };
    }
    return result as ApiResponse<Task>;
  }

  // ============ Agent Session Methods ============

  async listAgentSessions(flowId?: string): Promise<ApiResponse<AgentSession[]>> {
    const path = flowId
      ? `/api/agent-sessions/flow/${flowId}`
      : '/api/agent-sessions';
    return this.request<AgentSession[]>('GET', path);
  }

  async createAgentSession(data: { flowId: string; type?: string }): Promise<ApiResponse<AgentSession>> {
    return this.request<AgentSession>('POST', '/api/agent-sessions', data);
  }

  async logAgentSession(sessionId: string, data: { message: string; level?: string }): Promise<ApiResponse<unknown>> {
    return this.request<unknown>('POST', `/api/agent-sessions/${sessionId}/log`, data);
  }

  async completeAgentSession(sessionId: string, data?: { summary?: string }): Promise<ApiResponse<unknown>> {
    return this.request<unknown>('POST', `/api/agent-sessions/${sessionId}/complete`, data || {});
  }

  // ============ Knowledge Methods ============

  async getProjectKnowledge(projectId?: string): Promise<ApiResponse<ProjectKnowledge>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
    }
    return this.request<ProjectKnowledge>('GET', `/api/projects/${id}/knowledge`);
  }

  async updateProjectKnowledge(knowledge: string, projectId?: string): Promise<ApiResponse<ProjectKnowledge>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
    }
    return this.request<ProjectKnowledge>('PATCH', `/api/projects/${id}/knowledge`, { knowledge });
  }

  // ============ Guidelines Methods ============

  async getProjectGuidelines(projectId?: string): Promise<ApiResponse<ProjectGuidelines>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
    }
    return this.request<ProjectGuidelines>('GET', `/api/projects/${id}/guidelines`);
  }

  async updateProjectGuidelines(guidelines: string, projectId?: string): Promise<ApiResponse<ProjectGuidelines>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
    }
    return this.request<ProjectGuidelines>('PATCH', `/api/projects/${id}/guidelines`, { guidelines });
  }

  // ============ Release Methods ============

  async listReleases(projectId?: string): Promise<ApiResponse<Release[]>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project linked. Create a .devflow.json or re-authenticate to link a project.' };
    }
    return this.request<Release[]>('GET', `/api/releases?projectId=${id}`);
  }

  async getRelease(releaseId: string): Promise<ApiResponse<Release>> {
    return this.request<Release>('GET', `/api/releases/${releaseId}`);
  }

  async createRelease(data: { projectId?: string; name: string; description?: string; targetDate?: string }): Promise<ApiResponse<Release>> {
    const body = {
      ...data,
      projectId: data.projectId || this.getLinkedProjectId(),
    };
    if (!body.projectId) {
      return { success: false, error: 'No project ID. Use project_list or set DEVFLOW_PROJECT_ID.' };
    }
    return this.request<Release>('POST', '/api/releases', body);
  }

  async updateRelease(releaseId: string, data: Record<string, unknown>): Promise<ApiResponse<Release>> {
    return this.request<Release>('PATCH', `/api/releases/${releaseId}`, data);
  }

  // ============ Config Methods ============

  /**
   * Get the base URL for direct API calls
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the current access token (or null if not authenticated)
   */
  getAccessToken(): string | null {
    return this.credentials?.accessToken ?? null;
  }

  async getProjectConfig(projectId?: string): Promise<ApiResponse<Record<string, unknown>>> {
    const id = projectId || this.getLinkedProjectId();
    if (!id) {
      return { success: false, error: 'No project ID for config sync.' };
    }
    return this.request<Record<string, unknown>>('GET', `/api/projects/${id}/config`);
  }

  // ============ Agent Slot Methods ============

  /**
   * Check if the current user has a free agent slot.
   * Returns slot status: { active: boolean, flow?: { id, summary, agentStatus, since } }
   * 404 means the backend doesn't support slots yet → treat as free.
   */
  async getAgentSlotStatus(): Promise<ApiResponse<AgentSlotStatus>> {
    const result = await this.request<AgentSlotStatus>('GET', '/api/agent-slots/status');
    // If endpoint doesn't exist, treat slot as free
    if (!result.success && result.error?.includes('404')) {
      return { success: true, data: { active: false } };
    }
    return result;
  }

  // ============ Agent Lease Methods ============

  async acquireLease(projectId: string, flowId?: string): Promise<ApiResponse<LeaseAcquireResponse>> {
    return this.request<LeaseAcquireResponse>('POST', '/api/agent-leases/acquire', {
      projectId,
      flowId,
    });
  }

  async renewLease(leaseId: string, leaseToken: string): Promise<ApiResponse<{ expiresAt: string }>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.credentials?.accessToken}`,
      'X-Lease-Token': leaseToken,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/agent-leases/${leaseId}/renew`, {
        method: 'PATCH',
        headers,
      });
      return await this.parseResponse<{ expiresAt: string }>(response, `/api/agent-leases/${leaseId}/renew`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Lease renewal failed: ${msg}` };
    }
  }

  async releaseLease(leaseId: string, leaseToken: string): Promise<ApiResponse<{ released: boolean }>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.credentials?.accessToken}`,
      'X-Lease-Token': leaseToken,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/agent-leases/${leaseId}/release`, {
        method: 'POST',
        headers,
      });
      return await this.parseResponse<{ released: boolean }>(response, `/api/agent-leases/${leaseId}/release`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: `Lease release failed: ${msg}` };
    }
  }

  // ============ Search Methods ============

  async search(query: string, type?: string): Promise<ApiResponse<SearchResult[]>> {
    const params = new URLSearchParams({ q: query });
    if (type && type !== 'all') params.set('type', type);
    const response = await this.request<{ results: SearchResult[] }>('GET', `/api/search?${params.toString()}`);
    // Backend wraps results in { results: [...] }, unwrap for consumers
    if (response.success && response.data) {
      return { success: true, data: response.data.results || [] };
    }
    return { success: false, error: response.error || 'Search failed' };
  }
}

// ============ Type Definitions ============

export interface Project {
  id: string;
  name: string;
  jiraKey?: string;
  description?: string;
  techStack?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Flow {
  id: string;
  projectId: string;
  ticketKey?: string;
  summary: string;
  description?: string;
  acceptanceCriteria?: string[];
  currentState: 'idea' | 'planning' | 'plan_review' | 'progress' | 'code_review' | 'testing' | 'done';
  agentStatus?: string;
  agentMessage?: string;
  implementationPlan?: string;
  planFeedback?: string;
  codeFeedback?: string;
  agentSummary?: string;
  testingInstructions?: string;
  planUpdatedAt?: string;
  createdAt: string;
  completedAt?: string;
  displayId?: string;
  testingNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvedComment?: string;
  // Audit fields
  planCreatedBy?: string;
  planCreatedAt?: string;
  planApprovedBy?: string;
  planApprovedAt?: string;
  codeApprovedBy?: string;
  codeApprovedAt?: string;
}

export interface FlowCreate {
  projectId: string;
  summary: string;
  description?: string;
  flowType?: string;
  acceptanceCriteria?: string[];
}

export interface FlowUpdate {
  currentState?: 'idea' | 'planning' | 'plan_review' | 'progress' | 'code_review' | 'testing' | 'done';
  agentStatus?: string;
  agentMessage?: string;
  acceptanceCriteria?: string[];
  implementationPlan?: string;
  agentSummary?: string;
  testingInstructions?: string;
  commits?: { hash: string; message: string }[];
}

export interface FlowFeedback {
  planFeedback: string | null;
  codeFeedback: string | null;
  feedbackAt: string | null;
}

export interface Task {
  id: string;
  flowId: string;
  parentId?: string;
  summary: string;
  description?: string;
  acceptanceCriteria?: string[];
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
  status?: 'todo' | 'doing' | 'done';
}

export interface TaskCreate {
  flowId: string;
  parentId?: string;
  summary: string;
  description?: string;
  acceptanceCriteria?: string[];
}

export interface TaskUpdate {
  summary?: string;
  description?: string;
  isCompleted?: boolean;
  acceptanceCriteria?: string[];
  status?: 'todo' | 'doing' | 'done';
}

// ============ New Feature Types ============

export interface AgentSession {
  id: string;
  flowId: string;
  type?: string;
  status?: string;
  summary?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ProjectKnowledge {
  knowledge: string;
  updatedAt?: string;
}

export interface ProjectGuidelines {
  guidelines: string;
  updatedAt?: string;
}

export interface Release {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status?: string;
  targetDate?: string;
  createdAt: string;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  description?: string;
  state?: string;
}

export interface AgentSlotStatus {
  active: boolean;
  flow?: {
    id: string;
    summary: string;
    agentStatus: string;
    since: string;
  };
}

export interface LeaseAcquireResponse {
  leaseId: string;
  leaseToken: string;
  expiresAt: string;
}

// ============ Response Transformers ============

/**
 * Transform snake_case API response to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item)) as T;
  }

  if (typeof obj === 'object') {
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = transformKeys(value);
    }
    return transformed as T;
  }

  return obj as T;
}

/**
 * Transform API project response to typed Project
 */
export function transformProject(raw: unknown): Project {
  const p = transformKeys<Record<string, unknown>>(raw);
  return {
    id: p.id as string,
    name: p.name as string,
    jiraKey: p.jiraProjectKey as string | undefined,
    description: p.description as string | undefined,
    techStack: p.techStack as string | undefined,
    isActive: Boolean(p.isActive),
    createdAt: p.createdAt as string,
  };
}

/**
 * Transform API flow response to typed Flow
 */
export function transformFlow(raw: unknown): Flow {
  const w = transformKeys<Record<string, unknown>>(raw);
  return {
    id: w.id as string,
    projectId: w.projectId as string,
    ticketKey: w.ticketKey as string | undefined,
    summary: w.ticketSummary as string,
    description: w.ticketDescription as string | undefined,
    acceptanceCriteria: w.acceptanceCriteria as string[] | undefined,
    currentState: w.currentState as Flow['currentState'],
    agentStatus: w.agentStatus as string | undefined,
    agentMessage: w.agentMessage as string | undefined,
    implementationPlan: w.implementationPlan as string | undefined,
    planFeedback: w.planFeedback as string | undefined,
    codeFeedback: w.codeFeedback as string | undefined,
    agentSummary: w.agentSummary as string | undefined,
    testingInstructions: w.testingInstructions as string | undefined,
    planUpdatedAt: w.planUpdatedAt as string | undefined,
    createdAt: w.createdAt as string,
    completedAt: w.completedAt as string | undefined,
    displayId: w.displayId as string | undefined,
    testingNotes: w.testingNotes as string | undefined,
    approvedBy: w.approvedBy as string | undefined,
    approvedAt: w.approvedAt as string | undefined,
    approvedComment: w.approvedComment as string | undefined,
    planCreatedBy: w.planCreatedBy as string | undefined,
    planCreatedAt: w.planCreatedAt as string | undefined,
    planApprovedBy: w.planApprovedBy as string | undefined,
    planApprovedAt: w.planApprovedAt as string | undefined,
    codeApprovedBy: w.codeApprovedBy as string | undefined,
    codeApprovedAt: w.codeApprovedAt as string | undefined,
  };
}

/**
 * Transform API task response to typed Task
 */
export function transformTask(raw: unknown): Task {
  const t = transformKeys<Record<string, unknown>>(raw);
  return {
    id: t.id as string,
    flowId: t.flowId as string,
    parentId: t.parentId as string | undefined,
    summary: (t.text || t.summary) as string,  // API returns 'text', we use 'summary'
    description: t.description as string | undefined,
    acceptanceCriteria: t.acceptanceCriteria as string[] | undefined,
    isCompleted: Boolean(t.isCompleted),
    sortOrder: t.sortOrder as number,
    createdAt: t.createdAt as string,
    status: t.status as 'todo' | 'doing' | 'done' | undefined,
  };
}

// Export singleton instance
export const devFlowClient = new DevFlowClient();
