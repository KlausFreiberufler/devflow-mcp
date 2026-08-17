// DF-532: `flow_create` darf einen laufenden Vorgang nicht verdrängen.
//
// Am 17.08.2026 gemessen: Während ein Abnehmer-Subagent arbeitete, wurden zwei
// Auffälligkeiten als Flows angelegt. Beide Antworten meldeten „Session
// gestartet" — und die laufende Abnehmer-Sitzung des ANDEREN Flows stand
// danach auf `abandoned` mit null Protokolleinträgen. Die Prüfarbeit hatte
// stattgefunden, nur ihr Nachweis war weg.
//
// Der erste Anlauf dieses Tests las den Quelltext und prüfte, ob bestimmte
// Wörter fehlen. Der Prüfer hat ihn mit fünf Mutationen vorgeführt: Vier
// gingen grün durch, darunter die entscheidende — der Aufruf zurück im Code,
// mit einem `// temp` am Zeilenende, das die Kommentar-Strippung die ganze
// Codezeile verschlucken ließ. Ein Test, der Text statt Verhalten misst, misst
// am Ende sich selbst.
//
// Deshalb jetzt gegen das Verhalten: echter Handler, gestubbter Client.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const aufrufe: Array<[string, unknown]> = [];

// Ein Proxy statt einer Methodenliste: Der Handler ruft mehr am Client auf,
// als dieser Test kennen will, und eine unvollständige Attrappe würde mit
// „is not a function" scheitern statt mit einer Aussage über das Verhalten.
// Jeder Aufruf wird aufgezeichnet; bekannte Namen liefern brauchbare Daten,
// alle anderen ein unauffälliges Erfolgsergebnis.
const antworten: Record<string, unknown> = {
  createFlow: { id: 'flow-NEU', displayId: 'DF-999', currentState: 'idea', ticketSummary: 'Probe' },
  createAgentSession: { id: 'sess-NEU' },
  getNextStep: { allowedActions: ['flow_update', 'flow_get'], nextStep: 'planen' },
};

vi.mock('../../src/api/client.js', () => ({
  devFlowClient: new Proxy({} as Record<string, unknown>, {
    get(_ziel, name: string) {
      if (name === 'then') return undefined; // nicht als Promise missverstehen
      return async (...args: unknown[]) => {
        aufrufe.push([name, args.length === 1 ? args[0] : args]);
        if (name === 'getLinkedProjectId') return 'projekt-1';
        return { success: true, data: antworten[name] ?? {} };
      };
    },
  }),
}));

const { tools: flowTools } = await import('../../src/tools/flow.js');
const { sessionContext } = await import('../../src/context/session.js');

function laufenderVorgang() {
  sessionContext.init({
    flow: { id: 'flow-ALT', displayId: 'DF-100', currentState: 'review' } as never,
    sessionId: 'sess-ECHT',
    startedAt: new Date().toISOString(),
    feedback: null,
    tasks: [],
    allowedActions: ['task_update', 'flow_update'],
    nextStep: 'pruefen',
  });
}

async function flowCreate() {
  return flowTools.flow_create.handler({ summary: 'Probe', description: 'x'.repeat(40), acceptanceCriteria: ['irgendein pruefbares Kriterium'] });
}

describe('flow_create legt an, ohne zu beanspruchen', () => {
  beforeEach(() => {
    aufrufe.length = 0;
    sessionContext.release();
  });

  it('startet keine Agent-Sitzung', async () => {
    await flowCreate();
    // Das Backend verdrängt beim Anlegen einer Sitzung die laufende — samt
    // ihres Protokolls, das den Nachweis einer Prüfung bildet.
    expect(aufrufe.map(([name]) => name)).not.toContain('createAgentSession');
  });

  it('lässt den neuen Flow als unbeansprucht stehen', async () => {
    await flowCreate();
    const update = aufrufe.find(([name]) => name === 'updateFlow');
    // 'analyzing' ließ einen frisch angelegten Flow als gesperrt erscheinen,
    // obwohl niemand an ihm arbeitete (flow.ts hängt das Schloss daran).
    expect(update?.[1]).toEqual(['flow-NEU', expect.objectContaining({ agentStatus: 'idle' })]);
  });

  it('lässt einen laufenden Vorgang in Ruhe — der Kern des Befunds', async () => {
    laufenderVorgang();
    await flowCreate();
    const ctx = sessionContext.get();
    expect(ctx?.flow?.id).toBe('flow-ALT');
    expect(ctx?.sessionId).toBe('sess-ECHT');
    // Sonst wird der Prüfer nach dem Festhalten einer Auffälligkeit an seinem
    // EIGENEN Vorgang ausgesperrt: allowedActions wären die des neuen Flows.
    expect(ctx?.allowedActions).toContain('task_update');
  });

  it('übernimmt, wenn niemand arbeitet — die Bequemlichkeit bleibt', async () => {
    await flowCreate();
    expect(sessionContext.get()?.flow?.id).toBe('flow-NEU');
  });

  it('sagt in der Antwort, was tatsächlich passiert ist', async () => {
    const mitLaufendem = (laufenderVorgang(), await flowCreate());
    expect(mitLaufendem).toContain('bleibt aktiv');
    expect(mitLaufendem).not.toContain('Session gestartet');

    sessionContext.release();
    aufrufe.length = 0;
    expect(await flowCreate()).toContain('übernommen');
  });
});
