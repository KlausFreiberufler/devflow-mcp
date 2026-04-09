# Contributing to DevFlow MCP Server

## Development Setup

```bash
git clone https://github.com/KlausFreiberufler/devflow-mcp.git
cd devflow-mcp
npm install
npm run build
```

## Register Local MCP Server

```bash
# With production backend
npm run setup

# With custom backend URL
node dist/setup/setup.js --url https://your-backend.example.com
```

The registration points to `dist/index.js` in this repo.
After each build, your AI client automatically uses the new code.

## Development Workflow

### Edit, Build, Test

```bash
# 1. Edit code in src/

# 2. Build
npm run build

# 3. Restart your AI client (a new session is enough)
#    The MCP server automatically loads the new dist/index.js

# 4. Test: use flow_list, devflow_init, etc. in your AI client
```

### Auto-Build on Changes

```bash
npm run dev
```

Uses `tsc --watch` — compiles automatically on every file change.
Your AI client still needs a restart to load the new code.

## Project Structure

```
src/
├── index.ts              # Entry point (MCP server + setup routing)
├── api/
│   └── client.ts         # DevFlow API client (auth, HTTP, types)
├── auth/
│   └── browser-auth.ts   # Browser-based authentication
├── config/
│   ├── sync.ts           # Config sync from backend
│   ├── version.ts        # MCP version constant
│   └── types.ts          # Config types
├── context/
│   ├── auto-logger.ts    # Automatic session logging
│   ├── auto-status.ts    # Automatic status updates
│   ├── client-detect.ts  # Client type detection
│   ├── permissions.ts    # Tool permissions per flow state
│   └── session.ts        # Session context (init gate)
├── setup/
│   ├── setup.ts          # Setup wizard (CLI)
│   └── wrapper.ts        # Shell wrapper generator
├── templates/
│   ├── claude-md.ts      # CLAUDE.md template generator
│   ├── cursorrules.ts    # .cursorrules template
│   ├── agents-md.ts      # AGENTS.md template (Codex)
│   ├── gemini-md.ts      # GEMINI.md template
│   └── windsurfrules.ts  # .windsurfrules template
├── tools/
│   ├── registry.ts       # Tool registry with guards
│   ├── init.ts           # devflow_init tool
│   ├── flow.ts           # Flow tools (list, get, create, update)
│   ├── task.ts           # Task tools
│   ├── agent-session.ts  # Agent session tools
│   ├── docs.ts           # Documentation tools
│   ├── release.ts        # Release tools
│   ├── search.ts         # Search tool
│   └── status.ts         # Status/connection tool
└── utils/
    ├── errors.ts         # Error handling utilities
    ├── git.ts            # Git remote detection
    └── working-dir.ts    # Working directory detection
```

## Architecture

### Init Gate

All tools (except `devflow_init`, `flow_list`, `flow_create`, `devflow_status`) are blocked until `devflow_init` is called with a flow ID. This ensures every piece of work is associated with a flow.

### Tool Permissions

Depending on the flow state, only certain tools are allowed. Permissions are enforced by the backend — the MCP server has no permission logic of its own.

### API Client

The client in `api/client.ts` handles:
- Browser-based authentication (token + refresh)
- Automatic retries on 5xx errors
- snake_case to camelCase transformation of API responses

## npm Package

### Check Package Contents

```bash
# What files end up in the package?
npm pack --dry-run

# Only dist/ + README.md + package.json should be included
```

### Key package.json Fields

| Field | Value | Purpose |
|-------|-------|---------|
| `private` | `true` | Prevents accidental npm publishing |
| `files` | `["dist"]` | Only compiled files in the package |
| `prepare` | `npm run build` | Auto-build on `npx github:...` install |
| `bin.devflow-mcp` | `dist/index.js` | Main entry point + setup routing |

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Watch mode (auto-compile) |
| `npm run setup` | Start setup wizard |
| `npm pack --dry-run` | Check package contents |
