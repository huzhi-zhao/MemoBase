import { useMemo, useState } from "react";
import { useTranslate } from "@/utils/i18n";
import { useBlockSource } from "./BlockSourceContext";
import { KanbanColumn } from "./kanban/KanbanColumn";
import { KanbanTaskDetail } from "./kanban/KanbanTaskDetail";
import { parseKanbanBlock } from "./kanban/parseKanbanBlock";
import { addTask, setTaskDone, setTaskStatus } from "./kanban/serializeKanbanBlock";
import type { KanbanData, KanbanTask } from "./kanban/types";
import { extractCodeContent } from "./utils";

interface KanbanBlockProps {
  children?: React.ReactNode;
  className?: string;
}

const UNGROUPED_KEY = "__ungrouped__";

// Reads the column key for a task from the configured groupBy field. Falls back
// to a sentinel for tasks missing that field, rendered as an "Ungrouped" column.
function groupKey(task: KanbanTask, groupBy: string): string {
  if (groupBy === "status") return task.status ?? UNGROUPED_KEY;
  const value = (task as unknown as Record<string, unknown>)[groupBy] ?? task.custom[groupBy];
  return value == null || value === "" ? UNGROUPED_KEY : String(value);
}

function sortWithin(tasks: KanbanTask[], data: KanbanData): KanbanTask[] {
  const { orderBy, descending } = data.view;
  const sorted = [...tasks].sort((a, b) => {
    // Default ordering is by the `order` field when no orderBy is configured.
    const key = orderBy ?? "order";
    const av = (a as unknown as Record<string, unknown>)[key] ?? a.custom[key];
    const bv = (b as unknown as Record<string, unknown>)[key] ?? b.custom[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return descending ? sorted.reverse() : sorted;
}

export const KanbanBlock = ({ children }: KanbanBlockProps) => {
  const t = useTranslate();
  const codeContent = extractCodeContent(children);
  const data = useMemo(() => parseKanbanBlock(codeContent), [codeContent]);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);

  const blockSource = useBlockSource();
  const readonly = blockSource?.readonly ?? true;
  // `view.lock: true` pins the board as view-only even when the document is
  // otherwise editable.
  const interactive = !!blockSource && !readonly && !data.view.lock;

  // Selection is tracked by srcIndex so it survives re-parsing after a write.
  const selectedTask = useMemo(() => data.tasks.find((task) => task.srcIndex === selectedIndex), [data.tasks, selectedIndex]);

  const writeContent = (newContent: string) => {
    blockSource?.save(newContent);
  };

  const handleToggleDone = (task: KanbanTask, done: boolean) => {
    if (!blockSource) return;
    writeContent(setTaskDone(blockSource.source, task.srcIndex, task.id, done));
  };

  const handleMoveTask = (payload: { srcIndex: number; id?: string }, status: string) => {
    if (!blockSource || status === UNGROUPED_KEY) return;
    writeContent(setTaskStatus(blockSource.source, payload.srcIndex, payload.id, status));
  };

  const handleAddTask = (status: string, title: string) => {
    if (!blockSource || status === UNGROUPED_KEY) return;
    writeContent(addTask(blockSource.source, status, title));
  };

  const columns = useMemo(() => {
    const { groupBy } = data.view;
    const buckets = new Map<string, KanbanTask[]>();
    // Seed configured columns so empty ones still render in the intended order.
    for (const key of data.statusOrder) {
      buckets.set(key, []);
    }
    for (const task of data.tasks) {
      const key = groupKey(task, groupBy);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(task);
    }
    return Array.from(buckets.entries()).map(([key, tasks]) => ({
      key,
      title: key === UNGROUPED_KEY ? t("markdown.kanban-block.ungrouped") : key,
      tasks: sortWithin(tasks, data),
    }));
  }, [data, t]);

  if (data.tasks.length === 0) {
    return <div className="px-1 py-2 text-sm text-muted-foreground">{t("markdown.kanban-block.empty")}</div>;
  }

  // Only status columns accept add/move; a groupBy on another field can't derive
  // the value to write, and the ungrouped bucket has no key to assign.
  const canEditColumn = interactive && data.view.groupBy === "status";

  return (
    <div className="not-prose flex flex-col gap-3">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            columnKey={column.key}
            title={column.title}
            tasks={column.tasks}
            selectedTask={selectedTask}
            onSelectTask={(task) => setSelectedIndex(task.srcIndex)}
            interactive={interactive}
            canEditColumn={canEditColumn && column.key !== UNGROUPED_KEY}
            onToggleDone={handleToggleDone}
            onMoveTask={handleMoveTask}
            onAddTask={handleAddTask}
          />
        ))}
      </div>
      <div className="rounded-lg border border-border/60 px-3 py-2">
        <KanbanTaskDetail task={selectedTask} />
      </div>
    </div>
  );
};
