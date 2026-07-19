// 一套固定的 event 颜色，按 events 数组下标取用（超出后循环复用）。
export const EVENT_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function getEventColor(index: number): string {
  if (index < 0) return "#9ca3af"; // 未知 event 用灰色兜底
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

// 根据 event 名称在预定义列表中的位置取色。
export function getEventColorByName(name: string, events: string[]): string {
  return getEventColor(events.indexOf(name));
}
