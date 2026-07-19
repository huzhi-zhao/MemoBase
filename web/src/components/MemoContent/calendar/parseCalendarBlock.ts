export interface CalendarItem {
  text: string;
  checked?: boolean; // undefined = 无 checkbox 的纯文本条目
  isEvent?: boolean; // true = 该条目是一次 event 打点（text 为 event 名称）
}

export interface CalendarGroup {
  date?: string; // YYYY-MM-DD；undefined 表示"未分组"区块
  items: CalendarItem[];
}

export interface ParsedCalendar {
  events: string[]; // 预定义的 event 名称列表，顺序即颜色下标
  groups: CalendarGroup[];
}

const EVENTS_LINE_RE = /^@?events:\s*(.*)$/i;
const DATE_LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*$/;
const EVENT_ITEM_RE = /^-\s+@(.+)$/;
const ITEM_LINE_RE = /^-\s+(?:\[([ xX])\]\s+)?(.+)$/;

function parseEventsLine(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCalendarBlock(raw: string): ParsedCalendar {
  const groups: CalendarGroup[] = [];
  const events: string[] = [];
  let ungrouped: CalendarGroup | undefined;
  let current: CalendarGroup | undefined;

  for (const line of raw.split("\n")) {
    const eventsMatch = EVENTS_LINE_RE.exec(line.trim());
    if (eventsMatch) {
      for (const name of parseEventsLine(eventsMatch[1])) {
        if (!events.includes(name)) events.push(name);
      }
      continue;
    }

    const dateMatch = DATE_LINE_RE.exec(line);
    if (dateMatch) {
      current = { date: dateMatch[1], items: [] };
      groups.push(current);
      continue;
    }

    const eventMatch = EVENT_ITEM_RE.exec(line);
    if (eventMatch) {
      const item: CalendarItem = { text: eventMatch[1].trim(), isEvent: true };
      if (current) {
        current.items.push(item);
      } else {
        if (!ungrouped) ungrouped = { date: undefined, items: [] };
        ungrouped.items.push(item);
      }
      continue;
    }

    const itemMatch = ITEM_LINE_RE.exec(line);
    if (itemMatch) {
      const item: CalendarItem = {
        text: itemMatch[2],
        checked: itemMatch[1] === undefined ? undefined : itemMatch[1].toLowerCase() === "x",
      };
      if (current) {
        current.items.push(item);
      } else {
        if (!ungrouped) {
          ungrouped = { date: undefined, items: [] };
        }
        ungrouped.items.push(item);
      }
    }
  }

  if (ungrouped) {
    groups.unshift(ungrouped);
  }

  return { events, groups };
}
