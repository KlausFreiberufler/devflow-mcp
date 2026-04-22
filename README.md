# DevFlow MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MCP server for integrating [DevFlow](https://dev-flow.tech) with AI code assistants. Enables structured development workflows with enforced planning, task tracking, and code review gates.

## What is DevFlow?

DevFlow brings structure to AI-assisted development. Instead of letting AI agents write code without oversight, DevFlow enforces a workflow:

```
idea -> planning -> approval -> ready -> in_progress -> review -> done
```

Every feature or bugfix goes through planning, gets approved, is tracked with tasks, and must pass review before completion. The MCP server connects your AI coding assistant to DevFlow, making this workflow seamless.

## Installation

### As a Claude Code Plugin (recommended)

DevFlow is listed in the official Claude Code community marketplace. Install in one line:

```bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install devflow
```

This installs everything in one shot: MCP server (auto-registered via `mcpServers` in the plugin manifest), enforcement hooks, state-specific skills, and slash commands (`/devflow-start`, `/devflow-status`, `/devflow-next`, `/devflow-tasks`, `/devflow-create`, `/devflow-list`, `/devflow-review`). No separate MCP setup step needed.

Updates: `/plugin update devflow`.

### Manual Setup (fallback)

If you'd rather skip the plugin and wire the MCP server directly:

#### Claude Code

```bash
npx github:KlausFreiberufler/devflow-mcp setup
```

#### Cursor

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client cursor
```

#### Gemini CLI

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client gemini
```

#### Windsurf

```bash
npx github:KlausFreiberufler/devflow-mcp setup --client windsurf
```

**Restart your AI client after setup.**

## Getting Started

1. Run `devflow_status()` to check the connection
2. The browser opens for authentication on first use
3. Link your project — a `.devflow.json` file is created in your project directory
4. Start working: `flow_list()` to see available flows, or `flow_create()` to create one
5. Initialize your session: `devflow_init({ flowId: "..." })`

## Compatible Clients

| Client | MCP Support | Status |
|--------|-------------|--------|
| [Claude Code](https://claude.ai/code) | Native | Fully supported |
| [Cursor](https://cursor.sh) | MCP | Supported |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | MCP | Supported |
| [Windsurf](https://codeium.com/windsurf) | MCP | Supported |

## Flow States

| State | Description |
|-------|-------------|
| `idea` | New idea, no plan yet |
| `planning` | Agent creates implementation plan |
| `approval` | User approves the plan (wait state) |
| `ready` | Plan approved, ready for implementation |
| `in_progress` | Implementation in progress |
| `review` | User reviews the implementation (wait state) |
| `done` | Completed |

### Required Fields for State Transitions

| Transition | Required Fields |
|------------|----------------|
| -> `approval` | `implementationPlan` |
| -> `review` | `agentSummary`, `testingInstructions` |

## Available MCP Tools

### Session & Flows

| Tool | Description |
|------|-------------|
| `devflow_init` | **Required before all other tools.** Starts a flow session |
| `devflow_status` | Show connection status, link/unlink projects |
| `flow_list` | List flows (filtered by project) |
| `flow_get` | Get flow details including plan and audit trail |
| `flow_create` | Create a new flow |
| `flow_update` | Update state, plan, agent messages |
| `flow_get_feedback` | Get user feedback on plan or code |

### Tasks

| Tool | Description |
|------|-------------|
| `task_list` | List tasks of a flow |
| `task_create` | Create a new task |
| `task_update` | Update task or mark as completed |

### Agent Sessions

| Tool | Description |
|------|-------------|
| `agent_session_create` | Create agent session (tracking) |
| `agent_session_log` | Log progress to a session |
| `agent_session_complete` | Complete an agent session |
| `agent_session_list` | List sessions of a flow |

### Documentation & Search

| Tool | Description |
|------|-------------|
| `doc_page_list` | List documentation pages |
| `doc_page_get` | Get a documentation page |
| `doc_page_create` | Create a documentation page |
| `doc_page_update` | Update a documentation page |
| `project_guidelines_get` | Get project guidelines |
| `search` | Search flows, tasks, and projects |

### Releases

| Tool | Description |
|------|-------------|
| `release_list` | List releases |
| `release_get` | Get release details |
| `release_create` | Create a new release |
| `release_update` | Update release status/details |

### Knowledge — Wiki & ADRs (v4.5.0)

| Tool | Description |
|------|-------------|
| `wiki_search` | Full-text search over flows, doc-pages, reviews, releases |
| `wiki_get_page` | Resolve a slug / title / display-id to a concrete asset + backlinks |
| `wiki_list_by_type` | List assets of a specific document-type (adr, pattern, runbook, …) |
| `wiki_backlinks` | Reverse lookup: all assets that link to X |
| `wiki_graph_neighbors` | Graph (nodes + edges) of the project or a subset |
| `wiki_get_flow_context` | A flow's outgoing + incoming wiki links |
| `wiki_get_project_context` | Project knowledge graph summary |
| `adr_list` | List ADRs (optional status filter) |
| `adr_get` | ADR detail with supersedes chain |
| `adr_accept` | Accept an ADR from a flow-attachment |
| `adr_update_status` | Move ADR through proposed → accepted → deprecated / superseded |

### Knowledge Drafts (v4.6.0)

| Tool | Description |
|------|-------------|
| `knowledge_backfill_request` | Get done-flows + existing ADRs + instructions — you classify and call `knowledge_draft_create` for each draft |
| `knowledge_draft_create` | Create a draft (dedup-aware: same (project, type, title) merges `sourceFlowIds`) |
| `knowledge_draft_list` | List drafts (optional status filter) |
| `knowledge_draft_accept` | Accept a draft (creates the ADR / doc-page) |
| `knowledge_draft_reject` | Reject a draft with optional reviewer note |

### Knowledge Harvest / Check (v4.7.0)

| Tool | Description |
|------|-------------|
| `knowledge_harvest` | Per-flow harvest — returns a single done-flow + context + instructions for draft proposal |
| `knowledge_check_flow` | Flow analysis — drift (against existing ADRs) + missing-knowledge suggestions |

### Code Drift (v4.9.0)

| Tool | Description |
|------|-------------|
| `knowledge_check_drift` | Returns ADR content + its `affects_paths` + instructions. You use your own Glob/Read/Grep to compare claims vs code and report drift |

## MCP Resources (v4.8.0)

URI-addressable project assets for reading via `ReadResource`.

| URI | Description |
|-----|-------------|
| `devflow://project/{id}/adr/{number}` | ADR content as markdown |
| `devflow://project/{id}/flow/{displayId}` | Flow with plan + agent summary |
| `devflow://project/{id}/graph` | Project knowledge-graph summary |
| `devflow://project/{id}/search?q=...` | FTS search formatted as markdown |

## MCP Prompts (v4.8.0)

Guided one-shot workflows — each auto-assembles relevant project context.

| Prompt | Args | Purpose |
|--------|------|---------|
| `ask_project` | `query` | Answer a free-form question; loads ADRs + recent done-flows as context |
| `plan_with_project_knowledge` | `flowId` | Pre-build a planning prompt with relevant ADRs + related flows |
| `review_with_drift_check` | `flowId` | Auto-run knowledge-check-prepare and produce a review prompt |

## Pipeline Integration

Projects with pipeline configuration get extended features:

### Pipeline Model

Each pipeline step has four dimensions:

| Field | Description | Values |
|-------|-------------|--------|
| `actor` | Who works on this step? | `human`, `agent`, `both`, `auto`, `skip` |
| `transitionPolicy` | Who can complete the step? | `human_only`, `agent_only`, `human_or_agent`, `auto` |
| `kind` | Semantic step type | `work`, `review`, `handoff`, `terminal` |
| `skippable` | Can the step be skipped? | `true`, `false` |

### Gate Handling

Gates are controlled via `transitionPolicy`:
- `human_only` — Agent is blocked (403), human must act in the UI
- `agent_only` — Only agents can proceed
- `human_or_agent` — Both can complete the step
- `auto` — System transition, no actor needed

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEVFLOW_URL` | Backend URL | `https://api.app.dev-flow.tech` |
| `DEVFLOW_TOKEN` | Auth token (skips browser auth) | - |
| `DEVFLOW_PROJECT_ID` | Project scoping | from `.devflow.json` |

### Manual Configuration

Add to your client's MCP configuration:

```json
{
  "mcpServers": {
    "devflow": {
      "command": "node",
      "args": ["/path/to/devflow-mcp/dist/index.js"],
      "env": {
        "DEVFLOW_URL": "https://api.app.dev-flow.tech"
      }
    }
  }
}
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and development workflow.

## License

[MIT](LICENSE) - DevFlow (dev-flow.tech)
