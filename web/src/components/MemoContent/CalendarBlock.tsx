import { useMemo, useState } from "react";
import { useTodayDate } from "@/components/ActivityCalendar/hooks";
import { useMemoViewContextOptional } from "@/components/MemoView/MemoViewContext";
import { useUpdateMemo } from "@/hooks/useMemoQueries";
import { useTranslate } from "@/utils/i18n";
import { CalendarDayDetail } from "./calendar/CalendarDayDetail";
import { CalendarMonthGrid } from "./calendar/CalendarMonthGrid";
import { CalendarUngroupedSection } from "./calendar/CalendarUngroupedSection";
import { defaultVisibleMonth, type VisibleMonth } from "./calendar/defaultVisibleMonth";
import { type CalendarItem, parseCalendarBlock } from "./calendar/parseCalendarBlock";
import { toggleCalendarEvent, toggleCalendarItem, upsertCalendarItem } from "./calendar/upsertCalendarItem";
import { extractCodeContent } from "./utils";

interface CalendarBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export const CalendarBlock = ({ children }: CalendarBlockProps) => {
  const t = useTranslate();
  const codeContent = extractCodeContent(children);
  const parsed = useMemo(() => parseCalendarBlock(codeContent), [codeContent]);
  const { events, groups } = parsed;

  const datedGroups = useMemo(() => groups.filter((g) => g.date), [groups]);
  const ungroupedItems = (groups.find((g) => !g.date)?.items ?? []).filter((i) => !i.isEvent);

  const today = useTodayDate();
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(() => defaultVisibleMonth());
  const [selectedDate, setSelectedDate] = useState<string | undefined>(() => today);

  const memoViewContext = useMemoViewContextOptional();
  const memo = memoViewContext?.memo;
  const readonly = memoViewContext?.readonly ?? true;
  const { mutate: updateMemo } = useUpdateMemo();

  const handleAddItems = (date: string, rawInput: string) => {
    if (!memo) return;
    const newContent = upsertCalendarItem(memo.content, date, rawInput);
    if (newContent === memo.content) return;
    updateMemo({
      update: {
        name: memo.name,
        content: newContent,
      },
      updateMask: ["content", "update_time"],
    });
  };

  const handleToggleItem = (date: string, itemIndex: number, checked: boolean) => {
    if (!memo) return;
    const newContent = toggleCalendarItem(memo.content, date, itemIndex, checked);
    if (newContent === memo.content) return;
    updateMemo({
      update: {
        name: memo.name,
        content: newContent,
      },
      updateMask: ["content", "update_time"],
    });
  };

  const handleToggleEvent = (date: string, name: string, occurred: boolean) => {
    if (!memo) return;
    const newContent = toggleCalendarEvent(memo.content, date, name, occurred);
    if (newContent === memo.content) return;
    updateMemo({
      update: {
        name: memo.name,
        content: newContent,
      },
      updateMask: ["content", "update_time"],
    });
  };

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of datedGroups) {
      counts[group.date!] = group.items.length;
    }
    return counts;
  }, [datedGroups]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const group of datedGroups) {
      map[group.date!] = group.items;
    }
    return map;
  }, [datedGroups]);

  // 每个日期发生的 event 名称（去重、按预定义顺序），供日历格子底部打点用。
  const eventsByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const group of datedGroups) {
      const names: string[] = [];
      for (const item of group.items) {
        if (item.isEvent && events.includes(item.text) && !names.includes(item.text)) {
          names.push(item.text);
        }
      }
      if (names.length > 0) {
        names.sort((a, b) => events.indexOf(a) - events.indexOf(b));
        map[group.date!] = names;
      }
    }
    return map;
  }, [datedGroups, events]);

  if (groups.length === 0) {
    return <div className="text-sm text-muted-foreground px-1 py-2">{t("markdown.calendar-block.empty")}</div>;
  }

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
  };

  const handleMonthChange = (month: VisibleMonth) => {
    setVisibleMonth(month);
    if (selectedDate) {
      const stillInMonth = selectedDate.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`);
      if (!stillInMonth) {
        setSelectedDate(undefined);
      }
    }
  };

  const effectiveDate = selectedDate ?? today;
  const selectedGroup = datedGroups.find((g) => g.date === effectiveDate);

  return (
    <div className="flex flex-col gap-3 not-prose">
      {ungroupedItems.length > 0 && <CalendarUngroupedSection items={ungroupedItems} />}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="md:basis-[60%] md:grow-[6] md:shrink-0 md:border-r md:border-border/40 md:pr-4">
          <CalendarMonthGrid
            month={visibleMonth}
            onMonthChange={handleMonthChange}
            itemCounts={itemCounts}
            itemsByDate={itemsByDate}
            eventsByDate={eventsByDate}
            events={events}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />
        </div>
        <div className="md:basis-[40%] md:grow-[4] md:shrink-0 md:pl-4">
          <CalendarDayDetail
            group={selectedGroup}
            selectedDate={effectiveDate}
            readonly={readonly}
            events={events}
            onAddItems={memo ? handleAddItems : undefined}
            onToggleItem={memo ? handleToggleItem : undefined}
            onToggleEvent={memo ? handleToggleEvent : undefined}
          />
        </div>
      </div>
    </div>
  );
};
