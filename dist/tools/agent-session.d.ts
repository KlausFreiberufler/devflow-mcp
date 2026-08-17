/**
 * Agent Session MCP Tools
 * Tools for creating, logging, completing, and listing agent sessions in DevFlow
 */
import type { ToolModule } from '../tools/registry.js';
/**
 * Die Protokoll-Ebenen, die der Speicher tatsächlich annimmt (DF-531).
 *
 * Quelle der Wahrheit ist die CHECK-Constraint im Backend:
 *   backend/src/database/db.js:345 und schema.sql:303
 *     level TEXT CHECK(level IN ('debug', 'info', 'warning', 'error'))
 *
 * Vorher standen hier drei andere Werte. `warn` war anwählbar, aber nie
 * speicherbar; `debug` war speicherbar, aber nicht anwählbar. Der laut Schema
 * korrekte Aufruf scheiterte — als gewöhnliche Werkzeugantwort, nicht als
 * Abbruch. Wer den Rückgabewert nicht liest, schließt die Sitzung ohne den
 * Eintrag ab, den er geschrieben zu haben glaubt.
 *
 * Deshalb eine benannte Konstante: Schema und Normalisierung werden aus
 * derselben Quelle gespeist, damit sie nicht wieder auseinanderlaufen.
 */
export declare const PROTOKOLL_EBENEN: readonly ["debug", "info", "warning", "error"];
export type ProtokollEbene = (typeof PROTOKOLL_EBENEN)[number];
/**
 * Bringt einen Ebenen-Wert in eine Form, die der Speicher annimmt (DF-531).
 *
 * `warn` wird übersetzt statt zurückgewiesen: Wer es schickt, meint eine
 * Warnung — die Ablehnung war ein Fehler, kein Vertrag. Alles Unbekannte
 * fällt auf `info` zurück, denn ein durchgereichter Fantasiewert erzeugt
 * genau den stillen Fehlschlag, um den es hier geht. Lieber die ungenauere
 * Ebene als ein verlorener Eintrag.
 */
export declare function normalisiereEbene(wert: string | undefined): ProtokollEbene;
export declare const tools: ToolModule;
