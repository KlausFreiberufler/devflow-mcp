# Fresh-Context-Review — Kritiker-Subagenten statt Selbst-Review (DF-535)

## Warum es das gibt

`devflow-code-critic` (DF-339) war bis DF-535 eine **Selbst**-Kritik: vor `in_progress → review` setzte der Agent den Prüfer-Hut auf und ging seinen eigenen Diff gegen 7 Qualitätsdimensionen durch. Der Hut ist das Problem. Eine Selbst-Prüfung läuft im selben Kontextfenster, das den Code erzeugt hat — die Begründung des Autors steht also schon im Raum, und was im Raum steht, wird *übernommen* statt *geprüft*. Das ist der **Anker-Effekt**, und er ist kein rhetorisches Risiko. Es gibt eine bezahlte Quittung dafür.

### Belegfall: DF-520 R3

DF-520 (Ritual-Schedules) brauchte drei Runden:

| Runde | Urteil der Selbst-Prüfung | Urteil des Menschen |
|---|---|---|
| R1 | approved | `code_rejected` |
| R2 | approved | `code_rejected` |
| R3 | — | der eigentliche Fehler kam ans Licht |

Die Prämisse, die zwei Runden lang niemand angefasst hat: *„`CronExpressionParser.parse()` prüft den Ausdruck."* Tut es nicht. Ein einzelnes malformtes Feld — ein nacktes `'L'` im Wochentag-Slot — parst sauber und wirft erst beim ersten `.next()`. Ein einziges `PUT` persistierte damit einen kaputten Cron, **bevor** der nächste Lauf berechnet wurde, und jedes spätere `GET`/`PUT` für dieses Ritual antwortete danach dauerhaft mit 500. Der Fix war eine Zeile: `.next()` im Validator aufrufen und verwerfen, was wirft.

Zwei Selbst-Prüfungen konnten das nicht sehen, weil die Begründung für den Validator im selben Kontext lag wie die Prüfung des Validators. Ein Prüfer, der nur den Diff und die Acceptance Criteria bekommt, hat keine Prämisse zum Erben. Er fragt „lehnt `parse()` wirklich jedes malformte Feld ab?" — und führt es aus.

**DF-535 macht den Fresh-Context-Dispatch zum Hauptmodus von `devflow-code-critic`.** Die 7 Dimensionen bleiben unverändert; was sich ändert, ist *wer antwortet*.

## Was sich geändert hat

| Datei | Änderung |
|---|---|
| `packages/skills/skills/devflow-code-critic/SKILL.md` | Neuer Hauptmodus: Fresh-Context-Dispatch. Drei Linsen, Dispatch-Kontrakt mit ausdrücklicher Kontextgrenze, `review_mode` + `reviewers[]` im Verdict, Re-Dispatch-Regel, Self-Persona-Fallback, neue Anti-Patterns (4 → 8). Iron Laws 5 → 7. |
| `scripts/pre-flow-update-code-critic.js` | Der Pre-Tool-Use-Hinweis führt jetzt mit dem Dispatch (Linsen, Kontextgrenze, „Subagenten melden, sie reparieren nie") und nennt den Fallback als Ausnahme, nicht als Normalfall. |
| `packages/skills/skills/devflow-receiving-review/SKILL.md` | Gegenverweis: Der Kritiker ist jetzt die Hauptquelle der Befunde, und Subagenten-Befunde werden genau wie menschliche triagiert. |
| `packages/skills/index.json` | Neu erzeugt: neue Beschreibung + Iron-Law-Zähler 5 → 7 für `devflow-code-critic`. Der Rebuild korrigiert nebenbei einen **vorbestehenden** Drift in der Zeile von `devflow-subagent-driven-dev` — an zwei Stellen: Der Iron-Law-Zähler stand noch auf 5, während das Frontmatter dieses Skills längst 8 führt, und die Beschreibung verwies noch auf die offene RFC-Diskussion, obwohl DF-427 sie am 2026-05-22 abgeschlossen hat. Der Skill selbst wird von DF-535 nicht angefasst — nur seine Index-Zeile war von ihrem Frontmatter abgedriftet. |
| `scripts/tests/df535-fresh-context-critic.test.js` | 7 pinnende Tests, in `npm test` verdrahtet. |

## Der Dispatch-Kontrakt

**2–3 Prüfer-Subagenten** starten (Claude-Code-`Agent`/Task-Tool), je eine Linse, parallel — eine Nachricht, mehrere Tool-Calls. Nie einen Agent-Typ wählen, der `Edit`/`Write` mitbringt — `feature-dev:code-reviewer` und `Explore` bringen beides nicht mit und kommen deshalb in Frage. Sie lesen das Repo selbst; sie melden, sie reparieren nie.

Nur-Lesen ist *werkzeugseitig erzwungen* allein bei einem Typ ohne Shell-Zugriff. `Explore` kann Befehle starten und darüber schreiben — bei dieser Linse steht die Schranke deshalb im Prompt (`Do not fix anything`) statt in der Werkzeugliste. Sie muss dort bleiben; und meldet ein Prüfer, er habe eine Datei geändert, wird die Änderung zurückgenommen und die Linse neu vergeben.

**Den Agent-Typ pro Linse wählen, nicht einmal für alle drei.** `correctness` und `security` lesen nur — dafür passt `feature-dev:code-reviewer`. `does-it-reproduce` muss die Suite *ausführen* und braucht deshalb einen Typ, der einen Befehl starten kann (z. B. `Explore`): `feature-dev:code-reviewer` kommt ohne `Bash` — nur `KillShell`/`BashOutput`, die sich an eine bereits laufende Shell hängen. An diesen Typ vergeben, würde die Linse die Tests durch Lesen prüfen und berichten, als hätte sie sie ausgeführt — genau der Fehler, den sie fangen soll.

### Kontextgrenze

| Darf in den Dispatch-Prompt | Bleibt beim Autor |
|---|---|
| Der `git diff` (oder Diff-Range + Repo-Pfad) | Annahmen und Begründungen des Autors |
| Die Acceptance Criteria, **wörtlich** | „Habe ich schon geprüft", „das ist sicher, weil …" |
| Der genehmigte Plan-Auszug — Scope und Tasks | Das eigene Urteil aus einer früheren Iteration |
| Repo-Pfad + der Befehl, mit dem die Tests laufen | Befunde, die der Autor bereits verworfen hat |

Die rechte Spalte ist der ganze Punkt. Wer „X habe ich schon verifiziert" in den Dispatch-Prompt schreibt, baut den DF-520-R3-Fehler *innerhalb* eines frischen Kontexts nach — der Skill führt das als erstes Anti-Pattern („leaking the anchor").

### Die drei Linsen

| Linse | Frage, die sie beantwortet | Dimensionen |
|---|---|---|
| `correctness` | Ist jedes AC wirklich umgesetzt (nicht nur berührt)? Fehler? Passt der Diff zum genehmigten Plan — etwas darüber hinaus dazugekommen, etwas Geplantes still weggefallen? | 1 · 5 · 7 |
| `security` | Die **Security-Hygiene-Checkliste** des Projekts (CLAUDE.md) gegen diesen Diff durchgehen: `requireAuth`, `requireProjectAccess`/`requireFlowAccess`, Resource→Project-Auflösung vor dem ersten DB-Read, `userId`-Filter im DB-Layer, `dangerouslySetInnerHTML`, `iframe sandbox`, Token-Ablage, Cross-Access-Test-Eintrag. | 4 · 7 |
| `does-it-reproduce` | Wurden die Tests wirklich **ausgeführt** oder nur geschrieben? Ausführen. Würden die Assertions bei einer Regression scheitern, oder liefen sie auch gegen einen Stub durch? Steht hinter jedem AC ein Befehl, dessen Ausgabe tatsächlich erfasst wurde? | 2 |

Jeder Befund, den eine Linse meldet, trägt `severity`, `source_lens`, `location`, `observation`, `repro` und `suggestion`. Faltet der Autor sie in das eigene Verdict des Skills, wird `observation` auf das schon vorher bestehende Feld `issue` abgebildet, und der Autor ergänzt `dimension`. Die Schlüssel von vor DF-535 — `severity`, `dimension`, `issue`, `suggestion` — behalten Namen und Bedeutung, deshalb steht `observation` nie auf oberster Ebene; DF-535 ergänzt in `findings[]` ausschließlich `source_lens`, `location` und `repro`. `source_lens` nennt die Linse, die ihn gefunden hat — oder `author` für die beiden Dimensionen, die kein Subagent je sieht (3 und 6); so bleibt nachvollziehbar, wer was gefunden hat. Ein `high`-Befund ohne `repro`-Befehl ist ein Verdacht, kein Befund — die Linse wird dafür zurückgeschickt.

In jeder dispatchten Iteration bekommt jede Linse einen Eintrag in `reviewers[]` — `lens`, `agent_type`, `status`, `findings_count`. `status` ist `returned`, sobald die Linse die Grenze überquert und berichtet hat. Eine Linse, die abbricht oder nichts Brauchbares liefert, bekommt `status: "failed"` — einmal neu starten. Scheitert sie erneut, deckt der Autor die Dimensionen dieser Linse selbst ab, und der Eintrag bleibt als `failed` in `reviewers[]` stehen. `failed`- und `skipped`-Einträge tragen zusätzlich einen `reason`, damit die Lücke allein aus dem JSON lesbar bleibt. `review_mode` bleibt `fresh-context`, solange mindestens eine Linse die Grenze wirklich überquert hat: Das Feld sagt, *wie* die Prüfung entstanden ist, nicht *wie vollständig*.

### Was beim Autor bleibt

Die Subagenten können nicht alles beurteilen; dafür braucht es Flow, Wiki und Historie im Kontext:

- **Dimension 3 · Iron-Laws** — war TDD wirklich RED-first, wurde ein Pattern wiederverwendet, extend > dismiss, Kollisionen quittiert.
- **Dimension 6 · Knowledge-Drafts** — hat diese Arbeit ein Pattern, ein Runbook oder eine ADR-würdige Entscheidung hervorgebracht.
- **Triage** — jeder Befund läuft durch **`devflow-receiving-review`**: Critical/Important/Minor, technisch verifiziert, angenommen oder mit schriftlicher Begründung abgelehnt. Nie blind annehmen (ein frischer Prüfer kennt die Flow-Historie nicht und meldet manchmal gewolltes Verhalten), nie blind ablehnen (er hat auch kein Eigeninteresse am Code).

### Iteration

Iteration 1 startet alle drei Linsen. Ab Iteration 2 werden **nur die Linsen** neu gestartet, die High-Findings geliefert haben — eine saubere Linse würde denselben Code zweimal lesen. Ausnahme: berührt ein Fix eine Datei, die einer sauberen Linse gehört (ein sicherheitsrelevanter Pfad, eine Testdatei), läuft diese Linse ebenfalls neu. Die harte Grenze bleibt bei 3 Iterationen.

Eine Linse, die *nicht* neu läuft, steht trotzdem im `reviewers[]` dieser Iteration — mit `status: "skipped"` und der Begründung („sauber in Iteration 1"). Jede Iteration führt damit alle drei Linsen auf: Ein bewusst übersprungener Lauf bleibt unterscheidbar von einer Linse, die nie gestartet wurde.

Triviale Flows gehen weiterhin über `approved-trivial` raus — **ganz ohne Dispatch**, drei Subagenten für einen Tippfehler sind Verschwendung. Es müssen alle vier Bedingungen gelten: ≤ 2 Tasks, keine Schema-Änderung, kein neuer Endpoint **und** kein Tag aus `force_critic_tags` (Projekt-Config, standardmäßig `['security','breaking']`). Ein Ein-Task-Flow mit `security`-Tag geht ganz normal in den Dispatch — die Abkürzung gilt kleiner Arbeit, nicht riskanter Arbeit, die zufällig klein ist.

## Fallback-Matrix (ADR-135-Tiers)

Nicht jeder Client kann einen Subagenten starten. **ADR-135 — Multi-Client Plugin-Strategie: 3-Tier Support** (Ursprungs-Flow DF-327, accepted 2026-05-06) regelt, wer was bekommt; Stand DF-535 hat nur Claude Code ein Gegenstück zum `Agent`-Tool.

| Client | ADR-135-Tier | Subagenten-Tool | Review-Modus |
|---|---|---|---|
| Claude Code | Referenz-Client (volles Plugin) | ja | `fresh-context` — der Hauptmodus |
| Codex | Tier 1 — volles Plugin | nein | `self-persona-fallback` |
| Gemini | Tier 1 — volles Plugin | nein | `self-persona-fallback` |
| Cursor | Tier 2 — schlankes Plugin | nein | `self-persona-fallback` |
| Cline | Tier 2 — schlankes Plugin | nein | `self-persona-fallback` |
| Windsurf | Tier 3 — nur MCP | entfällt | kein Skill ausgeliefert — die Pipeline-Gates bleiben der einzige Schutz |
| Continue | Tier 3 — nur MCP | entfällt | kein Skill ausgeliefert — die Pipeline-Gates bleiben der einzige Schutz |

Die Prüfung ist **fähigkeitsbasiert, nicht namensbasiert**: Bekommt ein Client ein Subagenten-Tool, wechselt er zurück auf `fresh-context`, ohne dass diese Matrix sich ändert.

Der Fallback ist die ursprüngliche Kritiker-Persona-Selbstprüfung — *„wenn das von einem Junior käme, was würde ich anstreichen?"* — die 7 Dimensionen allein, mit den drei Linsen als Checkliste. Das ist die schwächere Prüfung und muss **erklärt, nicht versteckt** werden:

```json
{ "review_mode": "self-persona-fallback", "reviewers": [] }
```

Ein leeres `reviewers[]` allein ist noch kein Fallback-Signal — ein `approved-trivial`-Skip ist ebenfalls leer; es ist zusammen mit `review_mode` zu lesen. Der Slug `self-persona-fallback` ist mit Absicht greppbar: Er macht den schwächeren Modus über Flows hinweg auditierbar. Keine Lust auf den Dispatch ist kein Fallback-Grund, und `review_mode: "fresh-context"` für eine Alleinprüfung zu behaupten, führt der Skill ausdrücklich als Anti-Pattern („fake fresh-context").

## Abgrenzung — was das *nicht* ist

### Nicht die Engine-Gates (QA + Faktencheck)

Die Factory-App (devflow-desktop) fährt eigene Richter, **nachdem** der Builder fertig ist: `RunnerEngine.finishChain` startet `QAGate` und `HallucinationGate` (Faktencheck) gleichzeitig, danach Stakeholder → AutoMerge → ReleaseReadiness. Andere Ebene, mit Absicht:

| | `devflow-code-critic` (DF-535) | Engine-Gates (QA / Faktencheck) |
|---|---|---|
| Wo | in der Sitzung des Autors, im Client | eigene headless `claude`-Prozesse, von der App gestartet |
| Wann | **vor** `in_progress → review` | **nachdem** der Flow sich fertig meldet |
| Werkzeuge | Nur-Lese-Zugriff aufs Repo über das Agent-Tool des Clients | Repo-Lesezugriff, **bewusst ohne MCP-Config** — ein Richter darf den Flow, den er beurteilt, nicht bewegen können |
| Wirkung eines Befunds | beratend — der Autor triagiert und repariert | blockierend — ein FAIL stoppt die Kette, überspringt den Merge, gibt den Flow an den Builder zurück (WF-119) |
| Ohne Urteil | der Autor schuldet trotzdem ein Verdict | fail-open: unklar heißt, die Kette läuft weiter |

Sie ergänzen einander, sie doppeln sich nicht: Der Kritiker fängt Dinge ab, bevor ein Mensch oder ein Richter sie überhaupt sieht; die Gates sind die Außenkontrolle, die nicht davon abhängt, dass der Autor etwas ausführt. Keins ersetzt das andere — DF-535 fasst die Engine-Gates gar nicht an.

### Nicht `devflow-subagent-driven-dev`

Dieser Skill (DF-424/DF-427, `status: draft`, **nicht aktiv**) verteilt die **Implementierung**: Sub-Agenten pro Task, die in isolierten Worktrees Tests und Code schreiben, die der Orchestrator anschließend zurückmerged. Umgekehrte Richtung des Informationsflusses:

| | `devflow-code-critic` Fresh-Context | `devflow-subagent-driven-dev` |
|---|---|---|
| Rolle des Subagenten | Prüfer | Umsetzer |
| Schreibt Code | nie — meldet nur | ja, in `.claude/worktrees/<flowId>-task-<n>/` |
| Status | **aktiv**, Hauptmodus seit DF-535 | Draft; wartet auf eine 8-Flow-Roadmap |
| Grund der Isolation | Kontext-Hygiene (kein Anker) | Dateisystem-Hygiene (keine Task-Vermischung) |

Der Kritiker-Dispatch hängt **nicht** an dieser Roadmap: Er braucht nur einen Nur-Lese-Agent-Typ — keine Worktrees, keine Orchestrator-Logik, keine Token-Abrechnung pro Subagent.

## Tests

`scripts/tests/df535-fresh-context-critic.test.js` — 7 reine Datei-Inhalts-Prüfungen (kein Backend, kein MCP, kein Netz), gleiche Bauart wie `scripts/tests/welle-1-skills-verify.test.js`:

1. Die drei Linsen stehen in einer `Fresh-Context`-Sektion und gehen an Subagenten
2. Der Dispatch-Kontrakt benennt seine Kontextgrenze — Diff + ACs + Plan rein, Autoren-Begründung raus
3. Es gibt eine `self-persona-fallback`-Sektion, sie zitiert ADR-135 und sagt, dass sie für Clients ohne Subagenten-Tool gilt
4. Die Befunde gehen zur Triage an `devflow-receiving-review`
5. `scripts/pre-flow-update-code-critic.js` erwähnt den Fresh-Context-Dispatch
6. `devflow-receiving-review` verweist zurück auf den Kritiker
7. Die Testdatei ist im `npm test`-Skript verdrahtet

Suite nach DF-535: **166** `node --test`-Tests (vorher 159) und **83** vitest-Tests, alles grün.

## Warum diese Docs im MCP-Repo liegen

Die gesamte Änderung liegt in `devflow-mcp` — Skill-Body, Hook, Tests, `index.json` — und geht dort als ein PR raus. Docs neben der Änderung schlagen Docs ein Repo weiter weg, die beim nächsten Skill-Edit veralten. Das `devflow`-Repo behält seine CLAUDE.md-Steckbrief-Konvention (DF-307: keine neuen `## DF-XXX`-Sektionen; Architektur-Details gehen ins LLM-Wiki), es wird dort also nichts gedoppelt.

## Verwandt

- Skill: `packages/skills/skills/devflow-code-critic/SKILL.md`
- Hook: `scripts/pre-flow-update-code-critic.js`
- `devflow-receiving-review` — triagiert, was die Linsen liefern
- `devflow-plan-critic` — Schwester-Skill für `planning → approval`
- ADR-135 — Multi-Client Plugin-Strategie (3-Tier Support), aus DF-327 — der Grund für den Fallback
- DF-339 — hat die Kritiker-Skill-Familie eingeführt
- DF-520 — der Belegfall (R3)
- DF-424 / DF-427 — RFC und Abschluss zu `devflow-subagent-driven-dev`
- Englische Fassung: `FRESH_CONTEXT_CRITIC_DF535.md`
