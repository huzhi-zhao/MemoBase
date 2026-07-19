# 8. Document Comments

**Document comments** let you attach a discussion thread to a document while you
read it in the Notebook, right next to the content — without leaving the page or
opening the memo detail view. They reuse the exact same component and storage
plumbing as the **PDF annotations** described in
[Manual 2 · Rich Documents](./02-rich-documents.md), so a comment is just an
ordinary *comment memo* (a child memo) of the document.

The feature is available on the **Notebook document preview** — i.e. the home
page (`/`) when a document is open.

- **Toggle & panel host:** `web/src/components/Notebook/DocumentView.tsx`.
- **Comment panel:** `web/src/components/DocComments/DocCommentSidebar.tsx`.
- **Comment card (shared with PDF):** `web/src/components/DocComments/CommentCard.tsx`.
- **Heading anchoring helpers:** `web/src/components/DocComments/docAnchor.ts`.
- **PDF annotation panel (same card):** `web/src/components/PdfViewer/PdfAnnotationSidebar.tsx`.

---

## 8.1 Which documents support comments

| Doc type | Comment support | Anchoring |
|----------|-----------------|-----------|
| **Markdown** | ✅ Yes | Anchored to the nearest heading above the scroll position. |
| **View** (gallery) | ✅ Yes | Anchored to the nearest heading in a block's intro/footer Markdown snippet (falls back to top when there is none above). |
| **PDF** | ✅ Yes — via the existing **annotations** panel | Anchored to a rect on a page (see Manual 2). |
| **HTML** | ❌ No | — |

The panel is only offered for Markdown and View documents. PDF documents keep
their own annotation panel (which is spatially anchored to a page/rect). HTML
documents are intentionally skipped.

> The rule in code: `const supportsComments = !isPdf && !isHtml;` in
> `DocumentView.tsx`. The only doc types are Markdown / HTML / PDF / View, so
> "not PDF and not HTML" resolves to Markdown + View.

---

## 8.2 Opening the panel

Open a document from the Notebook. In the document title bar:

- A **speech-bubble icon** (💬) appears for Markdown / View documents. Click it
  to open the comment panel.
- The panel **shares the right-hand dock with the document outline** — opening
  comments collapses the outline, and opening the outline closes comments. They
  are never shown at the same time.

On desktop the panel docks as a column on the right. On narrow screens it opens
as a slide-in sheet from the right edge.

The panel header shows the comment count. Switching to a different document
closes the panel.

---

## 8.3 Writing a comment

There are two ways to start a comment.

**A. Select text (precise — anchors to that exact section).** With the comment
panel **open**, select any text in the rendered document. A small floating
**💬 Write a comment** button appears just above the selection; click it.
(Selection-to-comment is only active while the panel is open — close it and
selecting text does nothing special.) The comment panel opens with the editor already
**anchored to the heading nearest above your selection** — regardless of where you
have scrolled. This is the reliable way to comment on a specific section: the
anchor is captured from the *selection's* position, not the scroll position. (The
selection may visually clear as focus moves to the editor — that's expected; the
anchor was already captured on mouse-down.)

**B. Panel `+` button (quick — anchors to the current scroll position).** Click the
**+ (new comment)** icon in the panel header. The comment is anchored to the
nearest heading *above the top of the preview viewport*. Use this when you don't
need to pinpoint a section.

Either way, a full Markdown editor opens inside the panel; for a Markdown doc its
header shows `# <heading>` — the section the comment will be **anchored** to (see
§8.4). Write your comment (full Markdown, attachments, mentions, etc. — it is a
real memo) and confirm.

The new comment appears in the list immediately. Only signed-in users can create
comments.

### Editing a comment

Each comment card has an inline **Edit** (pencil) affordance that swaps the card
for the Markdown editor in place. Editing a comment's body **preserves its
anchor** — the anchor lives on the memo payload and is not recomputed from the
content.

---

## 8.4 Heading anchoring

Because Markdown documents have a clear heading structure, each comment records
**which heading it was written under**, so you can jump back to that section
later.

- The anchor is the **nearest heading above** the comment's origin: above the text
  selection when started from the floating button
  (`nearestHeadingAnchorForNode`), or above the scroll position when started from
  the panel `+` (`nearestHeadingAnchor`) — both in `docAnchor.ts`. This uses
  the rendered heading's DOM `id`, which is the same slug the
  [document outline](./01-knowledge-base.md) uses — so the anchor always matches
  a real outline entry.
- Each comment card shows a small `# heading` chip. **Clicking the card scrolls
  the document to that heading** (`scrollToHeading`), smoothly.
- If you comment above the first heading, the anchor is empty and means **"top of
  document"**; clicking such a comment scrolls back to the top.

### View documents

A View (gallery) document has no headings of its own, but each block can carry an
**intro** (`description`) and **footer** Markdown snippet, and headings inside
those snippets are anchorable just like a Markdown document's. Because each snippet
is rendered by its own Markdown pass, heading ids are made unique across the whole
View by prefixing them per block (`vb<index>-desc-…` / `vb<index>-foot-…`); the
`rehypeHeadingId` plugin also rewrites intra-snippet anchor links so in-snippet
"jump to heading" links keep working. Gallery **card titles are not headings**, so
they cannot be used as anchors.

Anchoring is best-effort: if the heading text is later edited or removed, the
comment keeps its stored label but the jump falls back gracefully (no-op if the
heading id no longer exists).

---

## 8.5 How it maps to PDF annotations

Document comments and PDF annotations are the **same feature** with a different
anchor shape:

| | PDF annotation | Document comment |
|---|----------------|------------------|
| Panel | `PdfAnnotationSidebar` | `DocCommentSidebar` |
| Card | `CommentCard` | `CommentCard` (shared) |
| Anchor payload | `PdfAnnotation` (attachment + page + rect) | `DocAnchor` (heading slug + text) |
| Grouping | By page | Flat thread |
| Jump target | Page / rect on the PDF | Heading in the rendered Markdown |

Both are created with the same `createMemoComment` call and listed with the same
`listMemoComments` call — they are ordinary comment memos, so they also show up
wherever comments are shown (e.g. the memo detail page).

---

## 8.6 Data model

A comment is a child memo. Its anchor is stored on the memo payload:

- **Store proto:** `MemoPayload.doc_anchor` (`DocAnchor { heading_slug,
  heading_text }`) in `proto/store/memo.proto`. This sits alongside the existing
  `pdf_annotation` field.
- **API proto:** `Memo.doc_anchor` (field 24) and the `DocAnchor` message in
  `proto/api/v1/memo_service.proto`.
- **Create path:** `CreateMemo` / `CreateMemoComment` in
  `server/router/api/v1/memo_service.go` copies `doc_anchor` into the payload via
  `convertDocAnchorToStore`.
- **Read path:** `convertDocAnchorFromStore` in
  `server/router/api/v1/memo_service_converter.go`.

Because the anchor lives on the payload (not derived from content),
`RebuildMemoPayload` — which recomputes only tags and properties on every content
edit — leaves it intact.

---

## 8.7 Notes & limitations

- **No spatial/inline text anchoring for Markdown.** Comments anchor to the
  nearest *heading*, not to an arbitrary text selection. Anchoring to a selected
  span (highlight-style) is a possible future enhancement.
- **View documents** anchor to headings inside a block's intro/footer Markdown
  snippet (heading ids are made globally unique per block); gallery card titles are
  not anchorable.
- **HTML documents** have no comment panel.
- Comments respect the same visibility and permission model as any other memo
  comment.
