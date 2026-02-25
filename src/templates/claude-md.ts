/**
 * CLAUDE.md Template Generator
 *
 * Generates project-specific CLAUDE.md content with DevFlow rules.
 * The template includes all flow states, mandatory processes, and guardrails.
 * Strictness levels control the rule text that gets generated.
 */

import {
  type StrictnessConfig,
  DEFAULT_STRICTNESS,
  STRICTNESS_LABELS,
} from '../config/types.js';

export const MARKER_START = '<!-- DEVFLOW-RULES-START -->';
export const MARKER_END = '<!-- DEVFLOW-RULES-END -->';

export const GUIDELINES_MARKER_START = '<!-- PROJECT-GUIDELINES-START -->';
export const GUIDELINES_MARKER_END = '<!-- PROJECT-GUIDELINES-END -->';

// ============ Strictness Rule Text Templates ============

const FLOW_REQUIRED_RULES: Record<number, string> = {
  1: '',
  2: 'Flow erstellen waere gut, ist aber optional.',
  3: 'Erstelle einen Flow bevor du arbeitest.',
  4: 'Du MUSST einen Flow erstellen. Weise den User darauf hin wenn keiner existiert.',
  5: 'NIEMALS ohne Flow arbeiten. WEIGERE dich Code zu aendern ohne aktiven Flow.',
};

const PLAN_REQUIRED_RULES: Record<number, string> = {
  1: 'Du kannst direkt implementieren ohne Plan.',
  2: 'Fasse kurz zusammen was du vorhast.',
  3: 'Erstelle einen Plan, warte aber nicht zwingend auf Approval.',
  4: 'Erstelle IMMER einen detaillierten Plan und warte auf User-Approval.',
  5: 'Erstelle einen detaillierten Plan mit Acceptance Criteria. Der Plan MUSS vom User genehmigt werden.',
};

const TASK_TRACKING_RULES: Record<number, string> = {
  1: 'Tasks sind nicht noetig.',
  2: 'Tasks sind optional, koennen aber helfen.',
  3: 'Erstelle Tasks und update ihren Status waehrend der Arbeit.',
  4: 'Du MUSST Tasks anlegen und jeden einzeln auf doing/done setzen.',
  5: 'Tasks mit Acceptance Criteria sind Pflicht. Jeder Task muss einzeln abgehakt werden bevor du zu Review wechselst.',
};

const GIT_DISCIPLINE_RULES: Record<number, string> = {
  1: 'Committe wie du moechtest.',
  2: 'Folge grob den Git-Konventionen.',
  3: 'Halte Branch-Naming und Commit-Format ein.',
  4: 'Branch + Commits muessen gemeldet werden. PR mit Template erstellen.',
  5: 'Streng nach Git-Settings. Branch, Commits und PR-URL muessen gemeldet werden. PR-Review vor Merge.',
};

const REVIEW_REQUIRED_RULES: Record<number, string> = {
  1: 'Kein Review noetig, du kannst direkt abschliessen.',
  2: 'Fasse zusammen was du gemacht hast.',
  3: 'Mache Self-Review (Diff pruefen, Findings fixen).',
  4: 'Self-Review + Testing-Instructions erstellen. User muss in der UI genehmigen.',
  5: 'Vollstaendiges Review mit agentSummary und testingInstructions. User muss testen und explizit genehmigen.',
};

const DOCS_UPDATE_RULES: Record<number, string> = {
  1: '',
  2: 'Pruefe bei Review ob Docs betroffen sind.',
  3: 'Pruefe relevante Docs und aktualisiere sie bei Bedarf.',
  4: 'Du MUSST relevante Docs pruefen. Nutze GET /api/docs/relevant um betroffene Seiten zu finden.',
  5: 'Vor jedem Review MUSST du alle relevanten Docs pruefen und aktualisieren (EN + DE). Docs-Commit ist Pflicht.',
};

function formatLevel(level: number): string {
  const info = STRICTNESS_LABELS[level] || STRICTNESS_LABELS[3];
  return `${info.emoji} ${info.label}`;
}

/**
 * Generate strictness rules block for CLAUDE.md
 */
function generateStrictnessRules(s: StrictnessConfig): string {
  const rules: string[] = ['## Regeln (Strictness-Level)', ''];

  const sections: { title: string; key: keyof StrictnessConfig; rules: Record<number, string> }[] = [
    { title: 'Flow-Pflicht', key: 'flowRequired', rules: FLOW_REQUIRED_RULES },
    { title: 'Planungs-Pflicht', key: 'planRequired', rules: PLAN_REQUIRED_RULES },
    { title: 'Task-Tracking', key: 'taskTracking', rules: TASK_TRACKING_RULES },
    { title: 'Git-Disziplin', key: 'gitDiscipline', rules: GIT_DISCIPLINE_RULES },
    { title: 'Review-Pflicht', key: 'reviewRequired', rules: REVIEW_REQUIRED_RULES },
    { title: 'Docs-Update', key: 'docsUpdate', rules: DOCS_UPDATE_RULES },
  ];

  for (const section of sections) {
    const level = s[section.key];
    const ruleText = section.rules[level] || section.rules[3];
    if (!ruleText) continue; // Skip empty rules (e.g., flowRequired level 1)
    rules.push(`### ${section.title}: ${formatLevel(level)}`);
    rules.push(ruleText);
    rules.push('');
  }

  return rules.join('\n');
}

/**
 * Generate CLAUDE.md content with project-specific information
 */
export function generateClaudeMdContent(
  projectName: string,
  techStack?: string,
  strictness?: StrictnessConfig,
): string {
  const s = strictness || DEFAULT_STRICTNESS;
  const techStackLine = techStack
    ? `**Tech-Stack:** ${techStack}\n`
    : '';

  return `${MARKER_START}
# DevFlow - Strukturierte KI-Entwicklung

**Projekt:** ${projectName}
${techStackLine}
Dieses Projekt nutzt DevFlow fuer strukturierte, nachvollziehbare KI-Entwicklung.
Alle Regeln werden technisch vom MCP-Server erzwungen.

## Arbeitsstart

BEVOR du mit der Arbeit beginnst:

1. \`flow_list()\` → Finde einen freien Flow
2. \`devflow_init({ flowId: "<id>" })\` → Starte deine Session
   ODER
3. \`flow_create({ summary: "..." })\` → Erstelle einen neuen Flow

**Ohne \`devflow_init\` sind alle Tools blockiert.**

## Prozess

Der Server gibt dir bei jedem Schritt Anweisungen:
- **allowedActions** → welche Tools du nutzen darfst
- **nextStep** → was du als naechstes tun sollst

Folge den Anweisungen aus den Tool-Responses. Erlaubte Aktionen haengen vom
Flow-State ab und werden vom Server erzwungen.

## Flow-States

\`\`\`
idea → planning → approval → ready → in_progress → review → done
\`\`\`

Review-States (approval, review) sind Wartezustaende.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.

${generateStrictnessRules(s)}${MARKER_END}
`;
}

/**
 * Generate a guidelines block wrapped in markers.
 * Returns empty string if guidelines are empty/null.
 */
export function generateGuidelinesBlock(guidelines: string): string {
  if (!guidelines || !guidelines.trim()) {
    return '';
  }

  return `${GUIDELINES_MARKER_START}
## Projekt-Richtlinien

${guidelines.trim()}
${GUIDELINES_MARKER_END}
`;
}
