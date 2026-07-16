import { parse as parseYaml } from "yaml";
import { BUILT_IN_TASK_FIELDS, type KanbanData, type KanbanTask, PRIORITY_LEVELS, type Priority } from "./types";

const PRIORITY_SET = new Set<string>(PRIORITY_LEVELS);

function toStringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  return String(value);
}

function toPriority(value: unknown): Priority | undefined {
  const s = toStringOrUndefined(value)?.toLowerCase();
  if (s && PRIORITY_SET.has(s)) return s as Priority;
  return undefined;
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  const s = toStringOrUndefined(value);
  if (!s) return [];
  // Also accept a comma-separated string form.
  return s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toTask(rawItem: unknown, srcIndex: number): KanbanTask | undefined {
  if (!rawItem || typeof rawItem !== "object") return undefined;
  const raw = rawItem as Record<string, unknown>;
  const title = toStringOrUndefined(raw.title);
  if (!title) return undefined; // title is required; skip malformed entries

  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(BUILT_IN_TASK_FIELDS as readonly string[]).includes(key)) {
      custom[key] = value;
    }
  }

  const orderRaw = raw.order;
  const order = typeof orderRaw === "number" ? orderRaw : orderRaw != null ? Number(orderRaw) : undefined;

  return {
    id: toStringOrUndefined(raw.id),
    title,
    status: toStringOrUndefined(raw.status),
    priority: toPriority(raw.priority),
    done: raw.done === true || raw.done === "true",
    order: Number.isFinite(order) ? (order as number) : undefined,
    tags: toTags(raw.tags),
    due: toStringOrUndefined(raw.due),
    createAt: toStringOrUndefined(raw.createAt),
    updateAt: toStringOrUndefined(raw.updateAt),
    custom,
    srcIndex,
  };
}

/**
 * Parses a `kanban` fenced code block into kanban board data. Returns an empty
 * task list (rather than throwing) when the YAML is invalid or malformed, so a
 * broken block degrades to the block component's empty state.
 */
export function parseKanbanBlock(raw: string): KanbanData {
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch {
    doc = undefined;
  }

  const root = (doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {}) ?? {};

  const itemsRaw = Array.isArray(root.items) ? root.items : [];
  // Map with the source index preserved (don't pre-filter) so srcIndex lines up
  // with each item's real position in the fenced block for write-back.
  const tasks = itemsRaw.map((item, index) => toTask(item, index)).filter((task): task is KanbanTask => !!task);

  const viewRaw = (root.view && typeof root.view === "object" ? (root.view as Record<string, unknown>) : {}) ?? {};

  const statusOrder = Array.isArray(root.statusOrder) ? root.statusOrder.map((s) => String(s)).filter(Boolean) : [];

  return {
    tasks,
    view: {
      type: toStringOrUndefined(viewRaw.type) ?? "kanban",
      groupBy: toStringOrUndefined(viewRaw.groupBy) ?? "status",
      orderBy: toStringOrUndefined(viewRaw.orderBy),
      descending: viewRaw.descending === true || viewRaw.descending === "true",
      lock: viewRaw.lock === true || viewRaw.lock === "true",
    },
    statusOrder,
  };
}
