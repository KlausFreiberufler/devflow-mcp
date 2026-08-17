// DF-532: `flow_create` darf keine Agent-Sitzung starten.
//
// Am 17.08.2026 gemessen: Während ein Abnehmer-Subagent an einem Vorgang
// arbeitete, wurden zwei Auffälligkeiten als Flows angelegt. Beide Antworten
// meldeten „Flow erstellt und Session gestartet" — und die laufende
// Abnehmer-Sitzung des ANDEREN Flows stand danach auf `abandoned` mit null
// Protokolleinträgen. Das Backend verdrängt beim Anlegen einer Sitzung die
// laufende. Die Prüfarbeit hatte stattgefunden, nur ihr Nachweis war weg.
//
// Dieser Test liest die Quelle, statt den Handler auszuführen: Der Handler
// spricht mit dem Backend, und ein Verhaltenstest bräuchte einen gemockten
// Client samt Session-Lebenszyklus. Was hier zählt, ist eine Regression, die
// niemandem auffällt — dass jemand den Aufruf beim Aufräumen zurückbringt.
// Ein Strukturtest fängt genau das, und er ist ehrlich darin, was er kann:
// Er beweist die Abwesenheit des Aufrufs, nicht das Laufzeitverhalten.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = readFileSync(resolve(hier, '../../src/tools/flow.ts'), 'utf8');

/**
 * Der Rumpf von handleFlowCreate — ohne die übrigen Handler und **ohne
 * Kommentare**.
 *
 * Das Strippen ist nicht kosmetisch: Beim ersten Anlauf war dieser Test rot,
 * weil die Erklärung im Code die Wörter enthielt, deren Abwesenheit er prüfen
 * sollte. Ein Test, der Text statt Verhalten misst, muss wenigstens den Text
 * messen, auf den es ankommt.
 */
function rumpfVonFlowCreate(): string {
  const start = quelle.indexOf('async function handleFlowCreate');
  expect(start).toBeGreaterThan(-1);
  const naechster = quelle.indexOf('\nasync function ', start + 1);
  const roh = quelle.slice(start, naechster === -1 ? undefined : naechster);
  return roh
    .replace(/\/\*[\s\S]*?\*\//g, '') // Blockkommentare
    .replace(/^[^\n]*?\/\/.*$/gm, ''); // Zeilenkommentare (auch am Zeilenende)
}

describe('flow_create legt an, ohne zu beanspruchen', () => {
  it('startet keine Agent-Sitzung', () => {
    // Sonst verdrängt das Backend eine laufende Sitzung an einem anderen
    // Vorgang — samt ihres Protokolls, das den Nachweis einer Prüfung bildet.
    expect(rumpfVonFlowCreate()).not.toContain('createAgentSession');
  });

  it('lässt den neuen Flow als unbeansprucht stehen', () => {
    const rumpf = rumpfVonFlowCreate();
    expect(rumpf).toContain("agentStatus: 'idle'");
    // 'analyzing' ließ einen frisch angelegten Flow in flow_list als gesperrt
    // erscheinen, obwohl niemand an ihm arbeitete.
    expect(rumpf).not.toContain("agentStatus: 'analyzing'");
  });

  it('behauptet in der Antwort keine Sitzung, die es nicht gibt', () => {
    const rumpf = rumpfVonFlowCreate();
    expect(rumpf).not.toContain('Session gestartet');
    expect(rumpf).toContain('devflow_init');
  });
});
