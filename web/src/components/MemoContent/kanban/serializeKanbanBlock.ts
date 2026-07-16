// String-level edits to a ```kanban fenced code block within a memo's raw
// markdown content. Unlike the flat calendar block (which splices lines with
// regexes), the kanban block is nested YAML, so edits go through yaml's
// document API (parseDocument → mutate → stringify), which preserves comments
// and key order on round-trip. Only the fenced block's lines are replaced in
// the surrounding markdown.

import { type Document, parseDocument } from "yaml";

const FENCE_START_RE = /^```kanban\s*$/;
const FENCE_END_RE = /^```\s*$/;

interface KanbanFenceLocation {
  lines: string[];
  fenceStart: number;
  fenceEnd: number;
  blockText: string;
}

function locateKanbanFence(content: string): KanbanFenceLocation | undefined {
  const lines = content.split("\n");

  const fenceStart = lines.findIndex((line) => FENCE_START_RE.test(line));
  if (fenceStart === -1) return undefined;

  let fenceEnd = -1;
  for (let i = fenceStart + 1; i < lines.length; i++) {
    if (FENCE_END_RE.test(lines[i])) {
      fenceEnd = i;
      break;
    }
  }
  if (fenceEnd === -1) return undefined;

  return {
    lines,
    fenceStart,
    fenceEnd,
    blockText: lines.slice(fenceStart + 1, fenceEnd).join("\n"),
  };
}

function rebuildContent(location: KanbanFenceLocation, newBlockText: string): string {
  const { lines, fenceStart, fenceEnd } = location;
  const newBlockLines = newBlockText.replace(/\n$/, "").split("\n");
  return [...lines.slice(0, fenceStart + 1), ...newBlockLines, ...lines.slice(fenceEnd)].join("\n");
}

// "2026-07-16 14:30:00" — matches the timestamp style used in the block spec.
function formatNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Runs `mutate` against the parsed fence document and rebuilds `content`.
// Returns the original content unchanged if the fence is missing or `mutate`
// signals no change by returning false.
function editKanbanDoc(content: string, mutate: (doc: Document) => boolean): string {
  const location = locateKanbanFence(content);
  if (!location) return content;

  const doc = parseDocument(location.blockText);
  const changed = mutate(doc);
  if (!changed) return content;

  return rebuildContent(location, String(doc));
}

// Returns the index into the `items` sequence for the task at source position
// `srcIndex`, preferring an `id` match so edits stay correct even if the block
// was reordered between render and write.
function resolveItemIndex(doc: Document, srcIndex: number, id?: string): number | undefined {
  const seq = doc.get("items") as { items?: unknown[] } | undefined;
  const items = seq?.items;
  if (!Array.isArray(items)) return undefined;

  if (id) {
    for (let i = 0; i < items.length; i++) {
      if (doc.getIn(["items", i, "id"]) === id) return i;
    }
  }
  if (srcIndex >= 0 && srcIndex < items.length) return srcIndex;
  return undefined;
}

/** Sets a task's `done` flag and bumps its `updateAt`. */
export function setTaskDone(content: string, srcIndex: number, id: string | undefined, done: boolean): string {
  return editKanbanDoc(content, (doc) => {
    const index = resolveItemIndex(doc, srcIndex, id);
    if (index === undefined) return false;
    if (doc.getIn(["items", index, "done"]) === done) return false;
    doc.setIn(["items", index, "done"], done);
    doc.setIn(["items", index, "updateAt"], formatNow());
    return true;
  });
}

/** Moves a task to another column by rewriting its `status` (bumps `updateAt`). */
export function setTaskStatus(content: string, srcIndex: number, id: string | undefined, status: string): string {
  return editKanbanDoc(content, (doc) => {
    const index = resolveItemIndex(doc, srcIndex, id);
    if (index === undefined) return false;
    if (doc.getIn(["items", index, "status"]) === status) return false;
    doc.setIn(["items", index, "status"], status);
    doc.setIn(["items", index, "updateAt"], formatNow());
    return true;
  });
}

/** Appends a new task to the given column with a minted id and timestamps. */
export function addTask(content: string, status: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return content;

  return editKanbanDoc(content, (doc) => {
    const now = formatNow();
    const node = doc.createNode({
      id: generateId(),
      title: trimmed,
      status,
      createAt: now,
      updateAt: now,
    });

    const seq = doc.get("items") as { add?: (n: unknown) => void } | undefined;
    if (!seq || typeof seq.add !== "function") {
      doc.set("items", [node]);
    } else {
      seq.add(node);
    }
    return true;
  });
}
