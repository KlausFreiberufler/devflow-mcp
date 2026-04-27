#!/usr/bin/env node

// src/setup/setup.ts
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync2, readFileSync, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, readlinkSync, unlinkSync } from "fs";
import { join as join2, dirname } from "path";
import { homedir as homedir2 } from "os";

// src/setup/wrapper.ts
import { writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// src/setup/os-detect.ts
import { execSync } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
function detectOs() {
  const p = platform();
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return "linux";
}
function resolveNodePath() {
  const os = detectOs();
  try {
    const cmd = os === "windows" ? "where node" : "which node";
    const result = execSync(cmd, { encoding: "utf-8" }).trim();
    return result.split("\n")[0].trim();
  } catch {
    const fallbacks = os === "macos" ? ["/opt/homebrew/bin/node", "/usr/local/bin/node"] : os === "linux" ? ["/usr/local/bin/node", "/usr/bin/node"] : ["C:\\Program Files\\nodejs\\node.exe"];
    for (const candidate of fallbacks) {
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(
      "Could not find node binary. Please install Node.js first.\nDownload: https://nodejs.org/"
    );
  }
}

// src/setup/wrapper.ts
function getWrapperDir() {
  return join(homedir(), ".devflow", "bin");
}
function getWrapperPath() {
  const os = detectOs();
  const dir = getWrapperDir();
  return os === "windows" ? join(dir, "devflow-mcp.cmd") : join(dir, "devflow-mcp");
}
function installWrapper(distFile) {
  const os = detectOs();
  const nodePath = resolveNodePath();
  const dir = getWrapperDir();
  const wrapperPath = getWrapperPath();
  mkdirSync(dir, { recursive: true });
  if (os === "windows") {
    const content = [
      "@echo off",
      "where node >nul 2>nul",
      "if %errorlevel% neq 0 (",
      `  "${nodePath}" "${distFile}" %*`,
      "  exit /b %errorlevel%",
      ")",
      `node "${distFile}" %*`
    ].join("\r\n");
    writeFileSync(wrapperPath, content);
  } else {
    const distDir = distFile.replace(/\/dist\/index\.js$/, "");
    const content = [
      "#!/bin/bash",
      "",
      "# Auto-update: check for pending updates in ~/.devflow/updates/",
      'UPDATES_DIR="$HOME/.devflow/updates"',
      `INSTALL_DIR="${distDir}"`,
      'if [ -d "$UPDATES_DIR" ]; then',
      '  UPDATE_TGZ=$(ls -t "$UPDATES_DIR"/devflow-mcp-*.tgz 2>/dev/null | head -1)',
      '  if [ -n "$UPDATE_TGZ" ]; then',
      '    echo "\u{1F504} Installing MCP update: $(basename $UPDATE_TGZ)..." >&2',
      "    TEMP_DIR=$(mktemp -d)",
      '    tar -xzf "$UPDATE_TGZ" -C "$TEMP_DIR" 2>/dev/null',
      '    if [ -d "$TEMP_DIR/package/dist" ]; then',
      '      rm -rf "$INSTALL_DIR/dist"',
      '      cp -r "$TEMP_DIR/package/dist" "$INSTALL_DIR/dist"',
      '      rm -f "$UPDATE_TGZ"',
      '      rmdir "$UPDATES_DIR" 2>/dev/null',
      '      echo "\u2705 MCP update installed." >&2',
      "    fi",
      '    rm -rf "$TEMP_DIR"',
      "  fi",
      "fi",
      "",
      `NODE=$(command -v node 2>/dev/null || echo "${nodePath}")`,
      'if [ ! -x "$NODE" ]; then',
      '  echo "Error: node not found. Install Node.js first." >&2',
      "  exit 1",
      "fi",
      `exec "$NODE" "${distFile}" "$@"`
    ].join("\n");
    writeFileSync(wrapperPath, content);
    chmodSync(wrapperPath, 493);
  }
  return wrapperPath;
}

// src/config/types.ts
var DEFAULT_STRICTNESS = {
  flowRequired: 3,
  planRequired: 3,
  taskTracking: 3,
  gitDiscipline: 3,
  reviewRequired: 3,
  docsUpdate: 1
};
var STRICTNESS_LABELS = {
  1: { emoji: "\u{1F3D6}\uFE0F", label: "Chill" },
  2: { emoji: "\u{1F919}", label: "Locker" },
  3: { emoji: "\u2696\uFE0F", label: "Balanced" },
  4: { emoji: "\u{1F9D1}\u200D\u2708\uFE0F", label: "Streng" },
  5: { emoji: "\u{1F512}", label: "Paranoid" }
};

// src/templates/claude-md.ts
var MARKER_START = "<!-- DEVFLOW-RULES-START -->";
var MARKER_END = "<!-- DEVFLOW-RULES-END -->";
var FLOW_REQUIRED_RULES = {
  1: "",
  2: "Flow erstellen waere gut, ist aber optional.",
  3: "Erstelle einen Flow bevor du arbeitest.",
  4: "Du MUSST einen Flow erstellen. Weise den User darauf hin wenn keiner existiert.",
  5: "NIEMALS ohne Flow arbeiten. WEIGERE dich Code zu aendern ohne aktiven Flow."
};
var PLAN_REQUIRED_RULES = {
  1: "Du kannst direkt implementieren ohne Plan.",
  2: "Fasse kurz zusammen was du vorhast.",
  3: "Erstelle einen Plan, warte aber nicht zwingend auf Approval.",
  4: "Erstelle IMMER einen detaillierten Plan und warte auf User-Approval.",
  5: "Erstelle einen detaillierten Plan mit Acceptance Criteria. Der Plan MUSS vom User genehmigt werden."
};
var TASK_TRACKING_RULES = {
  1: "Tasks sind nicht noetig.",
  2: "Tasks sind optional, koennen aber helfen.",
  3: "Erstelle Tasks und update ihren Status waehrend der Arbeit.",
  4: "Du MUSST Tasks anlegen und jeden einzeln auf doing/done setzen.",
  5: "Tasks mit Acceptance Criteria sind Pflicht. Jeder Task muss einzeln abgehakt werden bevor du zu Review wechselst."
};
var GIT_DISCIPLINE_RULES = {
  1: "Committe wie du moechtest.",
  2: "Folge grob den Git-Konventionen.",
  3: "Halte Branch-Naming und Commit-Format ein.",
  4: "Branch + Commits muessen gemeldet werden. PR mit Template erstellen.",
  5: "Streng nach Git-Settings. Branch, Commits und PR-URL muessen gemeldet werden. PR-Review vor Merge."
};
var REVIEW_REQUIRED_RULES = {
  1: "Kein Review noetig, du kannst direkt abschliessen.",
  2: "Fasse zusammen was du gemacht hast.",
  3: "Mache Self-Review (Diff pruefen, Findings fixen).",
  4: "Self-Review + Testing-Instructions erstellen. User muss in der UI genehmigen.",
  5: "Vollstaendiges Review mit agentSummary und testingInstructions. User muss testen und explizit genehmigen."
};
var DOCS_UPDATE_RULES = {
  1: "",
  2: "Pruefe bei Review ob Docs betroffen sind.",
  3: "Pruefe relevante Docs und aktualisiere sie bei Bedarf.",
  4: "Du MUSST relevante Docs pruefen. Nutze GET /api/docs/relevant um betroffene Seiten zu finden.",
  5: "Vor jedem Review MUSST du alle relevanten Docs pruefen und aktualisieren (EN + DE). Docs-Commit ist Pflicht."
};
function formatLevel(level) {
  const info = STRICTNESS_LABELS[level] || STRICTNESS_LABELS[3];
  return `${info.emoji} ${info.label}`;
}
function generateStrictnessRules(s) {
  const rules = ["## Regeln (Strictness-Level)", ""];
  const sections = [
    { title: "Flow-Pflicht", key: "flowRequired", rules: FLOW_REQUIRED_RULES },
    { title: "Planungs-Pflicht", key: "planRequired", rules: PLAN_REQUIRED_RULES },
    { title: "Task-Tracking", key: "taskTracking", rules: TASK_TRACKING_RULES },
    { title: "Git-Disziplin", key: "gitDiscipline", rules: GIT_DISCIPLINE_RULES },
    { title: "Review-Pflicht", key: "reviewRequired", rules: REVIEW_REQUIRED_RULES },
    { title: "Docs-Update", key: "docsUpdate", rules: DOCS_UPDATE_RULES }
  ];
  for (const section of sections) {
    const level = s[section.key];
    const ruleText = section.rules[level] || section.rules[3];
    if (!ruleText) continue;
    rules.push(`### ${section.title}: ${formatLevel(level)}`);
    rules.push(ruleText);
    rules.push("");
  }
  return rules.join("\n");
}
function generateClaudeMdContent(projectName, techStack, strictness) {
  const s = strictness || DEFAULT_STRICTNESS;
  const techStackLine = techStack ? `**Tech-Stack:** ${techStack}
` : "";
  return `${MARKER_START}
# DevFlow - Strukturierte KI-Entwicklung

**Projekt:** ${projectName}
${techStackLine}
Dieses Projekt nutzt DevFlow fuer strukturierte, nachvollziehbare KI-Entwicklung.
Alle Regeln werden technisch vom MCP-Server erzwungen.

## Arbeitsstart

BEVOR du mit der Arbeit beginnst:

1. \`flow_list()\` \u2192 Finde einen freien Flow
2. \`devflow_init({ flowId: "<id>" })\` \u2192 Starte deine Session
   ODER
3. \`flow_create({ summary: "..." })\` \u2192 Erstelle einen neuen Flow

**Ohne \`devflow_init\` sind alle Tools blockiert.**

## Prozess

Der Server gibt dir bei jedem Schritt Anweisungen:
- **allowedActions** \u2192 welche Tools du nutzen darfst
- **nextStep** \u2192 was du als naechstes tun sollst

Folge den Anweisungen aus den Tool-Responses. Erlaubte Aktionen haengen vom
Flow-State ab und werden vom Server erzwungen.

## Flow-States

\`\`\`
idea \u2192 planning \u2192 approval \u2192 ready \u2192 in_progress \u2192 review \u2192 done
\`\`\`

Review-States (approval, review) sind Wartezustaende.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.

${generateStrictnessRules(s)}${MARKER_END}
`;
}

// src/templates/cursorrules.ts
var CURSORRULES_MARKER_START = "# --- DEVFLOW-RULES-START ---";
var CURSORRULES_MARKER_END = "# --- DEVFLOW-RULES-END ---";
function generateCursorrulesContent(projectName, techStack, strictness) {
  const coreContent = generateClaudeMdContent(projectName, techStack, strictness);
  return coreContent.replace(MARKER_START, CURSORRULES_MARKER_START).replace(MARKER_END, CURSORRULES_MARKER_END);
}

// src/templates/agents-md.ts
var AGENTS_MARKER_START = "<!-- DEVFLOW-RULES-START -->";
var AGENTS_MARKER_END = "<!-- DEVFLOW-RULES-END -->";
function generateAgentsMdContent(projectName, techStack, strictness) {
  return generateClaudeMdContent(projectName, techStack, strictness);
}

// src/templates/gemini-md.ts
var GEMINI_MARKER_START = "<!-- DEVFLOW-RULES-START -->";
var GEMINI_MARKER_END = "<!-- DEVFLOW-RULES-END -->";
function generateGeminiMdContent(projectName, techStack, strictness) {
  return generateClaudeMdContent(projectName, techStack, strictness);
}

// src/templates/windsurfrules.ts
var WINDSURFRULES_MARKER_START = "# --- DEVFLOW-RULES-START ---";
var WINDSURFRULES_MARKER_END = "# --- DEVFLOW-RULES-END ---";
function generateWindsurfrulesContent(projectName, techStack, strictness) {
  const coreContent = generateClaudeMdContent(projectName, techStack, strictness);
  return coreContent.replace(MARKER_START, WINDSURFRULES_MARKER_START).replace(MARKER_END, WINDSURFRULES_MARKER_END);
}

// src/setup/setup.ts
var DEFAULT_URL = "https://api.app.dev-flow.tech";
var SUPPORTED_CLIENTS = ["claude", "cursor", "codex", "gemini", "windsurf", "droid"];
var CLIENT_ALIASES = {
  "claude-code": "claude"
};
function log(msg) {
  process.stderr.write(msg + "\n");
}
function parseArgs() {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let client = "claude";
  let scope;
  let projectId;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      url = args[i + 1];
      i++;
    } else if (args[i] === "--client" && args[i + 1]) {
      const c = args[i + 1].toLowerCase();
      const resolved = CLIENT_ALIASES[c] || c;
      if (SUPPORTED_CLIENTS.includes(resolved)) {
        client = resolved;
      } else {
        log(`ERROR: Unknown client "${c}". Supported: ${SUPPORTED_CLIENTS.join(", ")}, claude-code`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--scope" && args[i + 1]) {
      const s = args[i + 1].toLowerCase();
      if (s === "project" || s === "global") {
        scope = s;
      } else {
        log(`ERROR: Unknown scope "${s}". Use "project" or "global".`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--project-id" && args[i + 1]) {
      projectId = args[i + 1];
      i++;
    }
  }
  if (!scope) {
    scope = client === "claude" ? "global" : "project";
  }
  return { url, client, scope, projectId };
}
function readJsonFile(filePath) {
  try {
    if (existsSync2(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
  } catch {
  }
  return {};
}
function writeJsonFile(filePath, data) {
  const dir = dirname(filePath);
  if (!existsSync2(dir)) mkdirSync2(dir, { recursive: true });
  writeFileSync2(filePath, JSON.stringify(data, null, 2) + "\n");
}
function getMcpServerEntry(wrapperPath, devflowUrl, client) {
  return {
    command: wrapperPath,
    args: [],
    env: {
      DEVFLOW_URL: devflowUrl,
      DEVFLOW_CLIENT: client
    }
  };
}
function setupClaude(wrapperPath, devflowUrl, _scope = "global") {
  log("[3/3] Configuring Claude Code MCP server...");
  try {
    execSync2("which claude", { stdio: "pipe" });
  } catch {
    log('ERROR: "claude" CLI not found. Please install Claude Code first.');
    process.exit(1);
  }
  try {
    execSync2("claude mcp remove devflow", { stdio: "pipe" });
  } catch {
  }
  const addCmd = `npx @anthropic-ai/claude-code mcp add devflow --scope user "${wrapperPath}" -e DEVFLOW_URL=${devflowUrl} -e DEVFLOW_CLIENT=claude`;
  try {
    execSync2(addCmd, { encoding: "utf-8", stdio: "inherit" });
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
    } else {
      throw error;
    }
  }
  log("      MCP server registered (user scope).");
  const claudeMd = join2(homedir2(), ".claude", "CLAUDE.md");
  try {
    const stat = readlinkSync(claudeMd);
    if (stat.includes("devflow-mcp") || stat.includes("workflow-pro-mcp")) {
      unlinkSync(claudeMd);
      log("      Removed old global CLAUDE.md symlink.");
    }
  } catch {
  }
}
function setupCursor(wrapperPath, devflowUrl, scope = "project") {
  log("[3/3] Configuring Cursor MCP server...");
  const configPath = scope === "project" ? join2(process.cwd(), ".cursor", "mcp.json") : join2(homedir2(), ".cursor", "mcp.json");
  const config = readJsonFile(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.devflow = getMcpServerEntry(wrapperPath, devflowUrl, "cursor");
  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
  if (scope === "project") {
    log("      Scope: This project only. Add .cursor/mcp.json to .gitignore.");
  } else {
    log("      Scope: All Cursor projects (global).");
  }
}
function setupCodex(wrapperPath, devflowUrl, _scope = "project") {
  log("[3/3] Configuring Codex MCP server...");
  const configPath = join2(homedir2(), ".codex", "config.toml");
  const dir = dirname(configPath);
  if (!existsSync2(dir)) mkdirSync2(dir, { recursive: true });
  let content = "";
  if (existsSync2(configPath)) {
    content = readFileSync(configPath, "utf-8");
  }
  content = content.replace(/\[mcp_servers\.devflow\][\s\S]*?(?=\[|$)/g, "");
  content = content.trimEnd();
  const tomlBlock = `

[mcp_servers.devflow]
command = "${wrapperPath}"
args = []

[mcp_servers.devflow.env]
DEVFLOW_URL = "${devflowUrl}"
DEVFLOW_CLIENT = "codex"
`;
  content += tomlBlock;
  writeFileSync2(configPath, content.trimStart() + "\n");
  log(`      Config written to: ${configPath}`);
}
function setupGemini(wrapperPath, devflowUrl, _scope = "project") {
  log("[3/3] Configuring Gemini CLI MCP server...");
  const configPath = join2(homedir2(), ".gemini", "settings.json");
  const config = readJsonFile(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.devflow = {
    ...getMcpServerEntry(wrapperPath, devflowUrl, "gemini"),
    timeout: 6e5
  };
  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
}
function setupWindsurf(wrapperPath, devflowUrl, scope = "project") {
  log("[3/3] Configuring Windsurf MCP server...");
  const configPath = scope === "project" ? join2(process.cwd(), ".windsurf", "mcp.json") : join2(homedir2(), ".codeium", "windsurf", "mcp_config.json");
  const config = readJsonFile(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.devflow = getMcpServerEntry(wrapperPath, devflowUrl, "windsurf");
  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
  if (scope === "project") {
    log("      Scope: This project only.");
  }
}
function setupDroid(wrapperPath, devflowUrl, scope = "project") {
  log("[3/3] Configuring Droid MCP server...");
  const configPath = scope === "project" ? join2(process.cwd(), ".droid", "mcp.json") : join2(homedir2(), ".droid", "mcp.json");
  const config = readJsonFile(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers.devflow = getMcpServerEntry(wrapperPath, devflowUrl, "droid");
  writeJsonFile(configPath, config);
  log(`      Config written to: ${configPath}`);
  if (scope === "project") {
    log("      Scope: This project only.");
  }
}
var INSTRUCTION_FILES = {
  claude: {
    fileName: "CLAUDE.md",
    generate: (name, tech) => generateClaudeMdContent(name, tech),
    markerStart: MARKER_START,
    markerEnd: MARKER_END
  },
  cursor: {
    fileName: ".cursorrules",
    generate: (name, tech) => generateCursorrulesContent(name, tech),
    markerStart: CURSORRULES_MARKER_START,
    markerEnd: CURSORRULES_MARKER_END
  },
  codex: {
    fileName: "AGENTS.md",
    generate: (name, tech) => generateAgentsMdContent(name, tech),
    markerStart: AGENTS_MARKER_START,
    markerEnd: AGENTS_MARKER_END
  },
  gemini: {
    fileName: "GEMINI.md",
    generate: (name, tech) => generateGeminiMdContent(name, tech),
    markerStart: GEMINI_MARKER_START,
    markerEnd: GEMINI_MARKER_END
  },
  windsurf: {
    fileName: ".windsurfrules",
    generate: (name, tech) => generateWindsurfrulesContent(name, tech),
    markerStart: WINDSURFRULES_MARKER_START,
    markerEnd: WINDSURFRULES_MARKER_END
  },
  droid: {
    fileName: "CLAUDE.md",
    generate: (name, tech) => generateClaudeMdContent(name, tech),
    markerStart: MARKER_START,
    markerEnd: MARKER_END
  }
};
function writeInstructionFile(client, projectName) {
  const config = INSTRUCTION_FILES[client];
  if (!config) return;
  const name = projectName || "DevFlow Project";
  const filePath = join2(process.cwd(), config.fileName);
  const content = config.generate(name);
  if (existsSync2(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    if (existing.includes(config.markerStart) && existing.includes(config.markerEnd)) {
      const startIdx = existing.indexOf(config.markerStart);
      const endIdx = existing.indexOf(config.markerEnd) + config.markerEnd.length;
      const updated = existing.substring(0, startIdx) + content + existing.substring(endIdx);
      writeFileSync2(filePath, updated);
      log(`      ${config.fileName} updated (rules section replaced).`);
      return;
    }
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync2(filePath, existing + separator + content);
    log(`      ${config.fileName} updated (rules appended).`);
    return;
  }
  writeFileSync2(filePath, content);
  log(`      ${config.fileName} created.`);
}
var CLIENT_LABELS = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex (OpenAI)",
  gemini: "Gemini CLI",
  windsurf: "Windsurf",
  droid: "Droid"
};
var CLIENT_SETUP = {
  claude: setupClaude,
  cursor: setupCursor,
  codex: setupCodex,
  gemini: setupGemini,
  windsurf: setupWindsurf,
  droid: setupDroid
};
var CLIENT_NEXT_STEPS = {
  claude: [
    "1. Restart Claude Code",
    "2. Open a project and use flow_list or devflow_init",
    "3. Browser opens for authentication (first time)"
  ],
  cursor: [
    "1. Restart Cursor",
    '2. Open Settings > Tools & MCP to verify "devflow" is listed',
    "3. Use @devflow in chat to access DevFlow tools"
  ],
  codex: [
    "1. Restart Codex CLI",
    "2. Run: codex --help to verify MCP servers are loaded",
    "3. DevFlow tools are available automatically"
  ],
  gemini: [
    "1. Restart Gemini CLI",
    "2. DevFlow tools are available automatically",
    "3. Use flow_list or devflow_init in your prompts"
  ],
  windsurf: [
    "1. Restart Windsurf",
    '2. Click MCPs icon in Cascade panel to verify "devflow" is listed',
    "3. DevFlow tools are available in Cascade"
  ],
  droid: [
    "1. Restart Droid",
    '2. Verify "devflow" MCP server is available',
    "3. DevFlow tools are available in chat"
  ]
};
async function setup() {
  const scriptDir = join2(import.meta.url.replace("file://", ""), "..", "..", "..");
  const distFile = join2(scriptDir, "dist", "index.js");
  const { url: devflowUrl, client, scope, projectId } = parseArgs();
  log(`=== DevFlow MCP Server Setup (${CLIENT_LABELS[client]}, ${scope}) ===`);
  log("");
  log("[1/3] Building MCP server...");
  if (!existsSync2(distFile)) {
    try {
      execSync2("npm run build", { cwd: scriptDir, stdio: "inherit" });
    } catch {
      log("ERROR: Build failed.");
      process.exit(1);
    }
  }
  if (!existsSync2(distFile)) {
    log(`ERROR: dist/index.js not found at ${distFile}`);
    process.exit(1);
  }
  log("      Build OK.");
  log("");
  log(`[2/3] DevFlow URL: ${devflowUrl}`);
  if (devflowUrl !== DEFAULT_URL) {
    log("      (custom URL via --url flag)");
  }
  const wrapperPath = installWrapper(distFile);
  log(`      Wrapper installed: ${wrapperPath}`);
  log("");
  CLIENT_SETUP[client](wrapperPath, devflowUrl, scope);
  writeInstructionFile(client, projectId);
  if (projectId) {
    const configPath = join2(process.cwd(), ".devflow.json");
    const config = {
      projectId,
      linkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    writeFileSync2(configPath, JSON.stringify(config, null, 2) + "\n");
    log("");
    log(`      Project linked: ${configPath}`);
    log(`      Project ID: ${projectId}`);
  }
  log("");
  log("=== Setup complete! ===");
  log("");
  log("Next steps:");
  for (const step of CLIENT_NEXT_STEPS[client]) {
    log(`  ${step}`);
  }
  log("");
}
setup().catch((error) => {
  log(`Setup failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
