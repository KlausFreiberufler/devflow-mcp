# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.45.0] - 2026-08-31

### Changed (DF-535)

- **`devflow-code-critic` prüft nicht mehr sich selbst — es holt frische Augen.** Der Skill war eine Selbst-Kritik: vor `in_progress → review` setzte derselbe Agent den Prüfer-Hut auf und ging seinen eigenen Diff durch. Eine Prüfung im Kontextfenster des Autors erbt dessen Begründung aber als Prämisse, statt sie zu testen — der **Anker-Effekt**. Der Belegfall steht in DF-520: Die Selbst-Prüfung gab zweimal grün, der Mensch lehnte zweimal ab (R1, R2), und erst in Runde 3 fragte jemand die Prämisse „`CronExpressionParser.parse()` prüft den Ausdruck" nach. Sie stimmt nicht — ein nacktes `'L'` im Wochentag-Feld parst sauber und wirft erst beim ersten `.next()`, ein einziges `PUT` persistierte damit einen kaputten Cron und das betroffene Ritual antwortete danach dauerhaft mit 500.
- **Neuer Hauptmodus: Fresh-Context-Dispatch.** 2–3 **nur lesende** Prüfer-Subagenten (Agent/Task-Tool, Agent-Typ ohne `Edit`/`Write`, z. B. `feature-dev:code-reviewer` oder `Explore`), je eine Linse, parallel: `correctness` (jedes AC wirklich umgesetzt, Diff gegen genehmigten Plan — Dimensionen 1·5·7), `security` (Security-Hygiene-Checkliste der CLAUDE.md gegen den Diff — 4·7), `does-it-reproduce` (wurden die Tests **ausgeführt**, halten die Assertions einer Regression stand — 2). Die 7 Qualitätsdimensionen bleiben unverändert; es ändert sich nur, *wer antwortet*.
- **Kontextgrenze als Iron Law.** In den Dispatch-Prompt dürfen Diff, Acceptance Criteria wörtlich, Plan-Auszug und Repo-Pfad. Annahmen, Begründungen, Selbsteinschätzung, das eigene Urteil aus einer früheren Iteration und bereits verworfene Befunde dürfen **nie** — genau dieser Anker ließ DF-520 R3 zwei Selbst-Prüfungen überleben. Neu als Anti-Patterns benannt: „leaking the anchor", „dispatching a writer" (ein Kritiker mit Schreibrechten prüft seinen eigenen Fix nicht mehr), „fake fresh-context" und „blind acceptance" (Anti-Pattern-Liste 4 → 8). Iron Laws des Skills 5 → 7.
- **Beim Autor bleiben** Dimension 3 (Iron-Laws: TDD RED-first, Pattern-Reuse, extend > dismiss), Dimension 6 (Knowledge-Drafts) und die **Triage**: Jeder Befund läuft durch `devflow-receiving-review` — Critical/Important/Minor, technisch verifiziert, angenommen oder mit Begründung abgelehnt. Nie blind annehmen (ein frischer Prüfer kennt die Flow-Historie nicht und meldet manchmal gewolltes Verhalten), nie blind ablehnen. Subagenten melden, sie reparieren nie.
- **Verdict trägt jetzt `review_mode` + `reviewers[]`**, jeder Befund zusätzlich `source_lens`, `location` und `repro`. Ein `high`-Befund ohne `repro`-Befehl ist ein Verdacht, kein Befund. Ab Iteration 2 werden **nur die Linsen mit High-Findings** neu gestartet; triviale Flows (≤ 2 Tasks, keine Schema-Änderung, kein neuer Endpoint) gehen weiterhin über `approved-trivial` raus — ganz ohne Dispatch.
- **Fallback für Clients ohne Subagenten-Tool** (ADR-135, 3-Tier-Support: Codex/Gemini Tier 1, Cursor/Cline Tier 2, Windsurf/Continue Tier 3): Dort degradiert der Skill auf die alte Kritiker-Persona-Selbstprüfung — und muss sie **erklären**: `{ "review_mode": "self-persona-fallback", "reviewers": [] }`. Der Slug ist mit Absicht greppbar und macht den schwächeren Modus über Flows hinweg auditierbar. Keine Lust auf den Dispatch ist kein Fallback-Grund. Die Prüfung ist fähigkeits-, nicht namensbasiert: Bekommt ein Client ein Subagenten-Tool, gilt wieder `fresh-context`.
- **`scripts/pre-flow-update-code-critic.js`** führt den Hinweis vor der `review`-Transition jetzt mit dem Dispatch an (Linsen, Kontextgrenze mit ✓/✗-Liste, „Subagenten melden, sie reparieren nie") und nennt den Fallback als Ausnahme statt als Normalfall. **`devflow-receiving-review`** trägt den Gegenverweis: Der Kritiker ist die Hauptquelle der Befunde, am Triage-Prozess selbst ändert sich nichts — ein Subagenten-Befund wird behandelt wie ein menschlicher.

### Abgrenzung (DF-535)

Der Dispatch ersetzt **nicht** die Engine-Gates der Factory-App (QA + Faktencheck laufen headless, *nachdem* der Builder fertig meldet, ohne MCP-Config, und blockieren die Merge-Kette; der Kritiker läuft *vorher*, in der Sitzung des Autors, und ist beratend) und er ist **nicht** `devflow-subagent-driven-dev` (DF-424/DF-427, `status: draft`, nicht aktiv — dort schreiben Sub-Agenten Code in isolierten Worktrees). Der Kritiker-Dispatch hängt an keiner der beiden Strecken: Er braucht nur einen Nur-Lese-Agent-Typ.

### Docs (DF-535)

- `docs/FRESH_CONTEXT_CRITIC_DF535.md` + `docs/FRESH_CONTEXT_CRITIC_DF535.de.md` — Motivation samt Belegfall DF-520 R3, Dispatch-Kontrakt, die drei Linsen, Fallback-Matrix nach ADR-135-Tiers und die Abgrenzung zu Engine-Gates und `devflow-subagent-driven-dev`. Die Docs liegen bewusst **hier** und nicht im devflow-Repo: Die Änderung liegt vollständig in diesem Repo (Skill, Hook, Tests, `index.json`) und geht als ein PR raus; das devflow-Repo behält seine CLAUDE.md-Steckbrief-Konvention (DF-307).

Nebenbefund beim Regenerieren von `packages/skills/index.json`: Der Iron-Law-Zähler für `devflow-subagent-driven-dev` stand auf 5, sein Frontmatter auf 8. Der Rebuild zieht das auf 8 nach — der Skill selbst (weiterhin `status: draft`) wird von DF-535 nicht angefasst, nur seine abgedriftete Index-Zeile.

Verhaltenstests: `scripts/tests/df535-fresh-context-critic.test.js` (7 — Linsen, Kontextgrenze, Fallback-Sektion mit ADR-135, Triage-Übergabe, Hook-stdout, Gegenverweis, Verdrahtung in `npm test`). Suite gesamt: 166 `node --test`-Tests (vorher 159) und 83 vitest-Tests, alles grün.

## [4.44.0] - 2026-08-29

### Fixed (DF-543)

- **Abgelehnte Zugangsdaten führen jetzt zum Neu-Login statt in eine Sackgasse.** Ein auf der Platte gefundener Token wurde ungeprüft zurückgegeben — und sein Ablaufdatum stammte aus dieser Datei selbst: geschrieben als „ein Jahr", während der Server API-Token seit DF-162 nach **90 Tagen** zurückzieht. Ab Tag 91 bürgte die Datei also für einen Token, den der Server längst verworfen hatte: jeder Aufruf scheiterte mit 401, und weil `loadCredentials` Erfolg meldete, erreichte `getToken` nie den Browser-Login. Die CLI hielt sich für verbunden und war nicht davon abzubringen. Das traf **jeden Nutzer 90 Tage nach seinem ersten Connect** (live aufgetreten 2026-08-29 auf einem zweiten Rechner, der Monate zuvor lief).
- Ein gefundener Token wird jetzt gegen `GET /api/projects` geprüft (seit DF-459 für `api`- wie `mcp`-Scope erreichbar). Die Entscheidung liegt in der reinen `decideStoredTokenAction`: **nur eine ausdrückliche Ablehnung** (401/403) verwirft die Datei und startet den Browser-Login. Netzfehler und 5xx behalten den Token — der Server konnte nicht antworten, das heißt nicht, dass der Token schlecht ist; sonst erzwänge man ausgerechnet während eines Ausfalls einen Browser-Login.
- `DEVFLOW_TOKEN` aus der Umgebung wird weder geprüft noch verworfen — der Nutzer hat ihn ausdrücklich gesetzt.
- `saveCredentials` übernimmt das echte Ablaufdatum, das das Backend jetzt an `/api/auth/cli/token` mitliefert; fehlt es (ältere Backends), gilt `DEFAULT_TOKEN_LIFETIME_MS` = 90 Tage statt 365.

Verhaltenstests: `tests/auth/expired-token-relogin.test.ts` (10), Suite gesamt 83. Das Backend-Gegenstück (Feld `tokenExpiresAt`) ist im devflow-Repo gemergt; ältere Server ohne das Feld funktionieren unverändert.

## [4.43.1] - 2026-08-17

### Fixed (DF-531)

- **`agent_session_log` verliert keine Einträge mehr an die Datenbank-Constraint.** Das Schema bot `warn` an, die Datenbank nimmt nur `debug/info/warning/error` — der laut Schema korrekte Aufruf scheiterte als gewöhnliche Werkzeugantwort, und wer sie nicht las, schloss die Sitzung ohne den Eintrag ab. Jetzt speist eine Konstante Schema **und** Normalisierung (`warn` → `warning`, Groß-/Kleinschreibung toleriert, Unbekanntes fällt auf `info` statt an die Constraint). Auch der Auto-Logger schickte bei jedem BLOCKED-Eintrag rohes `warn` und verlor ihn **spurlos** (das `.catch()` feuert bei `{success:false}` nie) — behoben.

### Fixed (DF-532)

- **`flow_create` verdrängt keine laufende Arbeit mehr.** Vorher startete es beim Anlegen eine Agent-Sitzung (das Backend räumt dabei die laufende ab — gemessen: eine fremde Prüf-Sitzung stand danach auf `abandoned` mit 0 Protokolleinträgen) und meldete „Session gestartet". Jetzt: Läuft ein Vorgang, bleiben Kontext und Sitzung unberührt, und die Antwort verweist auf `devflow_init`. Läuft keiner, wird übernommen **samt** Sitzung — sonst schriebe der Agent protokolllos weiter. Neu angelegte Flows stehen auf `idle` statt `analyzing` (kein falsches 🔒 in `flow_list`). Dazu: `registry.ts` pingt `touchSessionActivity` nicht mehr gegen den `local-session`-Platzhalter (lautloser 404, fror `last_activity_at` der echten Sitzung ein).

### Anmerkung zu den Änderungen (4.43.1)

Beide Fixes wurden von unabhängigen Prüf- und Abnahme-Läufen begleitet; die Verhaltenstests (`tests/tools/agent-session-level.test.ts`, `tests/tools/flow-create-ohne-sitzung.test.ts`) ersetzen bewusst Quelltext-Prüfungen, die sich als mutationsblind erwiesen hatten.

## [4.42.0] - 2026-07-09

### Fixed (DF-477)

- **`knowledge_draft_accept` / `knowledge_draft_reject` scheitern jetzt laut statt irreführend.** Der MCP-Layer erzwingt das Tool-Schema nicht; ein Call mit dem naheliegenden falschen Parameternamen `draftId` schickte `id=undefined` in die Backend-URL und kam als "Draft not found" zurück (live getroffen in DF-476). Neu: `id ?? draftId` wird akzeptiert (Alias), und bei fehlender Id gibt es einen klaren "id is required"-Fehler **bevor** irgendein Backend-Call passiert.

## [4.38.0] - 2026-06-18

### Fixed (DF-434)

- **Self-approval / auto-approve repariert — die Plugin-Hooks waren in echten Sessions tot.** Alle 7 `flow_update`/`flow_create`-Hooks (`scripts/pre-flow-update-*.js`, `post-flow-update.js`, `pre-flow-create-validate.js`) lasen `payload.tool`, aber Claude Code sendet im PreToolUse-Payload `tool_name`. Folge: jeder Hook no-oppte still — Self-Approval-Hinweis, knowledge-auto-resolve, adr-compliance, plan/code-critic und flow-create-validate feuerten nie. Fix: `payload.tool_name ?? payload.tool` (Fallback für synthetische Caller). Die Hook-Tests prüfen jetzt das echte `tool_name`-Protokoll (vorher `{tool}`, weshalb der Bug unentdeckt blieb).
- **`flow_update` 403-Gate-Handler verzweigt jetzt nach `gate.reason`.** Vorher sagte er bei JEDEM 403 „requires human action / wait / Do NOT retry" — auch wenn nur Discipline-Tokens fehlten. Neu: `discipline_incomplete` / `discipline_token_evidence_invalid` zeigen `requiredSkills` + `hint` und „emit tokens, then retry"; nur `human_required` heißt stop-and-wait.
- **`devflow_init` rendert den Self-Approval-Modus explizit** (`🟢 Self-Approval: ON/OFF`), abgeleitet aus `transitionPolicy`. Der `devflow-core`-Skill verwies auf ein `allowSelfApproval`-Feld, das die Antwort nie enthielt → der Agent fiel auf den Default „human-only" zurück.
- **Skill-Drift behoben: korrekte HARDCODED_REQUIRED_SKILLS** (`devflow-core`, `devflow-planning`, `devflow-verification-gate`) — approval = 4 (collision-acknowledged/pattern-reuse/tdd/knowledge-completer), testing = 4 (verification-gate/adr-compliance/plan-reconciliation/knowledge-completer). Vorher 3+2 → zu wenige Tokens emittiert.
- **`.devflow-active` trägt jetzt `projectId` + `apiBase`** (`src/context/session.ts`), und die API-Hooks lesen den Token aus `~/.devflow/credentials.json` (neue `scripts/lib/hook-auth.js`) — ohne diese Felder erreichten knowledge-auto-resolve / adr-compliance / self-approval ihren Backend-Call nie. Der Token wird bewusst NICHT in die Repo-lokale Datei geschrieben.

### Removed (DF-434)

- **`project_guidelines_get` / `project_guidelines_update` entfernt** — beide riefen `GET/PATCH /api/projects/:id/guidelines` auf, einen Endpoint, den das Backend nie hatte (404). Vestigial seit der `/knowledge`-Deprecation.

### Notes

- Vereinheitlicht die Versions-Achsen: package.json / MCP_VERSION (zuletzt 4.35.0) und plugin.json (zuletzt 4.37.0) stehen jetzt beide auf 4.38.0.

## [4.37.0] - 2026-05-22

### Added (DF-432)

- **`flow_update` rendert 409 Gate-Failures jetzt strukturiert.** Bis 4.36.0 verschluckte `src/tools/flow.ts` die wertvollen Details aus `gate.failures[]` (DF-374 unified-gate-shape) und gab nur `Error: Gate blocked: N conditions failed` zurück. Der Agent sah keinen `reason`, kein `hint`, keine `openTasks` und keine `validationErrors`. Neu: jeder Failure wird als markdown-Bullet ausgegeben mit `label`, `reason`, `hint` und allen strukturierten Extras. Die alte DF-292 / 403-Self-Approval-Shape bleibt unverändert. Konkrete UX-Verbesserung am POE/WF-85 Bug-Report aus dem DF-430-Audit. Neue exportierte pure-function `renderGateFailures` in `src/tools/flow.ts` mit 10 unit-tests.

## [4.36.0] - 2026-05-22

### Fixed (DF-430)

- **`devflow-planning` Skill** — Plan-Template `## Acceptance Criteria` und `## Verification` auf das fett-markierte Format `- **AC-N:** <text>` umgestellt. Der Backend-Parser `parseAcceptanceCriteria` (`backend/src/services/flowGate.js:56`) erwartet genau dieses Format; das alte Checkbox-Format `- [ ] AC-1: …` wurde still ignoriert, wodurch die Auto-Generate-Tasks-aus-AC-Fallback in `tasksRequired` (DF-374) beim `planning → approval`-Submit nie griff. Symptom: 409 `no_tasks_no_ac_in_plan` mit kryptischem Hint trotz vorhandener ACs im Plan.

### Added (DF-430)

- **`devflow-executing` Skill** — neue Section `## Step 0 — Prepare Tasks (run before the Execution Loop)`. Beschreibt explizit, wie der Agent aus dem approved Plan via `task_create` Tasks anlegt, wenn die `task_list` leer ist (preferred: aus `## Tasks`-Plan-Sektion, fallback: per AC). Schließt die Lücke, durch die der Agent bei leerer Task-Liste in `in_progress` ratlos pausierte und der `tasksRequired` / `tasksAllCompleted`-Gate (DF-374 + DF-416) später schwer diagnostizierbar blockte.

## [4.35.0] - 2026-05-21

### Added (DF-420 Welle 1 Paket D + DF-422 + DF-424 Skeleton)

- **`devflow-draft-triage` Skill** (NEU) — flow_state: review, optional: false. Triagiert pending Drafts vor `review→done` mit Iron Law extend > dismiss. Worked Example aus DF-419 (17 Drafts → 0 pending). Verhindert dass das `no-pending-drafts` Gate beim review→done unerwartet feuert.
- **`devflow-subagent-driven-dev` Skill** (NEU, Draft-Skeleton via DF-424) — status: draft, optional: true. Wartet auf RFC-Sign-off (siehe `docs/RFC_SUBAGENT_DF424.md` im backend-repo). Nicht aktiv.
- **`devflow-planning` Skill** verschärft (DF-420 Paket C) — happy-path Step ergänzt: expliziter `knowledge_check_flow({flowId})`-Aufruf VOR `flow_update({currentState: 'approval'})`. Vorher nur reaktiv via Hook, jetzt sichtbar im Skill-Body.

### Changed (DF-420 Paket E + DF-422)

- **`pre-flow-update-knowledge-auto-resolve.js`** zeigt jetzt zusätzlich Topic-Vorschau: `✨ Wiki auto-resolved: 3 extend, 1 draft — topics: auth, payment, …`. Vorher nur counts. Damit sieht der Agent WAS resolved wurde, nicht nur wie viele.
- **`pre-flow-update-self-approval.js`** (DF-323 Hook) gibt jetzt zusätzlich eine `💡 Read Iron Laws:`-Zeile mit den `packages/skills/skills/{name}/SKILL.md`-Pfaden aus. Damit kann der Agent die Iron Laws direkt nachlesen, nicht nur die Skill-Namen lesen.

### Notes

- Companion-Server-side: DF-420 Paket A/B (Backend `pendingWorkHints` + `wikiHint` bei `flow_create`) — backend-only PR, kein Plugin-impact. Sichtbar in `POST /api/flows` 201-Response.
- DF-425 (RFC Option 2) ist Backend-only. Plugin unverändert davon.

## [4.34.0] - 2026-05-21

### Added (DF-415)

- **Neuer Plugin-Hook `pre-flow-update-adr-compliance.js`** — surfaced `git diff --name-only base...branch` client-side bei `flow_update` zu `review`/`done`. Backend kann in Docker keinen Git-Repo-Zugriff, also läuft der diff lokal. Output: 1-line stdout-Hint mit Datei-Liste. Iron Law: niemals blocking, exit 0 garantiert.
- Pattern: sister zu `pre-flow-update-knowledge-auto-resolve.js` (DF-320). Implementiert `[[mcp-pre-tool-use-hook-for-state-transition-gates]]`.

### Notes

- Backend-Side companion (DF-415 PR #520): `flowGate.js` blockt jetzt `review`-Transitions bei `git_settings.enabled=1` + `filesChanged` empty → 409 `files_changed_missing_with_git_enabled` mit Hint auf Plugin v4.34.0+. Defense-in-Depth.

## [4.33.0] - 2026-05-21

### Added (DF-411)

- **`/devflow-loop` slash-command** — single-command driver für „Agent läuft bis fertig". Orchestriert die State-Machine `idea → planning → approval → ready → in_progress → review → done` mit explizit emittierten Discipline-Tokens pro State, Gate-failure-Handling (409 reinject, fix named field, retry) und `--max-iterations` Cap. Args: `[flowId] [--max-iterations N] [--verify "<shell-cmd>"]`. Verify-Output wird verbatim in `testingInstructions` captured.
- Foundation: DF-405 (Stop-Hook hard-blocks premature exit), DF-323 (Self-Approval auto-emit pre-hook), DF-408 (Knowledge-Resolution callable in approval/review), DF-410 (Skills clean + npm test 115 grün).

### Notes

- **Iron Law**: nutzt nur real existierende MCP tools — kein `wiki_create`, kein `visual-regression-passed` token, keine weighted-ADR voting (alles aus früheren Vision-Pitches, nicht implementiert). Out-of-scope explizit dokumentiert für künftige Flows.
- **No BREAKING** — additive feature. Nutzer ohne den Command-Aufruf merken nichts.
- Discipline-Tokens werden per Stage explizit emittet (`devflow_token_emit`) als Safety, parallel zur DF-323 pre-hook-Lösung. Wenn DF-323-Gap später via `modifiedToolInput` echt geschlossen wird (eigener Flow), wird der explizite Emit-Block im Command zur no-op-Sicherung.
- Cross-Refs: DF-405 (Hook-Protokoll), DF-406 (devflow-planning Skill), DF-408 (KNOWLEDGE_RESOLUTION_TOOLS), DF-410 (Audit-Cleanup).

> **Internal test-drift fix (DF-407, 2026-05-19)** — no user-facing change, no version bump.
>
> - `tests/strictness/{git,rules}.test.ts`: 6 tests pinned the pre-DF-377 hard-block assertions (`/⛔.*Block/`). Plugin emits informational warnings since v4.30.0 (intentional, post-DF-302 settings simplification). Tests now assert the actual `📋 / 📖 / 🌿 / 🔗 / 📦` soft-warn output and that the transition still succeeds.
> - `scripts/tests/hooks-matcher.test.js`: 3 tests broke when DF-378 added a `.*__flow_create$` matcher next to the existing `.*__flow_update$` entry — the "find first non-Edit matcher" heuristic returned the wrong entry. Tests now look up the flow_update matcher specifically.
> - **Effect**: `npm test` 95/95 pass. `release.yml` CI no longer blocks the 4.32.x tag-push.

## [4.32.1] - 2026-05-19

### Changed (DF-406)

- **`devflow-planning` Skill bereinigt** — externe Agent-Delegation-Patterns + interaktiver Frage-Dialog entfernt. Kein turn-by-turn-Clarification-Loop mehr vor dem Plan, keine Plan-Files mehr im Repo. **Iron Law: "Plan goes to the flow, not the repo."** Der Plan wird direkt im Skill-Body geschrieben und via `flow_update({implementationPlan: <markdown>})` submittet — der Backend macht das `implementation-plan.md` Attachment automatisch (Mechanism aus DF-212, April 2026).
- Plan-Template ist jetzt der primäre Path (vorher fallback). Knowledge-Check pre-flight + Submitting-for-Approval Sections bleiben funktional, klarer dokumentiert (DF-313 Self-Approval-Mode, vier Discipline-Skills für `approval → ready`).
- Cross-Refs: DF-212 (Plan-as-Attachment Mechanism, April 2026), ADR-032 (Flow-Attachment-Schema Plan/Design/Decision), DF-313 (Self-Approval default ON).

### Notes

- **Kein BREAKING** — API unverändert (`flow_update({implementationPlan})` funktioniert weiter, der Auto-Upload als Attachment passiert wie seit DF-212). Nur Skill-Doc + Agent-Behavior bereinigt.
- Benutzer die `superpowers:*` Skills installiert hatten verlieren die optionale Delegation aus `devflow-planning`. Sie können `superpowers:*` weiterhin manuell invoken, aber `devflow-planning` selbst tut es nicht mehr.

## [4.32.0] - 2026-05-19

### Changed — BREAKING (DF-405)

- **`scripts/stop-check.js` blockt Session-Exit jetzt hart** wenn der aktive Flow in einem non-wait state ist (`idea` / `planning` / `ready` / `in_progress`). Hook gibt `exit 2` zurück und reinjected einen präzisen `flow_update`-Call inkl. `flowId`, Target-State und Required-Fields (`agentSummary` + `testingInstructions` bei `in_progress → review`). Vorher: stdout-Warning + impliziter `exit 0` — Claude Code interpretierte das als "passed", und der Agent konnte ohne Block beenden. Foundation für „Agent läuft bis fertig"-Loops.
- **`scripts/check-active-flow.sh` blockt Edits ohne aktive Flow-Session jetzt hart** in DevFlow-managed Projekten. Hook gibt `exit 2` zurück und nennt drei Recovery-Optionen im stderr (`/devflow-start`, `/devflow-list`, `/devflow-create`). Vorher: `exit 1`, was Claude Code als "hook crashed, continue anyway" wertete — Edits gingen still durch.

### Migration

- **Escape-Hatch für 1 Version**: `DEVFLOW_STOP_HOOK_SOFT=1` schaltet den Stop-Hook in soft-mode (Warning auf stderr, `exit 0`). **Wird in 4.33.0 entfernt.**
- `check-active-flow.sh` hat keinen Soft-Hatch — die Änderung `exit 1 → exit 2` ist eine reine Hook-Protokoll-Korrektur ohne neues Verhalten.
- **CI-Nutzer in DevFlow-Projekten**: Falls eure Pipeline `devflow_init` aufruft und der Job in einem non-wait state endet, setzt `DEVFLOW_STOP_HOOK_SOFT=1` in der CI-Env (oder beendet den Flow sauber vor dem CI-Ende).

### Notes

- Hook-Protokoll-Hintergrund: Claude Code blockiert ein Tool/Stop nur bei `exit 2`. `exit 1` wird als "hook error, continue anyway" gewertet. `stderr` wird in den Agent-Kontext reinjected; `stdout` ist silent.
- Reference: ADR-112 (Flow-Enforcement via PreToolUse-Hook) etabliert das Exit-2-Protokoll für Edits — DF-405 erweitert es auf die Stop-Phase.
- Test-Coverage erweitert: 13 Tests in `scripts/tests/stop-check.test.js` (jeder State, SOFT-Hatch, corrupt active-file, non-DevFlow-Pass) und 5 in `scripts/tests/check-active-flow.bats` (recovery-message-coverage, exit-2-Pinning).

## [4.31.0] - 2026-05-13

### Added (DF-378)

- **`flow_create` tool-schema hardening** — `summary`, `description`, and `acceptanceCriteria` are now all `required`. The tool-description spells out the limits (summary 3..80 chars, description ≥ 30 chars, AC ≥ 1 item × ≥ 10 chars each) so agents stop packing entire descriptions into the title.
- **`pre-flow-create-validate.js` Pre-Tool-Use hook** — surfaces actionable 1-line hints to the agent BEFORE the tool-call is sent to the backend, so a too-long summary or missing description is caught without a 400-roundtrip. Pattern: `[[mcp-pre-tool-use-hook-for-state-transition-gates]]`.
- New Pre-Tool-Use matcher `.*__flow_create$` registered in `hooks/pre-tool-use.json` so every host (devflow, plugin_devflow_devflow, …) picks it up.

### Notes

- Backend (DevFlow 2.13.0+) enforces the same limits in POST `/api/flows`, PATCH `/api/flows/:id` (`ticketSummary`), and the idea-exit state-transition guard. The structured response shape `{ success:false, error:'flow_input_invalid'\|'metadata_incomplete', validationErrors:[{ field, code, message, hint, limit?, actual? }] }` is consumed identically by the UI and the MCP hook.
- Stub-create (`summary='Untitled'`, no description, no acceptanceCriteria) is intentionally allowed in the backend POST so the `+ Create Flow` click-and-edit UX keeps working — but the flow cannot leave the `idea`-state until the triple is filled in.

## [4.29.0] - 2026-05-09

### Added (DF-365)

- **`flow_upload_file` MCP-Tool** — attach binary files (images, PDFs, large exports) to a flow from a disk path. Reads the file with `fs.readFile`, detects mime-type from the extension, posts as multipart/form-data with auth. Backend now accepts up to **50 MB** per file.
  ```
  flow_upload_file({ flowId: "DF-XXX", filePath: "/tmp/cover.png", kind: "notes" })
  ```
- **`devflow-flow-attachment` skill** — trigger-description so the agent knows when to fire (DE + EN trigger phrases) plus a decision tree for `flow_upload` (text content) vs `flow_upload_file` (disk file). Includes kind-auto-detection table and an Iron Law: never silently compress or truncate — fail loud over corrupt-silently.
- API client method `uploadAttachmentFile(flowId, filePath, kind?)` covers the same path for SDK consumers.

### Notes

- Backend `flow_upload`-text content endpoint unchanged. The new tool is additive — existing `flow_upload({filename, content, kind})` calls keep working.
- DevFlow backend bumped Multer + express.json from 10 MB → 50 MB to match. iPhone-sized photos now fit.
- DF-358 update-banner will surface this v4.29.0 to existing installs at next session start.

## [4.28.0] - 2026-05-07

### Added (DF-358)

- **Plugin update notification on session start.** A new hook `scripts/check-plugin-update.js` runs at every Claude Code session start. It reads the installed version from `.claude-plugin/plugin.json`, fetches the latest published version from `https://registry.npmjs.org/@dev-flow-tech/mcp-server/latest` (3s timeout), compares them, and prints a one-line banner if a newer version is available:
  ```
  ⬆️  DevFlow plugin v4.29.0 available (current: v4.28.0) — restart Claude Code to update.
  ```
- 1-hour file cache at `~/.cache/devflow-mcp/version-check.json` keeps the npm registry hit rate down (max 24/day/machine). All errors (no internet, registry down, corrupt cache, missing plugin.json) are swallowed silently.
- Pure-function lib `scripts/lib/version-check.js` exports `compareVersions`, `decideBanner`, `readCurrentVersion`, `readCache`, `writeCache`, `isCacheFresh`, `fetchLatestVersion` so the behavior is unit-testable and reusable.
- Hook entry appended to `hooks/session-start.json` (existing `session-start-info.sh` wiring is preserved).
- 28 new TDD tests covering pure-function semver compare, cache TTL boundary, banner format, and end-to-end runs against a local mock registry (`scripts/tests/version-check-lib.test.js`, `scripts/tests/check-plugin-update.test.js`, `scripts/tests/session-start-config.test.js`).

### Privacy

The session-start update check makes one outbound HTTPS request per hour per machine to `registry.npmjs.org` — the same host that `npm install` already contacts. Disable by setting `DEVFLOW_VERSION_CHECK_URL=` to an empty string and ignoring the silent failure, or by removing the second hook entry from `hooks/session-start.json`.

## [4.27.0] - 2026-05-07

### Fixed (DF-357)

- **Pre-tool-use hooks now actually fire.** The matcher in `hooks/pre-tool-use.json` and `post-tool-use.json` was the literal `mcp__devflow__flow_update`, which did not match Claude Code's plugin-namespaced tool name `mcp__plugin_devflow_devflow__flow_update`. The hooks were silent in every flow of the DF-345..356 audit sprint.
  - Matcher is now the regex suffix `.*__flow_update$` — namespace-immune against future host renamings.
  - All five scripts (`pre-flow-update-knowledge-auto-resolve.js`, `pre-flow-update-plan-critic.js`, `pre-flow-update-code-critic.js`, `pre-flow-update-self-approval.js`, `post-flow-update.js`) now apply a belt-and-braces internal guard `endsWith('__flow_update')`.
  - Two scripts (`pre-flow-update-knowledge-auto-resolve.js`, `pre-flow-update-self-approval.js`) used CommonJS `require()` in an ESM-only repo — they would have crashed at runtime even if the matcher had fired. Migrated to `import` syntax.
- **`knowledge_check_flow` no longer floods context.** The `prepareKnowledgeCheck` API client now requests `?format=compact` by default (backend route updated). The compact response is a bounded ~5 KB digest (`{flow, gaps[], briefingSummary≤2000chars, totalAdrCount, projectDraftCount}`) instead of every ADR's first 2000 chars (~150 KB). Pass `format='full'` to opt back into the legacy shape for debugging.

### Added (DF-357)

- `scripts/tests/hooks-matcher.test.js` — pins the matcher regex and verifies it accepts every plausible host namespace variant (legacy, plugin-namespaced, future renamings).
- `scripts/tests/pre-flow-update-suffix-match.test.js` — per-script regression tests for namespace acceptance and override-arg respect.
- `hooks/README.md` — documents the matcher convention, the belt-and-braces guard, and how to add new hooks. See also `CONTRIBUTING.md` § Hooks.
- `docs/SKILL-ACTIVATION-AUDIT.md` — Phase 5 audit of all 21 skills, their activation kinds, and the reliability uplift from this fix. Cross-referenced from `hooks/README.md`.

## [4.26.0] - 2026-05-06

### Added (DF-339)

- **Auto-Review Skills (Phase 1-5):** Zwei neue Skills für deep self-critique vor State-Übergängen:
  - `devflow-plan-critic` — fires bei `planning → approval`. 7 Dimensionen (AC-Coverage, Task-Granularität, Edge-Cases, Wiki-Coverage, Past-Flow-Anchor, Architektur-Risiken, Test-Strategie).
  - `devflow-code-critic` — fires bei `in_progress → review`. 7 Dimensionen (AC-Implementation, Test-Coverage, Iron-Laws, ADR-Compliance, Plan-Reconciliation, Knowledge-Drafts, Code-Quality).
- **Pre-tool-use Hooks:** Zwei neue Skripts (`pre-flow-update-plan-critic.js` + `pre-flow-update-code-critic.js`) reminden den Agent, den Critic-Skill vor dem Übergang zu invoken.
- **Loop-Semantik im Skill (Phase 2):** Max 3 Iterationen, Early-Exit nach 2 zero-high-iterationen, No-Improvement-Detection.
- **Skip-Rules im Skill (Phase 5):** Trivial-Flow-Detection für `verdict='approved-trivial'` (tasks ≤ 2, no schema-change, no new endpoint, no security/breaking tag).
- **Discussion-Integration (Phase 4):** Skills instruieren Agent, Findings via `flow_update({planFeedback})` zu posten.
- **Auto-Approve-Gate (Phase 5):** Skills lesen `project_configs.allow_agent_self_approval` — ON → Tokens emittieren + weiter; OFF → halt für manuelle User-Approval.

## [Unreleased]

### Added (DF-338)

- **Cursor Bundle Scaffold:** `.cursor/` Bundle für Cursor 2.4+ — Tier-2 plugin per DF-327. Manual install via `scripts/setup-cursor.sh`.
- Components: `mcp.json` (refs devflow-mcp-flows + devflow-mcp-wiki), `hooks.json` (PreToolUse gating), `rules/devflow.mdc` (MDC-Frontmatter mit alwaysApply), Hook-Bash-Adapter (Reuse von DF-336/337), build-script + 6 tests.
- Setup-Script kann lokal aus devflow-mcp-checkout oder remote via curl-pipe gerufen werden.
- **Watch-Item:** Cursor "Agent Plugins"-FR — falls shipped, migrate zum offiziellen Bundle-Format.

### Added (DF-337)

- **Gemini CLI Extension Scaffold:** `.gemini-extension/` Bundle mit `gemini-extension.json` (Manifest mit kombinierten mcpServers + contextFileName + hooks/skills/commands refs), `GEMINI.md` (Context-file), Hook-Bash-Adapter (Reuse von DF-336 Codex), build-script + 6 tests.
- 80% Reuse aus DF-336: hook-wrapper-Logik identisch, build-script-Template identisch, test-Template identisch. Differenzen nur Manifest-Schema (Gemini hat mcpServers inline statt separater .mcp.json) und Event-Names (Gemini's 11 events, MVP nutzt nur BeforeTool).
- **Disclaimer:** Format-Compatibility mit Gemini CLI muss bei erstem lokalen Install verifiziert werden.

### Added (DF-336)

- **Codex CLI Plugin Scaffold:** `.codex-plugin/` Bundle mit `plugin.json`, `.mcp.json` (referenziert `devflow-mcp-flows` + `devflow-mcp-wiki`), `hooks/` (BeforeTool-Adapter via Bash → bestehende Claude-Plugin-Scripts), `commands/` + `skills/` (build-time-copy aus canonical Quellen).
- `scripts/build-codex-plugin.js` — kopiert Skills + Commands in den Codex-Bundle.
- `__tests__/codex-plugin.test.js` — 6 Tests pinnen plugin.json-schema, MCP-refs, Hook-Bash-Syntax, Skills-Count, Commands-Count.
- README dokumentiert Setup für Codex CLI v0.128+ (DE+EN).
- **Disclaimer:** Format-Compatibility mit Codex CLI muss bei erstem lokalen Install verifiziert werden — Phase-2-Patch falls Drift.

### Added (DF-334)

- **MCP-Server-Split:** Drei Entry-Points statt einem.
  - `devflow-mcp` (combined, BC-default, ~65 tools) — bestehende Claude-Plugin-Installationen unverändert
  - `devflow-mcp-flows` (workflow-domain, ≤40 tools) — für Cursor und andere mit 40-tool-cap
  - `devflow-mcp-wiki` (knowledge-domain, ≤40 tools) — knowledge ohne workflow-control
- Shared `src/server/start-server.ts` — Boilerplate für alle drei Entry-Points
- `__tests__/server-split.test.js` — 4 Tests pinnen Tool-Counts und Cursor-Cap-Compliance

### Changed (DF-335)

- **Skills-Mono-Repo:** Skills extracted into `packages/skills/` als `@dev-flow-tech/skills@1.0.0` workspace-package. Backwards-compat via symlink `skills/` → `packages/skills/skills/` — Claude-Plugin findet sie unverändert.
- New: `packages/skills/index.json` (auto-generated from frontmatter), `scripts/build-index.js`, schema-test pinning all 19 skills.
- npm-Package shippt jetzt `packages/skills/` mit (für zukünftige Codex/Gemini/Cursor-Plugins als Source).

## [4.25.0] - 2026-05-06

### Added (DF-332)

- `flow_get` now appends a `## Discussion (N)`-section with all live comments (deleted/tombstoned comments are skipped). Resolved comments get a `[✓ resolved]` marker.
- New MCP tool **`flow_comments_get(flowId)`** for an explicit reload of just the discussion thread — useful when the user said something new in the UI and you want fresh context without re-fetching the entire flow + attachments.
- Comments are rendered chronologically as Markdown blockquotes with author + timestamp. Wikilinks (`[[adr-134]]`) and `@mentions` in the body stay raw — use `wiki_get_page` if you need to resolve them.

### Changed (DF-332)

- `client.ts` adds `listFlowComments(flowId)` wrapper around the existing `GET /api/flows/:id/comments` endpoint (DF-274). No backend changes required.
- New exported type `FlowDiscussionComment` with embedded `author` info.

## [4.24.0] - 2026-05-06

### Added (DF-329)

Uniform flow-list display across MCP, slash-commands, and free-form agent responses. The user gets the same Markdown-table everywhere — not three different rendering styles depending on entry-point.

- `flow_list` MCP-tool now renders a Markdown table (`ID | State | Assignee | Titel`) instead of a per-state bullet-list.
- ⭐ prefix marks own flows (`isMine === true`) — server-computed in `formatFlowResponse(flow, currentUserId)`.
- 🔒 suffix on the assignee column shows active agent sessions; idle flows have no marker (replaces noisy `(frei)`).
- Done-flows are hidden by default; opt-in via `flow_list({ includeDone: true })`.
- New `mine` filter: `flow_list({ mine: true })` returns only own flows.
- New plugin skill `devflow-flow-display` enforces the convention whenever Claude lists or summarizes flows — even outside the MCP-tool path.
- `/devflow-list` slash-command updated to pass MCP-tool output through verbatim.
- `devflow-core` skill cross-links to `devflow-flow-display` under "Output Conventions".

### Changed (DF-329)

Backend `GET /api/flows` response shape:
- New `isMine: boolean` per flow.
- `assignee` is now a structured object `{ id, name, email | null } | null` (legacy `assignee_name` flat string preserved for back-compat).
- Test pin: `tests/api/flows-list-display.test.ts` (6 ACs).

## [4.23.0] - 2026-05-05

### Changed (DF-326)

The plugin no longer modifies `CLAUDE.md`. Since DF-302 introduced the Claude Code plugin (skills + hooks + MCP tool responses), the `<!-- DEVFLOW-RULES-START -->` block in `CLAUDE.md` was triple-redundant — every MCP restart, every `devflow_status`, every `devflow_connect` re-wrote it for nothing.

- `syncConfig` no longer calls `setupClaudeMd` or `syncProjectGuidelines`. Project guidelines remain reachable via the `project_guidelines_get` MCP tool.
- `browser-auth.ts` no longer writes `CLAUDE.md` after first login.
- `project_guidelines_update` no longer syncs the result into a local file — guidelines are stored in the backend only.
- `setup` for `--client claude` (and `--client droid`) no longer writes `CLAUDE.md`. Cursor/Codex/Gemini/Windsurf still get their respective rules-files until DF-327 introduces dedicated plugin bundles per client.
- `setup/claude-md-generator.ts` removed. `templates/claude-md.ts` retained as the canonical content source for the other clients' rules-files.
- `uninstall.ts` keeps the legacy `CLAUDE.md` cleanup path for pre-4.23 installs (markers defined inline now).

### Removed (DF-326)

- `flow_seal_backfill` MCP-tool. It was a one-shot migration from DF-255 — done-flows now seal automatically. The backend endpoint (`POST /api/projects/:id/flow-seal-backfill`) remains for manual curl invocation.
- `scripts/check-architecture-coverage.sh` and its hook entry. Advisory-only with hardcoded path-to-module mappings — no one acted on the hint, drift-prone.

## [4.14.1] - 2026-04-26

### Fixed (DF-282)

- `flow_upload` now accepts `kind="decision"` (was rejected with "Invalid kind decision"). The DevFlow backend has supported `decision` since DF-224 — the MCP-tool's `ALLOWED_KINDS` allowlist was missing it. Discovered during DF-274 when the agent had to bypass MCP and upload via direct REST to create a `decision.md` for `adr_accept`.

## [4.14.0] - 2026-04-24

### Added (DF-269)

Four new tools so Claude can use the DF-261 / DF-263 / DF-264 backend features directly instead of hand-rolled REST calls:

- `pending_work(projectId?, tags?, paths?, excludeFlowId?)` — 4-bucket snapshot (`inFlightFlows`, `openIntents`, `proposedAdrs`, `pendingDrafts`). Call this at planning start to avoid proposing something already in flight.
- `intent_resolve(flowId, pageId, note?)` — close a forward-intent doc-page (from DF-254 `flow_seal`) once the current flow actually delivers that follow-up. Updates `frontmatter.status='resolved'` and links the resolving flow.
- `knowledge_autotag_suggest(projectId?, content, existingTags?, limit?)` — TF-IDF tag suggestions from the existing project tag pool (no new tags invented, avoiding tag-wildwuchs).
- `knowledge_check_resolve(flowId, topic, resolutionType, entityType?, entityId?, reason?, horizon?)` — mark a warning from `knowledge_check_flow` / `knowledge_check_drift` as resolved. Five resolution types: `adr`, `pattern`, `runbook`, `intent_defer` (seeds an intent doc-page), `dismiss`.

Allowlist (backend DF-269): the two read-only tools are callable in every working state; the two writes are scoped to `planning` + `in_progress`.

## [4.9.0] - 2026-04-22

### Added
- `knowledge_check_drift(projectId, adrNumber)` tool (DF-238): returns ADR content + its configured `affects_paths`, plus instructions for Claude to inspect the files and report drift. Drift detection runs client-side (Claude's own Read/Glob/Grep against the user workspace) — no backend code access needed.

### Changed (DF-242)
- Package renamed from `devflow-mcp` to `@dev-flow-tech/mcp-server` (scoped under the npm org `@dev-flow-tech`). `"private": true` flipped to `false` and `publishConfig.access: "public"` added so the package is publishable.
- `.claude-plugin/plugin.json` now carries an `mcpServers.devflow` entry pointing at `npx -y @dev-flow-tech/mcp-server@4.9.0`. Installing the plugin (`/plugin install devflow`) now registers the MCP server automatically — no separate `npx github:... setup` step needed.
- Added `npm run publish:npm` script (`npm run build && npm publish`) for future releases.
- README install section now shows `/plugin install devflow` as the primary path; the legacy `npx github:` fallback stays documented.

## [4.8.0] - 2026-04-22

### Added
- MCP Resources (DF-240): `devflow://project/{id}/adr/{number}`, `/flow/{displayId}`, `/graph`, `/search?q=...`
- MCP Prompts (DF-240): `ask_project`, `plan_with_project_knowledge`, `review_with_drift_check`
- `capabilities.resources` + `capabilities.prompts` enabled on the server
- Prompts auto-assemble project context (ADRs + recent done-flows) so Claude gets one-shot answers

## [4.7.0] - 2026-04-22

### Added
- 2 more MCP-first Knowledge tools (DF-246): `knowledge_harvest(flowId)` and `knowledge_check_flow(flowId)`. After a flow transitions to done the server's `flow_update` response now carries a `suggestedNextTool` pointing Claude at `knowledge_harvest` for the just-finished flow.
- Backend endpoints `GET /api/flows/:id/knowledge-harvest/prepare` and `/knowledge-check/prepare`.
- CLAUDE.md `Knowledge-Pflicht` section describing the post-done-harvest expectation.

## [4.6.0] - 2026-04-22

### Added
- 5 MCP-first Knowledge-Drafts tools (DF-245): `knowledge_backfill_request`, `knowledge_draft_create`, `knowledge_draft_list`, `knowledge_draft_accept`, `knowledge_draft_reject`. Claude reads project context + existing ADRs + structured instructions, classifies done-flows itself, and writes back drafts — no server-side LLM required.
- Backend endpoints `POST /api/knowledge-drafts` (direct create) and `GET /api/projects/:id/knowledge-backfill/prepare` (data + instructions for Claude).
- Plugin-manifest version synchronized with MCP-server version (both 4.6.0). Future releases bump both in sync.

### Notes
- Dedup-Check from DF-244 Phase 1 applies automatically: repeated draft creation with the same `(projectId, draftType, title)` merges `sourceFlowIds` instead of duplicating.

## [4.4.1] - 2026-04-21

### Fixed
- `transformFlow()` dropped the `commits` field, making the MCP-side strictness check blind to persisted commits. This caused docsUpdate=5 to block `review` transitions even when docs commits were registered in a prior `flow_update` call (DF-217 reproducer, DF-218 fix).
- Git-discipline check now also accepts persisted `prUrl` and `commits` on the flow (previously required them in the same call).

### Added
- Vitest test suite covering all strictness gates: `tests/strictness/rules.test.ts`, `tests/strictness/git.test.ts`, `tests/strictness/happy-path-paranoid.test.ts` (25 test cases).
- `npm test` / `npm run test:watch` scripts and `vitest.config.ts`.

### Changed
- `flow_update.commits` tool description clarifies same-call vs persisted semantics.

## [4.2.0] - 2026-04-17

### Added
- Heartbeat now includes `workingDirectory` (process.cwd()) for better server-side client deduplication (DF-215)

### Notes
- Requires DevFlow backend with DF-215 deployed for dedup to take effect
- Legacy behaviour preserved: backend falls back to projectId match when workingDirectory is absent

## [4.1.0] - 2026-04-17

### Added
- 4 plugin hooks: `PreToolUse` (enforcement), `SessionStart` (context), `PostToolUse` (state-change reminder), `Stop` (exit warning)
- 7 slash commands: `/devflow-start`, `/devflow-status`, `/devflow-next`, `/devflow-tasks`, `/devflow-review`, `/devflow-list`, `/devflow-create`
- 4 state-specific skills: `devflow-core`, `devflow-planning`, `devflow-executing`, `devflow-reviewing` — with optional `superpowers:*` references
- Shared bash helper library `scripts/lib/devflow-state.sh` for hook scripts
- Test coverage: `bats-core` for bash hooks, `node:test` for JS hooks

### Changed
- Monolithic `devflow-workflow` skill split into 4 state-specific skills
- External `PreToolUse` hook (previously required in `~/.claude/settings.json`) is now provided by the plugin itself

### Removed
- `skills/devflow-workflow/` (replaced by 4 new skills)

### Migration
- Existing users with the external hook can leave it in place or remove it — plugin hook takes precedence. No breaking changes.

## [4.0.0] - 2026-04-09

### Added
- Claude Code Plugin support: `.claude-plugin/plugin.json`, `.mcp.json`, skills
- English documentation: README, CONTRIBUTING, CHANGELOG

### Changed
- License changed from proprietary to MIT
- Default backend URL consolidated to `https://api.app.dev-flow.tech`
- All user-facing error messages now in English
- Removed legacy `setup.sh` and internal planning documents
- Removed `.tgz` release archives from repository

### Fixed
- Version mismatch between `package.json` and `MCP_VERSION` constant
- Localhost URLs removed from user-facing error messages

## [3.7.3] - 2026-03-31

### Fixed
- Release script improvements

## [3.7.2] - 2026-03-28

### Added
- Uninstall command: `npx github:KlausFreiberufler/devflow-mcp uninstall --client <name>`
- Auto-update: background download of new versions, applied on next start
- Agent session isolation hints in status output

## [3.7.1] - 2026-03-25

### Added
- `.devflow-active` state file for Claude Code hook enforcement
- `devflow_init` reminder after state changes

## [3.7.0] - 2026-03-20

### Fixed
- Setup wizard reliability improvements
- Authentication flow fixes
- Code cleanup and consistency

## [3.6.0] - 2026-03-10

### Added
- Project Discovery: auto-detect projects via git remote URL
- Ignore list for non-DevFlow projects
- `devflow_connect` / `devflow_disconnect` tools

## [3.5.0] - 2026-03-05

### Added
- `devflow_status` tool for connection management across all MCP clients

## [3.4.0] - 2026-02-28

### Added
- Per-project scoping via `.devflow.json`
- Silent passive mode for unlinked projects

## [3.3.5] - 2026-02-25

### Fixed
- Smart docs-enforcement check
- Version sync between package.json and MCP_VERSION

## [3.3.4] - 2026-02-24

### Fixed
- Rule enforcement: gitEnabled gate, branchName schema, commits check
- Docs hard-block enforcement

## [3.3.0] - 2026-02-20

### Added
- In-client project linking (no more browser project selection)
- Heartbeat system for online status tracking
- Shell wrapper for cross-platform node resolution
- OS detection and node path resolution
- Client type auto-detection
- Multi-client setup: Claude Code, Cursor, Codex, Gemini CLI, Windsurf

## [3.2.0] - 2026-02-15

### Changed
- Pipeline architecture refactor: `executor` -> `actor` + `transitionPolicy` + `kind` + `skippable`
- Backend as sole source of truth for permissions (removed client-side permission logic)

### Added
- `getNextStep()` API method for permission refresh after auto-advance
- Session context stores `stepKind` and `transitionPolicy`

## [3.1.0] - 2026-02-12

### Added
- Pipeline Phase 2: Skills enforcement, phase tracking (pre/action/after)
- Reject/retry loops with escalation
- Update warning when MCP version is outdated

## [3.0.0] - 2026-02-10

### Added
- Pipeline integration: gate handling, skill assignment, next-step API
- Init gate: all tools blocked until `devflow_init` is called
- Session context and state-based permissions
- Context guard and state guard middleware
- Graceful shutdown (releases flow lock on SIGINT/SIGTERM)
- Documentation page CRUD tools (replaced knowledge tools)

### Changed
- Full rename: Workflow -> Flow across all layers
