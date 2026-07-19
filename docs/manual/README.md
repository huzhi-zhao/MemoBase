# User Manual

Operation manuals for the knowledge-base features this project adds on top of
[usememos/memos](https://github.com/usememos/memos). Upstream Memos is a
timeline-first, single-note capture tool; this fork keeps everything Memos does
and layers a **hierarchical, Yuque-like knowledge base** and **Notion-style
views** on top of it.

If you are new here, read the manuals in order — each builds on the previous
one.

| # | Manual | What it covers |
|---|--------|----------------|
| 1 | [Knowledge Base & Hierarchy](./01-knowledge-base.md) | Workspaces, folder trees, the Notebook home page, the Bookshelf, the reworked Explore page, document outline, and "resume where you left off". |
| 2 | [Rich Documents & Media](./02-rich-documents.md) | The four document types (Markdown / HTML / PDF / View), uploading docs vs. files, the HTML sandbox renderer, the PDF viewer with annotations & text extraction, inline audio/video, and S3 storage + backup. |
| 3 | [Gallery Views](./03-gallery-views.md) | Notion-style `view` documents: creating a gallery, scopes, sorting, cover rules, card fields, and how views stay live. |
| 4 | [Markdown Editor Optimization ](04-md-editor-optimization.md) | Notion / Obsidian–style formatting shortcuts in the CodeMirror editor: bold, italic, code, links, lists, headings, and what's intentionally deferred. |
| 5 | [memogit CLI](./05-memogit-cli.md) | Checking a knowledge base out to local files with the `memogit` command-line tool: install, `login` / `clone` / `pull` / `push` / `status`, the workspace/folder-path/doc-type file layout, one-way attachment download, IDE-mergeable conflict resolution, config & state, and troubleshooting. |
| 6 | [View Blocks](./06-view-blocks.md) | The four interactive fenced blocks — `calendar`, `kanban`, `grid`, `sheets`: their syntax, fields, formulas, interactive write-back gestures, and a [complete copy-paste demo](./demo-views.md). |
| 7 | [HTTP API Reference](./07-api-reference.md) | The JSON/HTTP API for the knowledge-base features: `WorkspaceService`, `RagService` (hybrid search), `AIService` (writing assistants), and the workspace / folder / doc-type / share-link additions to `MemoService`. |
| 8 | [Document Comments](./08-document-comments.md) | Commenting on a document while reading it in the Notebook: the shared comment panel (reused from PDF annotations), heading anchoring for Markdown docs, the outline/comments dock toggle, and the `DocAnchor` data model. |

## Core concepts at a glance

- **Workspace (knowledge base)** — the top-level container. Every document
  belongs to exactly one workspace. Think of it as a Yuque knowledge base or an
  Obsidian vault.
- **Folder path** — documents live under a slash-separated path inside a
  workspace (e.g. `garden/notes`). Folders are path prefixes, so moving or
  renaming a folder is a prefix update.
- **Document (memo)** — one record = one document. A document has a `doc_type`:
  `MARKDOWN`, `HTML`, `PDF`, or `VIEW`.
- **View** — a special document whose content is *configuration only*. It
  renders a live gallery of other documents each time it is opened.

## Terminology note

Throughout these manuals, **"knowledge base"**, **"workspace"**, and
**"project"** refer to the same thing. The code and API call it `workspace`;
the product UI calls it a knowledge base. The word "project" survives only
because tools like Obsidian and JetBrains use it for the same idea.
