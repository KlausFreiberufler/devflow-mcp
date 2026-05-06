# @dev-flow-tech/skills

**Single-Source-of-Truth** für die DevFlow-Skills.

Wird konsumiert von:
- Claude Code Plugin (`.claude-plugin/` im selben Repo, via Symlink `skills/`)
- Codex CLI Plugin (DF-336, geplant)
- Gemini CLI Plugin (DF-337, geplant)
- Cursor Bundle (DF-338, geplant)

## Struktur

```
packages/skills/
├── package.json          # @dev-flow-tech/skills@1.0.0
├── index.json            # auto-generated, listet alle Skills mit Metadaten
├── README.md             # diese Datei
├── scripts/
│   └── build-index.js    # generiert index.json aus SKILL.md-Frontmatter
├── __tests__/
│   └── skill-schema.test.js  # pinnt Frontmatter-Contract
└── skills/               # 19 Skill-Folder
    ├── devflow-tdd/
    │   └── SKILL.md
    ├── devflow-knowledge-completer/
    │   └── SKILL.md
    └── ...
```

## SKILL.md Format

Jeder Skill ist ein Folder unter `skills/<name>/` mit einer `SKILL.md`-Datei. Die Frontmatter folgt diesem Schema:

```yaml
---
name: devflow-tdd                   # required, muss = Folder-Name
description: ...                    # required, 1-3 Sätze, "When to use"
flow_state: in_progress             # optional, gating-Hint
hooks: [3]                          # optional, hook-Phases
discipline_token: devflow-tdd       # optional, für Self-Approval-Gates
ported_from: superpowers:tdd        # optional, Provenance
iron_laws:                          # optional, Liste der unverhandelbaren Regeln
  - No production code without a failing test first.
---

# Skill: devflow-tdd

> Body in Markdown.
```

## Neuen Skill anlegen

1. `mkdir packages/skills/skills/devflow-<new-skill>`
2. `SKILL.md` mit Frontmatter + Body schreiben
3. `npm run --workspace @dev-flow-tech/skills build:index` (oder via root)
4. `node --test packages/skills/__tests__/` laufen lassen — bestätigt Frontmatter

## Konsumenten-Plugins

Jedes Plugin sourced die Skills auf seine Weise:

| Plugin | Pfad | Mechanismus |
|---|---|---|
| Claude Code | `.claude-plugin/skills/` (via Symlink `skills/`) | Plugin-Root liest skills/ relativ |
| Codex CLI | `.codex-plugin/skills/` | Build-time Copy aus packages/skills/skills/ |
| Gemini CLI | `gemini-extension/skills/` | Build-time Copy |
| Cursor | `.cursor/skills/` | Build-time Copy via setup-script |

**Iron Rule:** Nie Skill-Inhalt in einem Konsumenten-Plugin manuell editieren. Source ist hier. Konsumenten haben nur Build-Time-Snapshots.

## Tests

```bash
# Schema-Test (Frontmatter-Contract)
node --test packages/skills/__tests__/skill-schema.test.js

# Index regenerieren
node packages/skills/scripts/build-index.js
```

## Versioning

Skills folgen Semver:
- **Patch** — Skill-Body-Änderungen die das Iron-Law-Set nicht ändern
- **Minor** — neue Skills hinzugefügt
- **Major** — Skill entfernt oder Iron-Law-Set verändert (Breaking)

Versionsbump: `packages/skills/package.json` `version` field.

## Related

- Parent-Decision: DF-327 (Multi-Client Plugin-Strategie)
- Implementation-Flow: DF-335 (this — shipped 2026-05-06)
- Future: DF-336 (Codex), DF-337 (Gemini), DF-338 (Cursor)
