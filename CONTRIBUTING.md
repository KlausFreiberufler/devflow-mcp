# Contributing - DevFlow MCP Server

## Entwicklungsumgebung einrichten

```bash
git clone https://github.com/KlausFreiberufler/devflow-mcp.git
cd devflow-mcp
npm install
npm run build
```

## Lokalen MCP-Server registrieren

```bash
# Mit Produktions-Backend
npm run setup

# Mit lokalem Backend
node dist/index.js setup --url http://localhost:6011
```

Die Registrierung zeigt auf `dist/index.js` in diesem Repo.
Nach jedem Build nutzt Claude Code automatisch den neuen Code.

## Entwicklungs-Workflow

### Code ändern und testen

```bash
# 1. Code in src/ bearbeiten

# 2. Bauen
npm run build

# 3. Claude Code neu starten (neue Session reicht)
#    → MCP-Server lädt automatisch die neue dist/index.js

# 4. Testen: flow_list, devflow_init, etc. in Claude Code nutzen
```

### Auto-Build bei Änderungen

```bash
npm run dev
```

Nutzt `tsc --watch` - kompiliert automatisch bei jeder Dateiänderung.
Claude Code muss trotzdem neu gestartet werden um den neuen Code zu laden.

## Projektstruktur

```
src/
├── index.ts              # Einstiegspunkt (MCP-Server + Setup-Routing)
├── api/
│   └── client.ts         # DevFlow API Client (Auth, HTTP, Typen)
├── auth/
│   └── browser-auth.ts   # Browser-basierte Authentifizierung
├── config/
│   ├── sync.ts           # Config-Sync vom Backend
│   └── types.ts          # Config-Typen
├── context/
│   ├── auto-logger.ts    # Automatisches Session-Logging
│   ├── auto-status.ts    # Automatische Status-Updates
│   ├── permissions.ts    # Tool-Permissions pro Flow-State
│   └── session.ts        # Session-Kontext (Init-Gate)
├── setup/
│   └── setup.ts          # Setup-Wizard (CLI)
├── templates/
│   └── claude-md.ts      # CLAUDE.md Template-Generator
├── tools/
│   ├── registry.ts       # Tool-Registry
│   ├── init.ts           # devflow_init Tool
│   ├── flow.ts           # Flow-Tools (list, get, create, update)
│   ├── task.ts           # Task-Tools
│   ├── agent-session.ts  # Agent-Session-Tools
│   ├── knowledge.ts      # Knowledge-Tools
│   ├── release.ts        # Release-Tools
│   └── search.ts         # Search-Tool
└── utils/
    └── errors.ts         # Error-Handling Utilities
```

## Architektur

### Init-Gate

Alle Tools (außer `devflow_init`, `flow_list`, `flow_create`) sind gesperrt bis `devflow_init` mit einer Flow-ID aufgerufen wird. Das stellt sicher, dass jede Arbeit einem Flow zugeordnet ist.

### Tool-Permissions

Je nach Flow-State sind nur bestimmte Tools erlaubt. Die Permissions werden in `context/permissions.ts` definiert und vom Server erzwungen.

### API-Client

Der Client in `api/client.ts` handhabt:
- Browser-basierte Authentifizierung (Token + Refresh)
- Automatische Retries bei 5xx-Fehlern
- snake_case → camelCase Transformation der API-Responses

## npm-Paket

### Paket prüfen

```bash
# Welche Dateien landen im Paket?
npm pack --dry-run

# Nur dist/ + README.md + package.json sollten enthalten sein
```

### Wichtige package.json Felder

| Feld | Wert | Zweck |
|------|------|-------|
| `private` | `true` | Verhindert versehentliches Publishen auf npm |
| `files` | `["dist"]` | Nur kompilierte Dateien im Paket |
| `prepare` | `npm run build` | Auto-Build bei `npx github:...` Installation |
| `bin.devflow-mcp` | `dist/index.js` | Haupteinstiegspunkt + Setup-Routing |

## Nützliche Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `npm run build` | TypeScript kompilieren |
| `npm run dev` | Watch-Mode (auto-kompilieren) |
| `npm run setup` | Setup-Wizard starten |
| `npm pack --dry-run` | Paketinhalt prüfen |
| `node dist/index.js setup --url <url>` | Setup mit eigener URL |
