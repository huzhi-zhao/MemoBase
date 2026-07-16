# 6. Kanban Board

A **kanban board** is an interactive view embedded *inside* a Markdown
document — not a separate document type. You write a fenced ` ```kanban ` code
block whose body is YAML describing a list of tasks; when the document is
rendered, that block turns into a live board with columns, cards, and (in the
document's own editor) direct manipulation that **writes changes back into the
Markdown**.

It follows the same "special fenced block" mechanism as the `calendar` and
`grid` blocks: the code-block renderer dispatches on the fence language and
hands the block off to a dedicated component.

- **Trigger:** a fenced code block with language `kanban`.
- **Dispatch:** `web/src/components/MemoContent/CodeBlock.tsx` (`language === "kanban"`).
- **Renderer:** `web/src/components/MemoContent/KanbanBlock.tsx`.
- **Parser:** `web/src/components/MemoContent/kanban/parseKanbanBlock.ts`.
- **Write-back:** `web/src/components/MemoContent/kanban/serializeKanbanBlock.ts`.

---

## 6.1 Writing a board

Put a YAML body inside a ` ```kanban ` fence:

````markdown
```kanban
items:
  - id: t1
    title: Learn Spark
    status: 需求
    priority: high
    due: 2026-07-20
    tags: [BigData]
  - id: t2
    title: Finish AI homework
    status: 开发
    priority: medium
    done: true

view:
  type: kanban
  groupBy: status
  descending: false

statusOrder: ['需求', '开发', '测试', '发布']
```
````

The body has three top-level keys:

| Key | Meaning |
|-----|---------|
| `items` | The list of task cards. Each item is a map of fields (see §6.2). |
| `view` | Board configuration (see §6.3). |
| `statusOrder` | Explicit left-to-right column order for the `groupBy` field. |

A malformed body (invalid YAML, or no items with a `title`) degrades to an
empty-state message rather than breaking the document.

---

## 6.2 Task fields

Each entry under `items` describes one card. All fields are optional **except
`title`** — an item without a title is skipped.

| Field | Type | Used for |
|-------|------|----------|
| `id` | string | Stable identity for write-back. Auto-generated when missing on first edit (see §6.5). |
| `title` | string | Card heading. **Required.** |
| `status` | string | Which column the card sits in (when `groupBy` is `status`). |
| `priority` | enum | Colored badge. One of `highest`, `high`, `medium`, `low`, `lowest`. |
| `done` | boolean | Completion. A done card is greyed out with a struck-through title and a checked box. |
| `order` | number | Sort position within its column (default sort key). |
| `tags` | list or comma-string | Chips shown on the card (`[BigData]` or `"a, b"`). |
| `due` | string | Due date shown with a calendar icon. |
| `createAt` / `updateAt` | string | Timestamps. `updateAt` is bumped automatically on every write-back. |

**Custom fields.** Any key you add beyond the built-ins above (e.g. `owner`,
`estimate`) is preserved and shown in the **task detail panel** below the board
when you click the card. It is not lost on write-back.

---

## 6.3 View configuration

The `view` map controls how cards are grouped and ordered:

| Key | Default | Meaning |
|-----|---------|---------|
| `type` | `kanban` | View style identifier. |
| `groupBy` | `status` | The task field used to form columns. |
| `orderBy` | `order` | The field used to sort cards **within** a column. |
| `descending` | `false` | Reverse the within-column sort. |
| `lock` | `false` | When `true`, the board is **view-only** — every interaction in §6.4 is disabled even on your own editable document. Use it to freeze a finished board. |

Column ordering:

- Columns listed in `statusOrder` render first, in that order — **including
  empty ones**, so a board keeps a stable shape.
- Any grouping value not in `statusOrder` is appended after, in first-seen
  order.
- Cards missing the `groupBy` field collect in a trailing **Ungrouped** column.

---

## 6.4 Interactions (what the page can change)

The board is **read-only** in most contexts (the Explore feed, shared views,
previews of someone else's document). Direct manipulation is enabled **only
when you are viewing your own document in a context that can save it** — the
same condition the `calendar` block uses to allow edits.

When editable, three gestures write straight back into the Markdown:

| Gesture | Effect | Field written |
|---------|--------|---------------|
| **Click a card's checkbox** | Toggle completion | `done` (+ `updateAt`) |
| **Drag a card to another column** | Move between statuses | `status` (+ `updateAt`) |
| **"Add task" at the bottom of a column** | Create a card in that column | new item with `id`, `title`, `status`, `createAt`, `updateAt` |

Notes and current limits:

- Drag-to-move and Add are available **only when `groupBy` is `status`** and
  only on real columns — the *Ungrouped* column has no value to assign, so it
  accepts neither.
- Clicking anywhere else on a card selects it and opens its **detail panel**
  below the board (all built-in and custom fields).
- **Reordering within a column, inline field editing, and deleting cards are
  not in this release** — they are the planned next tier (see §6.6).

---

## 6.5 How write-back works

Edits do **not** re-render the block to HTML — they rewrite the YAML inside the
fence, then save the document through the normal update-memo API
(`updateMask: ["content", "update_time"]`).

- Only the lines **between the fences** are touched; the surrounding Markdown is
  left exactly as-is.
- The YAML is edited through the `yaml` document API (parse → mutate →
  stringify), which **preserves comments and key order** across a round-trip.
- Cards are addressed by `id` when present (robust even if the block was
  reordered), falling back to source position. When you edit a card that has no
  `id` — or add a new one — an `id` is minted so future edits stay stable.

**Formatting caveat:** because the block is re-serialized by the YAML library,
its own formatting (indentation, quote style) is normalized after the first
write. Comments and key order survive; hand-crafted alignment does not. This is
an accepted trade-off for a machine-oriented view block.

---

## 6.6 Roadmap (not in this release)

- **Reorder within a column** (drag up/down → renumber `order`).
- **Inline editing** of a card's fields from the detail panel.
- **Delete** a card.
- **Column management** — add / rename / reorder columns by editing
  `statusOrder`.
