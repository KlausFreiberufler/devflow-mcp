/**
 * DevFlow API Client
 * Handles authentication and API communication with the DevFlow backend
 * Uses 'flow' terminology (backend endpoints: /api/flows)
 */
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    gate?: {
        pipelineStep: string;
        executor: string;
        reason?: string;
    };
    statusCode?: number;
}
export declare class DevFlowClient {
    private baseUrl;
    private credentials;
    private credentialsPath;
    private projectConfig;
    private workingDir;
    private agentSessionId;
    private scopedProjectId;
    private heartbeatInterval;
    constructor(baseUrl?: string, workingDir?: string);
    /**
     * Initialize the client - load credentials, project config, or authenticate via browser
     */
    init(): Promise<void>;
    /**
     * Check if client is authenticated
     */
    isAuthenticated(): boolean;
    /**
     * Get linked project ID (if any)
     */
    getLinkedProjectId(): string | null;
    /**
     * Get linked project name (if any)
     */
    getLinkedProjectName(): string | null;
    /**
     * Check if a project is linked
     */
    hasLinkedProject(): boolean;
    /**
     * Get authentication instructions for the user
     */
    getAuthInstructions(): string;
    /**
     * Set credentials directly (from environment variable)
     */
    setToken(token: string): void;
    /**
     * Save credentials to file
     */
    private saveCredentials;
    /**
     * Refresh access token using refresh token
     */
    private refreshTokens;
    /**
     * Parse response and handle non-JSON responses gracefully
     */
    private parseResponse;
    /**
     * Make authenticated API request
     */
    private request;
    listProjects(): Promise<ApiResponse<Project[]>>;
    getProject(projectId: string): Promise<ApiResponse<Project>>;
    /**
     * Get the current linked project (convenience method)
     */
    getCurrentProject(): Promise<ApiResponse<Project>>;
    createProject(data: {
        name: string;
        repoUrl?: string;
    }): Promise<ApiResponse<Project>>;
    updateProject(projectId: string, data: Record<string, unknown>): Promise<ApiResponse<Project>>;
    /**
     * List flows - requires a linked project
     */
    listFlows(projectId?: string): Promise<ApiResponse<Flow[]>>;
    createFlow(flow: FlowCreate): Promise<ApiResponse<Flow>>;
    getFlow(flowId: string): Promise<ApiResponse<Flow>>;
    updateFlow(flowId: string, update: FlowUpdate): Promise<ApiResponse<Flow>>;
    getFlowFeedback(flowId: string): Promise<ApiResponse<FlowFeedback>>;
    getAttachments(flowId: string): Promise<ApiResponse<FlowAttachment[]>>;
    uploadAttachment(flowId: string, filename: string, content: string, mimeType?: string, kind?: 'plan' | 'summary' | 'design' | 'decision' | 'notes'): Promise<ApiResponse<FlowAttachment>>;
    /**
     * DF-208: Fetch raw attachment content from the auth-protected endpoint.
     * Returns either text (for text-like MIME types) or base64 (for binary).
     */
    getAttachmentContent(flowId: string, attachmentId: string): Promise<{
        success: true;
        mimeType: string;
        text?: string;
        base64?: string;
    } | {
        success: false;
        error: string;
    }>;
    /**
     * DF-208: Fetch arbitrary URL (e.g. TipTap-embedded image) and return base64 + mimeType.
     * Uses Bearer auth if URL is on the DevFlow base URL.
     */
    fetchBinaryAsBase64(url: string): Promise<{
        success: true;
        mimeType: string;
        base64: string;
    } | {
        success: false;
        error: string;
    }>;
    listTasks(flowId: string): Promise<ApiResponse<Task[]>>;
    createTask(task: TaskCreate): Promise<ApiResponse<Task>>;
    updateTask(taskId: string, update: TaskUpdate): Promise<ApiResponse<Task>>;
    listAgentSessions(flowId?: string): Promise<ApiResponse<AgentSession[]>>;
    createAgentSession(data: {
        flowId: string;
        type?: string;
    }): Promise<ApiResponse<AgentSession>>;
    logAgentSession(sessionId: string, data: {
        message: string;
        level?: string;
    }): Promise<ApiResponse<unknown>>;
    completeAgentSession(sessionId: string, data?: {
        summary?: string;
    }): Promise<ApiResponse<unknown>>;
    getProjectDocs(projectId: string): Promise<ApiResponse<unknown>>;
    getDocPage(projectId: string, docId: string): Promise<ApiResponse<unknown>>;
    createDocPage(projectId: string, data: {
        title: string;
        section: string;
        content: string;
    }): Promise<ApiResponse<unknown>>;
    updateDocPage(projectId: string, docId: string, data: Record<string, unknown>): Promise<ApiResponse<unknown>>;
    deleteDocPage(projectId: string, docId: string): Promise<ApiResponse<unknown>>;
    searchWiki(projectId: string, q: string, limit?: number): Promise<ApiResponse<unknown[]>>;
    getBacklinks(assetType: string, assetId: string): Promise<ApiResponse<unknown[]>>;
    getOutgoing(assetType: string, assetId: string): Promise<ApiResponse<unknown[]>>;
    fetchGraph(projectId: string, types?: string[], tags?: string[]): Promise<ApiResponse<unknown>>;
    resolveWikiLink(projectId: string, raw: string): Promise<ApiResponse<unknown>>;
    fetchAdrs(projectId: string, status?: string): Promise<ApiResponse<unknown[]>>;
    fetchAdr(projectId: string, number: number | string): Promise<ApiResponse<unknown>>;
    acceptAdrFromAttachment(projectId: string, attachmentId: string, opts?: {
        supersedesId?: string;
        status?: string;
    }): Promise<ApiResponse<unknown>>;
    updateAdrStatus(adrId: string, status: string): Promise<ApiResponse<unknown>>;
    fetchAdrAuditLog(adrId: string): Promise<ApiResponse<unknown[]>>;
    prepareKnowledgeBackfill(projectId: string, limit?: number): Promise<ApiResponse<unknown>>;
    createKnowledgeDraft(data: {
        projectId: string;
        draftType: 'adr' | 'pattern' | 'runbook' | 'lessons_learned';
        title: string;
        body?: string;
        rationale?: string;
        sourceFlowIds?: string[];
        frontmatter?: Record<string, unknown>;
    }): Promise<ApiResponse<unknown>>;
    listKnowledgeDrafts(projectId: string, status?: string): Promise<ApiResponse<unknown[]>>;
    acceptKnowledgeDraft(id: string): Promise<ApiResponse<unknown>>;
    rejectKnowledgeDraft(id: string, notes?: string): Promise<ApiResponse<unknown>>;
    prepareKnowledgeHarvest(flowId: string): Promise<ApiResponse<unknown>>;
    prepareKnowledgeCheck(flowId: string): Promise<ApiResponse<unknown>>;
    fetchPlanningContext(flowId: string): Promise<ApiResponse<unknown>>;
    /** DF-310 — per-flow Wiki briefing (drives the WikiBriefingPanel UI) */
    fetchWikiContext(flowId: string): Promise<ApiResponse<unknown>>;
    /** DF-312 — global hierarchical TOC, grouped by lifecycle_stage */
    fetchWikiIndex(projectId: string): Promise<ApiResponse<unknown>>;
    /** DF-312 — chronological mutation feed (create/extend/supersede/deprecate) */
    fetchWikiLog(projectId: string, days?: number): Promise<ApiResponse<unknown>>;
    /** DF-312 — health-report (stale / orphan / contradiction) */
    fetchWikiLint(projectId: string, staleDays?: number): Promise<ApiResponse<unknown>>;
    /** DF-315 — Idea-Backlog (5 sources aggregated for Pick&Plan) */
    fetchIdeasBacklog(projectId: string): Promise<ApiResponse<unknown>>;
    /** DF-316 — Error-Driven Wiki Lookup */
    fetchErrorContext(projectId: string, payload: {
        errorMessage?: string;
        stackTrace?: string;
        filePath?: string;
        recentCommits?: string[];
    }): Promise<ApiResponse<unknown>>;
    flowSealBackfill(projectId: string): Promise<ApiResponse<unknown>>;
    updateAdrAffectsPaths(adrId: string, paths: string[]): Promise<ApiResponse<unknown>>;
    fetchPendingWork(projectId: string, opts?: {
        tags?: string[];
        paths?: string[];
        excludeFlowId?: string;
    }): Promise<ApiResponse<unknown>>;
    resolveIntent(flowId: string, pageId: string, note?: string): Promise<ApiResponse<unknown>>;
    suggestAutoTags(projectId: string, content: string, opts?: {
        existingTags?: string[];
        limit?: number;
    }): Promise<ApiResponse<unknown>>;
    createKnowledgeResolution(flowId: string, payload: {
        topic: string;
        resolutionType: 'adr' | 'pattern' | 'runbook' | 'intent_defer' | 'dismiss' | 'extend';
        entityType?: string;
        entityId?: string;
        reason?: string;
        horizon?: string;
        body?: string;
        rationale?: string;
    }): Promise<ApiResponse<unknown>>;
    emitDisciplineToken(flowId: string, payload: {
        skillName: string;
        evidence?: unknown;
    }): Promise<ApiResponse<{
        id: string;
        skillName: string;
        token: string;
        createdAt: string;
        expiresAt: string;
    }>>;
    listActiveDisciplineTokens(flowId: string): Promise<ApiResponse<unknown[]>>;
    getProjectGuidelines(projectId?: string): Promise<ApiResponse<ProjectGuidelines>>;
    updateProjectGuidelines(guidelines: string, projectId?: string): Promise<ApiResponse<ProjectGuidelines>>;
    listReleases(projectId?: string): Promise<ApiResponse<Release[]>>;
    getRelease(releaseId: string): Promise<ApiResponse<Release>>;
    createRelease(data: {
        projectId?: string;
        name: string;
        description?: string;
        targetDate?: string;
    }): Promise<ApiResponse<Release>>;
    updateRelease(releaseId: string, data: Record<string, unknown>): Promise<ApiResponse<Release>>;
    activateRelease(releaseId: string): Promise<ApiResponse<Release>>;
    deactivateRelease(releaseId: string): Promise<ApiResponse<Release>>;
    updateReleaseBranch(releaseId: string, data: Record<string, unknown>): Promise<ApiResponse<Release>>;
    getGitSettings(projectId?: string): Promise<ApiResponse<GitSettings | null>>;
    sendHeartbeat(): Promise<void>;
    startHeartbeat(): void;
    stopHeartbeat(): void;
    /**
     * Get the base URL for direct API calls
     */
    getBaseUrl(): string;
    setAgentSessionId(sessionId: string | null): void;
    getAgentSessionId(): string | null;
    /**
     * Get the current access token (or null if not authenticated)
     */
    getAccessToken(): string | null;
    getProjectConfig(projectId?: string): Promise<ApiResponse<Record<string, unknown>>>;
    /**
     * Check if heartbeat is currently running
     */
    hasActiveHeartbeat(): boolean;
    /**
     * Reconnect: refresh token (or re-authenticate), restart heartbeat
     */
    reconnect(): Promise<void>;
    /**
     * Reload project config from .devflow.json in working directory
     */
    reloadProjectConfig(): Promise<void>;
    /**
     * Clear project config (for unlink)
     */
    clearProjectConfig(): void;
    /**
     * Check if the current user has a free agent slot.
     * Returns slot status: { active: boolean, flow?: { id, summary, agentStatus, since } }
     * 404 means the backend doesn't support slots yet → treat as free.
     */
    getAgentSlotStatus(): Promise<ApiResponse<AgentSlotStatus>>;
    initSession(flowId: string): Promise<ApiResponse<{
        session: {
            id: string;
            flowId: string;
            status: string;
            agentType: string;
            createdAt: string;
            updatedAt: string;
            lastActivityAt: string;
        };
        flow: {
            id: string;
            displayId: string;
            summary: string;
            description: string;
            currentState: string;
            projectId: string;
        };
        tasks: Array<{
            id: string;
            summary: string;
            isCompleted: boolean;
            status: string;
        }>;
        allowedActions: string[];
        nextStep: string;
        warning?: string;
    }>>;
    touchSessionActivity(sessionId: string): Promise<ApiResponse<unknown>>;
    /**
     * Get the next pipeline step for a flow.
     * Returns allowedActions, pipelineStep, kind, transitionPolicy, etc.
     */
    getNextStep(flowId: string): Promise<ApiResponse<Record<string, unknown>>>;
    discoverProject(repoUrl: string): Promise<{
        found: boolean;
        project?: {
            id: string;
            name: string;
            repoUrl: string;
        };
    }>;
    search(query: string, type?: string): Promise<ApiResponse<SearchResult[]>>;
}
export interface Project {
    id: string;
    name: string;
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
    descriptionJson?: string;
    acceptanceCriteria?: string[];
    currentState: 'idea' | 'planning' | 'approval' | 'ready' | 'in_progress' | 'review' | 'done';
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
    planCreatedBy?: string;
    planCreatedAt?: string;
    planApprovedBy?: string;
    planApprovedAt?: string;
    codeApprovedBy?: string;
    codeApprovedAt?: string;
    assigneeName?: string;
    branchName?: string;
    branchCreated?: boolean;
    prUrl?: string;
    prNumber?: number;
    prState?: string;
    commits?: {
        hash: string;
        message: string;
    }[] | null;
}
export interface FlowCreate {
    projectId: string;
    summary: string;
    description?: string;
    flowType?: string;
    acceptanceCriteria?: string[];
}
export interface FlowUpdate {
    currentState?: 'idea' | 'planning' | 'approval' | 'ready' | 'in_progress' | 'review' | 'done';
    agentStatus?: string;
    agentMessage?: string;
    acceptanceCriteria?: string[];
    implementationPlan?: string;
    agentSummary?: string;
    testingInstructions?: string;
    commits?: {
        hash: string;
        message: string;
    }[];
    prUrl?: string;
    prNumber?: number;
    prState?: string;
}
export interface FlowAttachment {
    id: string;
    flowId: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    url: string;
    createdAt: string;
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
    isActive?: boolean;
    branchName?: string;
    branchCreated?: boolean;
    prUrl?: string;
    prNumber?: number;
    prState?: string;
    isLocked?: boolean;
    releaseFeedback?: string;
    releasedAt?: string;
    createdAt: string;
}
export interface GitSettings {
    id: string;
    projectId: string;
    enabled: boolean;
    defaultBranch: string;
    branchPrefixFeature: string;
    branchPrefixHotfix: string;
    branchPrefixRelease: string;
    autoPrOnCodeReview: boolean;
    autoAssignToActiveRelease: boolean;
    flowBranchPrompt?: string;
    releaseBranchPrompt?: string;
    commitMessagePrompt?: string;
    prTemplatePrompt?: string;
    autoPrOnFlowDone?: boolean;
    autoPrOnRelease?: boolean;
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
/**
 * Transform API project response to typed Project
 */
export declare function transformProject(raw: unknown): Project;
/**
 * Transform API flow response to typed Flow
 */
export declare function transformFlow(raw: unknown): Flow;
/**
 * Transform API task response to typed Task
 */
export declare function transformTask(raw: unknown): Task;
export declare const devFlowClient: DevFlowClient;
export {};
