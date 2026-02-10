/**
 * CLAUDE.md Template Generator
 *
 * Generates project-specific CLAUDE.md content with DevFlow rules.
 * The template includes all flow states, mandatory processes, and guardrails.
 */

export const MARKER_START = '<!-- DEVFLOW-RULES-START -->';
export const MARKER_END = '<!-- DEVFLOW-RULES-END -->';

/**
 * Generate CLAUDE.md content with project-specific information
 */
export function generateClaudeMdContent(projectName: string, techStack?: string): string {
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
idea → planning → plan_review → progress → code_review → testing → done
\`\`\`

Review-States (plan_review, code_review, testing) sind Wartezustaende.
Der User muss in der DevFlow-UI genehmigen bevor es weitergeht.
${MARKER_END}
`;
}
