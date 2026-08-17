// DF-531 (TDD RED): Die Protokoll-Ebenen von agent_session_log.
//
// Das Schema bot `warn` an, die Datenbank nimmt es nicht. Gegenprobe an der
// laufenden API:
//
//   Error: CHECK constraint failed: level IN ('debug', 'info', 'warning', 'error')
//
// Zwei Werte klafften auseinander: `warn` war anwählbar, aber nie speicherbar;
// `debug` war speicherbar, aber nicht anwählbar. Der Fehler kam als gewöhnliche
// Werkzeugantwort zurück, nicht als Abbruch — wer den Rückgabewert nicht liest,
// schließt die Sitzung ohne den Eintrag ab, den er geschrieben zu haben glaubt.
// Passiert am 17.08.2026, ausgerechnet beim Protokollieren eines Prüfurteils.

import { describe, expect, it } from 'vitest';
import { PROTOKOLL_EBENEN, normalisiereEbene } from '../../src/tools/agent-session.js';

// Die Quelle der Wahrheit liegt im Backend, nicht hier — deshalb mit
// Fundstelle statt als Zahl ohne Herkunft:
//   devflow/backend/src/database/db.js:345
//   devflow/backend/src/database/schema.sql:303
//     level TEXT CHECK(level IN ('debug', 'info', 'warning', 'error')) DEFAULT 'info'
const VON_DER_DATENBANK_AKZEPTIERT = ['debug', 'info', 'warning', 'error'];

describe('Protokoll-Ebenen', () => {
  it('bietet genau die Werte an, die die Datenbank auch annimmt', () => {
    expect([...PROTOKOLL_EBENEN].sort()).toEqual([...VON_DER_DATENBANK_AKZEPTIERT].sort());
  });

  it('bildet warn auf warning ab, statt es scheitern zu lassen', () => {
    // Wer `warn` schickt, meint eine Warnung. Die Ablehnung war ein Fehler,
    // kein Vertrag — also wird der Wert übersetzt, nicht zurückgewiesen.
    expect(normalisiereEbene('warn')).toBe('warning');
  });

  it('lässt die vier gültigen Werte unverändert durch', () => {
    for (const ebene of VON_DER_DATENBANK_AKZEPTIERT) {
      expect(normalisiereEbene(ebene)).toBe(ebene);
    }
  });

  it('fängt Unbekanntes bei info ab, statt es an die Constraint durchzureichen', () => {
    // Ein durchgereichter Fantasiewert erzeugt genau den stillen Fehlschlag,
    // um den es hier geht. Lieber die falsche Ebene als ein verlorener Eintrag.
    expect(normalisiereEbene('kritisch')).toBe('info');
    expect(normalisiereEbene('')).toBe('info');
    expect(normalisiereEbene(undefined)).toBe('info');
  });
});
