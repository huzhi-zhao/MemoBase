// Data model for the ```kanban fenced code block rendered as a kanban board.
// The block is machine-oriented YAML: an `items` list of task maps, plus a
// `view` config object and a top-level `statusOrder` array. Any key on a task
// beyond the built-in fields below is preserved as a custom field and shown in
// the task detail panel.

export const BUILT_IN_TASK_FIELDS = ["id", "title", "status", "priority", "done", "order", "tags", "due", "createAt", "updateAt"] as const;

// Five fixed priority levels, ordered most → least urgent.
export const PRIORITY_LEVELS = ["highest", "high", "medium", "low", "lowest"] as const;
export type Priority = (typeof PRIORITY_LEVELS)[number];

export interface KanbanTask {
  id?: string;
  title: string;
  status?: string;
  priority?: Priority;
  done?: boolean;
  order?: number;
  tags: string[];
  due?: string;
  createAt?: string;
  updateAt?: string;
  // Custom (non-built-in) fields, surfaced in the detail panel.
  custom: Record<string, unknown>;
  // Position of this task in the source `items` sequence, used to address the
  // row when writing edits back to the fenced block.
  srcIndex: number;
}

export interface KanbanViewConfig {
  type: string; // "kanban"
  groupBy: string; // field used for columns, defaults to "status"
  orderBy?: string; // field used to sort within a column
  descending: boolean;
  lock: boolean; // when true, the board is view-only even in an editable context
}

export interface KanbanData {
  tasks: KanbanTask[];
  view: KanbanViewConfig;
  // Explicit column order for the groupBy field. Columns not listed here are
  // appended after, in first-seen order.
  statusOrder: string[];
}
