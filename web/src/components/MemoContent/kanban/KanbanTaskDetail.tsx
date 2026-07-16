import { useTranslate } from "@/utils/i18n";
import type { KanbanTask } from "./types";

interface KanbanTaskDetailProps {
  task?: KanbanTask;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex gap-3 py-1 text-sm">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words">{value}</span>
  </div>
);

export const KanbanTaskDetail = ({ task }: KanbanTaskDetailProps) => {
  const t = useTranslate();

  if (!task) {
    return <div className="px-1 py-4 text-sm text-muted-foreground">{t("markdown.kanban-block.select-task")}</div>;
  }

  const customEntries = Object.entries(task.custom).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="flex flex-col">
      <div className="mb-2 text-base font-semibold">{task.title}</div>
      {task.status && <Row label={t("markdown.kanban-block.field.status")} value={task.status} />}
      {task.priority && <Row label={t("markdown.kanban-block.field.priority")} value={task.priority} />}
      <Row label={t("markdown.kanban-block.field.done")} value={task.done ? "✔" : "—"} />
      {task.due && <Row label={t("markdown.kanban-block.field.due")} value={task.due} />}
      {task.tags.length > 0 && <Row label={t("markdown.kanban-block.field.tags")} value={task.tags.map((tag) => `#${tag}`).join(" ")} />}
      {task.id && <Row label="ID" value={task.id} />}
      {task.createAt && <Row label={t("markdown.kanban-block.field.created")} value={task.createAt} />}
      {task.updateAt && <Row label={t("markdown.kanban-block.field.updated")} value={task.updateAt} />}
      {customEntries.map(([key, value]) => (
        <Row key={key} label={key} value={formatValue(value)} />
      ))}
    </div>
  );
};
