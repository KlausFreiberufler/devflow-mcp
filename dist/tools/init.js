/**
 * devflow_init - Init-Gate Tool
 *
 * Must be called before any other tools (except discovery tools).
 * Validates flow, creates session via backend init endpoint, sets context.
 */
import { devFlowClient } from '../api/client.js';
import { sessionContext } from '../context/session.js';
import { NEXT_STEP_GUIDANCE } from '../context/permissions.js';
import { getConfig } from '../config/sync.js';
import { formatStrictnessLevel } from '../config/types.js';
import { checkForUpdate } from '../config/version-check.js';
import { withErrorHandling } from '../utils/errors.js';
import { extractImagesFromTipTap } from '../utils/tiptap.js';
import { formatAttachmentList } from '../utils/attachments.js';
import { resolveFlowId } from '../utils/resolve-flow-id.js';
import { saveProjectConfig } from '../auth/browser-auth.js';
import { detectGitRemoteUrl } from '../utils/git.js';
import { getWorkingDir } from '../utils/working-dir.js';
const devflowInitDef = {
    name: 'devflow_init',
    description: `Initialize a DevFlow work session for a flow.

MUST be called before any other tools (except flow_list and flow_create).
Without devflow_init, all tools are blocked.

What it does:
- Validates and loads the flow
- Locks the flow for this agent (exclusive)
- Creates an agent session for tracking
- Returns full context: flow details, feedback, tasks, allowed actions, next step

Call this at the start of every work session.`,
    inputSchema: {
        type: 'object',
        properties: {
            flowId: {
                type: 'string',
                description: 'The flow ID to work on. If omitted, shows available projects and flows.'
            }
        },
        required: []
    }
};
function determineFeedback(flow) {
    if (flow.planFeedback) {
        return { type: 'plan_rejected', message: flow.planFeedback };
    }
    if (flow.codeFeedback) {
        return { type: 'code_rejected', message: flow.codeFeedback };
    }
    return null;
}
function determineNextStep(state, feedback, git) {
    if (feedback) {
        if (feedback.type === 'plan_rejected') {
            return 'Lies das Feedback und ueberarbeite den Plan. Nutze flow_update({ implementationPlan: "...", currentState: "approval" }) wenn fertig.';
        }
        if (feedback.type === 'code_rejected') {
            return 'Lies das Code-Feedback und behebe die genannten Punkte. Fuehre erneut Self-Review durch und nutze flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "review" }) wenn fertig.';
        }
    }
    // Git workflow guidance
    if (git?.enabled && state === 'in_progress') {
        const baseBranch = git.releaseBranchName || git.defaultBranch;
        if (git.releaseBranchName && !git.releaseBranchCreated) {
            return `Erstelle zuerst den Release-Branch: git checkout -b ${git.releaseBranchName} ${git.defaultBranch}`;
        }
        if (git.flowBranchName && !git.flowBranchCreated) {
            return `Erstelle den Feature-Branch: git checkout -b ${git.flowBranchName} ${baseBranch}`;
        }
    }
    // Enhanced progress guidance with self-review
    if (state === 'in_progress') {
        const commitHint = git?.enabled && git.commitMessagePrompt ? ' (nach Commit-Richtlinien)' : '';
        let guidance = `Implementiere die Anforderungen. Wenn fertig: Self-Review durchfuehren (Diff pruefen, Findings fixen, sauber committen${commitHint}). Testing-Instructions erstellen → flow_update({ agentSummary: "...", testingInstructions: "...", currentState: "review" }).`;
        // Add docs update guidance based on docsUpdate strictness level
        const docsLevel = getConfig().strictness.docsUpdate;
        if (docsLevel >= 5) {
            guidance += '\n\n⚠️ DOCS-UPDATE PFLICHT: Vor dem Review MUSST du alle relevanten Docs pruefen und aktualisieren. Nutze GET /api/docs/relevant?flowId=<flowId> um betroffene Seiten zu finden. Aktualisiere EN + DE Versionen. Docs-Commit ist Pflicht.';
        }
        else if (docsLevel >= 3) {
            guidance += '\n\nDOCS-UPDATE: Bevor du zu Review wechselst, pruefe ob Dokumentation aktualisiert werden muss: GET /api/docs/relevant?flowId=<flowId>. Aktualisiere betroffene Docs (EN + DE) und committe die Aenderungen.';
        }
        return guidance;
    }
    return NEXT_STEP_GUIDANCE[state] || 'Pruefe den Flow-Status.';
}
function generateGitGuidelines(git, projectName) {
    const lines = [`# Git-Richtlinien fuer Projekt "${projectName}"`, ''];
    if (git.flowBranchPrompt) {
        lines.push('## Flow-Branches', git.flowBranchPrompt, '');
    }
    if (git.releaseBranchPrompt) {
        lines.push('## Release-Branches', git.releaseBranchPrompt, '');
    }
    if (git.commitMessagePrompt) {
        lines.push('## Commit Messages', git.commitMessagePrompt, '');
    }
    if (git.prTemplatePrompt) {
        lines.push('## PR-Vorlage', git.prTemplatePrompt, '');
    }
    lines.push('## Automatisierung');
    lines.push(`- PR bei Flow-Abschluss: ${git.autoPrOnFlowDone ? 'Ja' : 'Nein'}`);
    lines.push(`- PR bei Release-Abschluss: ${git.autoPrOnRelease ? 'Ja' : 'Nein'}`);
    const targetBranch = git.releaseBranchName || git.defaultBranch;
    lines.push(`- Ziel-Branch: \`${targetBranch}\``);
    lines.push('');
    return lines.join('\n');
}
async function handleDevflowInit(args) {
    const flowId = args.flowId;
    // 0. Check if project is linked — if not, try auto-discovery then show project list
    if (!devFlowClient.hasLinkedProject()) {
        // Auto-discovery: detect git remote and check ignore list / project match
        if (!flowId) {
            const gitRemote = await detectGitRemoteUrl(getWorkingDir());
            if (gitRemote) {
                try {
                    const discovery = await devFlowClient.discoverProject(gitRemote);
                    if (discovery.found && discovery.project) {
                        const projectsResult = await devFlowClient.listProjects();
                        const projectList = projectsResult.success && projectsResult.data && projectsResult.data.length > 0
                            ? '\n\nAll projects:\n' + projectsResult.data.map((p, i) => `${i + 1}. **${p.name}** (${p.id})`).join('\n')
                            : '';
                        return [
                            `📁 DevFlow project discovered: "${discovery.project.name}"`,
                            '',
                            'This directory\'s git remote matches an existing DevFlow project.',
                            `→ Use devflow_connect({ projectId: "${discovery.project.id}" }) to link it`,
                            '→ Use devflow_disconnect to ignore this project',
                            projectList,
                        ].join('\n');
                    }
                }
                catch {
                    // Discovery failed — fall through to generic project list
                }
            }
        }
        const projectsResult = await devFlowClient.listProjects();
        if (!projectsResult.success || !projectsResult.data || projectsResult.data.length === 0) {
            return 'No projects found. Create a project in DevFlow first at ' + devFlowClient.getBaseUrl();
        }
        const projectList = projectsResult.data.map((p, i) => `${i + 1}. **${p.name}** (${p.id})`).join('\n');
        return `No project linked for this directory. Please call devflow_init with a flowId from one of these projects:\n\n${projectList}\n\nUse flow_list({ projectId: "<id>" }) to see available flows, then call devflow_init({ flowId: "<flowId>" }) to start working.`;
    }
    // 0b. No flowId provided — show available flows for linked project
    if (!flowId) {
        const projectId = devFlowClient.getLinkedProjectId();
        const projectName = devFlowClient.getLinkedProjectName() || projectId;
        const flowsResult = await devFlowClient.listFlows(projectId);
        if (!flowsResult.success || !flowsResult.data || flowsResult.data.length === 0) {
            return `Project **${projectName}** has no flows yet. Create one with flow_create({ summary: "..." }).`;
        }
        const openFlows = flowsResult.data.filter((f) => f.currentState !== 'done');
        if (openFlows.length === 0) {
            return `All flows in **${projectName}** are done. Create a new one with flow_create({ summary: "..." }).`;
        }
        const flowList = openFlows.slice(0, 15).map((f) => `- **${f.displayId}**: ${f.summary} [${f.currentState}]`).join('\n');
        return `Project: **${projectName}**\n\nOpen flows:\n${flowList}\n\nCall devflow_init({ flowId: "<displayId>" }) to start working on a flow.`;
    }
    // 1. Release previous context if switching flows
    if (sessionContext.isActive()) {
        const ctx = sessionContext.get();
        if (ctx && ctx.flow.id !== flowId) {
            try {
                if (ctx.sessionId) {
                    await devFlowClient.completeAgentSession(ctx.sessionId);
                }
                await devFlowClient.updateFlow(ctx.flow.id, {
                    agentStatus: 'idle',
                });
            }
            catch {
                // Best effort cleanup
            }
            sessionContext.release();
        }
    }
    // 2. Resolve flow ID (supports partial IDs)
    const resolvedId = await resolveFlowId(flowId);
    if (!resolvedId) {
        return `⛔ Flow nicht gefunden: "${flowId}"\n\nNutze flow_list() um verfuegbare Flows zu sehen.`;
    }
    // 2b. Check if flow is archived
    const preCheck = await devFlowClient.getFlow(resolvedId);
    if (preCheck.success && preCheck.data && preCheck.data.archivedAt) {
        return '⛔ Dieser Flow ist archiviert. Archivierte Flows koennen nicht bearbeitet werden.\n\nNutze die DevFlow-UI um den Flow zuerst wiederherzustellen.';
    }
    // 3. Call init endpoint (creates session, returns flow + tasks + permissions)
    const initResult = await devFlowClient.initSession(resolvedId);
    if (!initResult.success || !initResult.data) {
        const errorMsg = initResult.error || 'Unbekannter Fehler';
        // Check for plan limit
        if (errorMsg.includes('Plan limit')) {
            return [
                '⛔ Plan-Limit erreicht.',
                '',
                errorMsg,
                '',
                'Upgrade deinen Plan oder trenne einen aktiven Agent in DevFlow → Einstellungen → API-Zugang.',
            ].join('\n');
        }
        // Check for flow already locked
        if (errorMsg.includes('already has an active') || errorMsg.includes('already locked')) {
            return [
                '⛔ Flow ist bereits durch einen anderen Agent gesperrt.',
                '',
                `Flow ID: ${resolvedId}`,
                '',
                'Warte bis die aktuelle Session endet oder trenne den Agent in DevFlow → Einstellungen → API-Zugang.',
            ].join('\n');
        }
        return `⛔ Init fehlgeschlagen: ${errorMsg}`;
    }
    const { session, flow: initFlow, tasks: initTasks, warning } = initResult.data;
    const initData = initResult.data;
    // Store session ID on client for X-Agent-Session header
    devFlowClient.setAgentSessionId(session.id);
    // 4. Fetch full flow details (init endpoint returns minimal flow data)
    const fullFlowResult = await devFlowClient.getFlow(resolvedId);
    if (!fullFlowResult.success || !fullFlowResult.data) {
        return `⛔ Flow konnte nicht geladen werden: ${fullFlowResult.error || 'Unbekannter Fehler'}`;
    }
    const flow = fullFlowResult.data;
    // 4b. Auto-link project if .devflow.json doesn't exist yet
    if (!devFlowClient.hasLinkedProject() && flow.projectId) {
        try {
            const projectResult = await devFlowClient.getProject(flow.projectId);
            const projectName = projectResult.data?.name || 'Unknown';
            await saveProjectConfig(getWorkingDir(), flow.projectId, projectName);
        }
        catch {
            // Non-critical — continue without auto-linking
        }
    }
    // 5. Auto-advance state for visibility (idea → planning, ready → in_progress)
    const AUTO_ADVANCE = {
        idea: 'planning',
        ready: 'in_progress',
    };
    const advanceTo = AUTO_ADVANCE[flow.currentState];
    if (advanceTo) {
        const advanceUpdate = {
            currentState: advanceTo,
            agentStatus: advanceTo === 'planning' ? 'analyzing' : 'implementing',
            agentMessage: 'Session gestartet',
        };
        const advanceResult = await devFlowClient.updateFlow(resolvedId, advanceUpdate);
        if (advanceResult.success && advanceResult.data) {
            // Use the updated flow
            Object.assign(flow, advanceResult.data);
        }
    }
    else {
        // Set agent status even without state advance
        await devFlowClient.updateFlow(resolvedId, {
            agentStatus: 'analyzing',
            agentMessage: 'Session gestartet',
        }).catch(() => { });
    }
    // 6. Check for feedback
    const feedback = determineFeedback(flow);
    // 7. Load git settings
    let gitContext;
    try {
        const projectId = flow.projectId;
        const gitResult = await devFlowClient.getGitSettings(projectId);
        if (gitResult.success && gitResult.data?.enabled) {
            const gs = gitResult.data;
            // Find active release for branch info
            const releasesResult = await devFlowClient.listReleases(projectId);
            const activeRelease = releasesResult.data?.find((r) => r.isActive);
            gitContext = {
                enabled: true,
                defaultBranch: gs.defaultBranch,
                flowBranchPrompt: gs.flowBranchPrompt,
                releaseBranchPrompt: gs.releaseBranchPrompt,
                commitMessagePrompt: gs.commitMessagePrompt,
                prTemplatePrompt: gs.prTemplatePrompt,
                autoPrOnFlowDone: gs.autoPrOnFlowDone || false,
                autoPrOnRelease: gs.autoPrOnRelease || false,
                autoAssignToActiveRelease: gs.autoAssignToActiveRelease,
                flowBranchName: flow.branchName,
                flowBranchCreated: flow.branchCreated || false,
                releaseBranchName: activeRelease?.branchName,
                releaseBranchCreated: activeRelease?.branchCreated || false,
            };
        }
    }
    catch {
        // Continue without git context
    }
    // 8. Transform tasks from init response to full Task format
    const tasks = initTasks.map(t => ({
        id: t.id,
        flowId: resolvedId,
        summary: t.summary,
        isCompleted: t.isCompleted,
        sortOrder: 0,
        createdAt: '',
        status: t.status,
    }));
    // 9. Fetch allowedActions from backend (sole source of truth)
    // After auto-advance, the init response's allowedActions may be stale,
    // so we always re-fetch from the next-step endpoint.
    const state = flow.currentState;
    let allowedActions = [];
    let stepKind = null;
    let transitionPolicy = null;
    let pipelineStep = null;
    let pipelineSkill = null;
    let gateBlocked = false;
    let retryCount = 0;
    let previousFeedback = null;
    // Try next-step endpoint first (authoritative for pipeline-aware projects)
    try {
        const nextStepResult = await devFlowClient.getNextStep(resolvedId);
        if (nextStepResult.success && nextStepResult.data) {
            const nsd = nextStepResult.data;
            if (Array.isArray(nsd.allowedActions)) {
                allowedActions = nsd.allowedActions;
            }
            stepKind = nsd.kind || null;
            transitionPolicy = nsd.transitionPolicy || null;
            pipelineStep = nsd.pipelineStep || null;
            pipelineSkill = nsd.skill || null;
            const gate = nsd.gate;
            gateBlocked = gate?.blocked || false;
            retryCount = nsd.retryCount || 0;
            previousFeedback = nsd.previousFeedback || null;
        }
    }
    catch {
        // next-step endpoint may not exist (no pipeline configured) — fall back to init data
    }
    // Fall back to init response data if next-step didn't provide allowedActions
    if (allowedActions.length === 0 && Array.isArray(initData.allowedActions)) {
        allowedActions = initData.allowedActions;
    }
    // Fall back to init response pipeline data if next-step didn't provide it
    if (!pipelineStep && initData.pipelineStep) {
        pipelineStep = initData.pipelineStep;
        pipelineSkill = initData.skill || null;
        const gate = initData.gate;
        gateBlocked = gate?.blocked || false;
        retryCount = initData.retryCount || 0;
        previousFeedback = initData.previousFeedback || null;
    }
    const nextStep = determineNextStep(state, feedback, gitContext);
    const activeContext = {
        flow,
        previousState: advanceTo ? AUTO_ADVANCE[advanceTo] ? undefined : flow.currentState : undefined,
        sessionId: session.id,
        startedAt: new Date().toISOString(),
        feedback,
        tasks,
        allowedActions,
        nextStep,
        git: gitContext,
        pipelineStep,
        stepKind,
        transitionPolicy,
        skill: pipelineSkill,
        gateBlocked,
        retryCount,
        previousFeedback,
    };
    // Track the previous state correctly for auto-advance display
    if (advanceTo) {
        // The original state before auto-advance
        const originalState = Object.entries(AUTO_ADVANCE).find(([, v]) => v === flow.currentState)?.[0];
        if (originalState) {
            activeContext.previousState = originalState;
        }
    }
    sessionContext.init(activeContext);
    // Version check (non-blocking, cached). DF-216: no auto-download — the user
    // reinstalls via Claude-Code plugin / `npx github:...setup`.
    const baseUrl = devFlowClient.getBaseUrl();
    const updateInfo = await checkForUpdate(baseUrl);
    // Load attachments
    let attachmentSection = '';
    try {
        const attResult = await devFlowClient.getAttachments(activeContext.flow.id);
        if (attResult.success && Array.isArray(attResult.data) && attResult.data.length > 0) {
            attachmentSection = '\n\n' + formatAttachmentList(attResult.data);
        }
    }
    catch { }
    return formatInitResponse(activeContext, warning, updateInfo) + attachmentSection;
}
function formatInitResponse(ctx, warning, updateAvailable) {
    const w = ctx.flow;
    const lines = [
        '# Session gestartet',
        '',
        `**Flow:** ${w.summary}`,
        `**ID:** ${w.id}`,
        `**State:** ${w.currentState}`,
    ];
    // Show strictness levels
    const s = getConfig().strictness;
    lines.push(`**Strictness:** Flow ${formatStrictnessLevel(s.flowRequired)} | Plan ${formatStrictnessLevel(s.planRequired)} | Tasks ${formatStrictnessLevel(s.taskTracking)} | Git ${formatStrictnessLevel(s.gitDiscipline)} | Review ${formatStrictnessLevel(s.reviewRequired)} | Docs ${formatStrictnessLevel(s.docsUpdate)}`);
    if (ctx.previousState) {
        lines.push(`**Auto-Advance:** ${ctx.previousState} → ${w.currentState}`);
    }
    if (warning) {
        lines.push('', `⚠️ **Warnung:** ${warning}`);
    }
    if (w.description) {
        lines.push('', '## Beschreibung', w.description);
    }
    // Extract embedded images from TipTap JSON
    if (w.descriptionJson) {
        const baseUrl = process.env.DEVFLOW_URL || 'https://api.app.dev-flow.tech';
        const images = extractImagesFromTipTap(w.descriptionJson, baseUrl);
        if (images.length > 0) {
            lines.push('', '## Embedded Images');
            for (const url of images) {
                lines.push(`- ![image](${url})`);
            }
        }
    }
    if (w.acceptanceCriteria && w.acceptanceCriteria.length > 0) {
        lines.push('', '## Acceptance Criteria');
        for (const c of w.acceptanceCriteria) {
            lines.push(`- [ ] ${c}`);
        }
    }
    if (ctx.feedback) {
        lines.push('', `## Feedback`, `**Typ:** ${ctx.feedback.type}`, ctx.feedback.message);
    }
    if (w.implementationPlan) {
        lines.push('', '## Implementation Plan', w.implementationPlan);
    }
    if (ctx.tasks.length > 0) {
        lines.push('', '## Tasks');
        const completed = ctx.tasks.filter(t => t.isCompleted).length;
        lines.push(`**Fortschritt:** ${completed}/${ctx.tasks.length}`);
        for (const t of ctx.tasks) {
            const check = t.isCompleted ? '✅' : '⬜';
            lines.push(`${check} ${t.summary}`);
        }
    }
    // Git workflow section
    if (ctx.git?.enabled) {
        const projectName = devFlowClient.getLinkedProjectName() || 'Unbekannt';
        lines.push('', generateGitGuidelines(ctx.git, projectName));
        // Branch status
        lines.push('## Branch-Status');
        const baseBranch = ctx.git.releaseBranchName || ctx.git.defaultBranch;
        if (ctx.git.releaseBranchName) {
            const releaseStatus = ctx.git.releaseBranchCreated ? '✅' : '⬜';
            lines.push(`${releaseStatus} Release-Branch: \`${ctx.git.releaseBranchName}\``);
        }
        if (ctx.git.flowBranchName) {
            const flowStatus = ctx.git.flowBranchCreated ? '✅' : '⬜';
            lines.push(`${flowStatus} Feature-Branch: \`${ctx.git.flowBranchName}\``);
        }
        lines.push(`Basis: \`${baseBranch}\``);
    }
    // Pipeline section (Phase 2)
    if (ctx.pipelineStep) {
        const executor = (ctx.skill?.slug) || 'agent';
        lines.push('', '## Pipeline');
        lines.push(`**Current step:** ${ctx.pipelineStep} (${executor})`);
        if (ctx.skill) {
            lines.push(`**Skill:** ${ctx.skill.name}${ctx.skill.description ? ` — ${ctx.skill.description}` : ''}`);
        }
        if (ctx.gateBlocked) {
            lines.push('', `⚠️ **Gate blocked:** Step '${ctx.pipelineStep}' requires human action. Wait for user in DevFlow UI.`);
        }
        if (ctx.retryCount && ctx.retryCount > 0 && ctx.previousFeedback) {
            lines.push('', `🔄 **Retry #${ctx.retryCount}** — Previous feedback:`, ctx.previousFeedback);
        }
    }
    lines.push('', '---', `**Erlaubte Aktionen:** ${ctx.allowedActions.join(', ')}`, `**Naechster Schritt:** ${ctx.nextStep}`);
    if (updateAvailable) {
        lines.push('');
        lines.push('---');
        lines.push(`**⚠️ Update available:** v${updateAvailable.currentVersion} → v${updateAvailable.latestVersion}`);
        lines.push('Run: `npx github:KlausFreiberufler/devflow-mcp setup`');
    }
    return lines.join('\n');
}
export const tools = {
    devflow_init: {
        definition: devflowInitDef,
        handler: withErrorHandling('devflow_init', handleDevflowInit),
    },
};
