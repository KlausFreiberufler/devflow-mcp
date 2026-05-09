---
name: devflow-flow-attachment
description: Use when the user asks you to attach a file to a flow ("häng X an", "attach to DF-XXX", "save this to the flow", "upload this"). Picks the right MCP tool (flow_upload for text, flow_upload_file for binaries) and the right kind. Iron law — never silently compress or truncate, prefer fail loud over corrupt-silently.
---

# DevFlow — Flow Attachment

You attach files to a flow when the user wants to persist context on a flow record. Two MCP tools, one decision tree.

## Trigger phrases (DE + EN)

- "häng X an [DF-…]" / "attach this to flow"
- "merk dir [Datei] auf dem Flow"
- "save this image as attachment"
- "upload das Bild zum Flow"
- "leg das als Attachment ab"
- "speichere das im Flow"

## Decision tree

```
Is the content already a string in your context (markdown/text/JSON you wrote yourself)?
  → flow_upload({ filename, content, kind? })

Is it a file on disk (image, PDF, large export, screenshot)?
  → flow_upload_file({ filePath, kind? })
```

When in doubt: text-content the agent created → `flow_upload`. File at a path → `flow_upload_file`.

## Kind auto-detection

| Filename / extension | Suggested `kind` | Why |
|---|---|---|
| `*plan*.md` | `plan` | Backend links it as `implementation_plan_attachment_id` |
| `*summary*.md` | `summary` | Code-review summary or post-flow report |
| `*decision*.md`, ADR-style | `decision` | Promotable to ADR via `adr_accept` |
| `*design*.md`, options/chosen | `design` | Architecture sketches |
| screenshots, photos, PDFs, generic notes | `notes` | Default for visual / reference content |

If the user is explicit about kind, use that. Otherwise pick from the table.

## Examples

**User:** „häng /tmp/cover.png an DF-361 als notes"
**You:**
```ts
flow_upload_file({
  flowId: "DF-361",
  filePath: "/tmp/cover.png",
  kind: "notes",
})
```

**User:** „save the LinkedIn post text as attachment on the current flow"
**You:**
```ts
flow_upload({
  filename: "linkedin-post.md",
  content: "<the markdown you generated>",
  kind: "notes",
})
```

**User:** „attach this implementation plan I wrote in /Users/klaus/Documents/plan.md"
**You:**
```ts
flow_upload_file({
  filePath: "/Users/klaus/Documents/plan.md",
  kind: "plan",
})
```
(Backend validates the YAML frontmatter against the plan-schema. If it fails, surface the error to the user — don't silently strip frontmatter.)

## Iron law — never silently compress or truncate

Backend supports up to **50 MB per file**. If the file is larger:

- **Don't** silently compress / re-encode the image to fit the limit.
- **Don't** silently truncate text content.
- **Do** tell the user the file is too big, suggest options:
  - Compress the image yourself (lossy / lossless), then re-attach.
  - Move large media to a CDN and attach a `.txt` with the URL.
  - Split a large CSV/JSON into chunks if logical.

The user's data integrity always wins over convenience.

## Mime-type allowlist (backend)

Only files in this list get accepted by the backend:

- Images: `png`, `jpg`/`jpeg`, `gif`, `webp`, `svg`
- Documents: `pdf`
- Text: `txt`, `md`, `html`
- Structured: `json`, `yaml`/`yml`, `csv`

Outside this list → 400. Let the user know which extension is unsupported rather than silently failing.

## Verification

After upload, `flow_upload_file` returns the asset URL. If the user wants to confirm it's visible:

- The DevFlow UI's flow detail page shows attachments.
- The URL is `{api-base}/api/flows/<flowId>/attachments/<attachmentId>/content` and requires the JWT bearer to view in browser (open via the UI, not the raw URL).
