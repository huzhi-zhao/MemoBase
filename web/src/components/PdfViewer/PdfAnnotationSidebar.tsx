import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { CommentCard } from "@/components/DocComments/CommentCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import type { PdfAnnotationEntry } from "./usePdfAnnotations";

interface Props {
  annotations: PdfAnnotationEntry[];
  selectedMemoName?: string;
  onSelect?: (memoName: string, page: number) => void;
  onClose?: () => void;
  /** Called after an annotation's memo is edited in place, so the caller can refetch. */
  onEdited?: () => void;
  className?: string;
}

// Docked comment list, modeled after Adobe Acrobat's comments panel (title bar toggle,
// grouped by page, click-to-jump) but kept more compact: no per-comment reply affordance,
// smaller card padding, no avatar row — this app's PDF notes are jump targets, not a thread.
export const PdfAnnotationSidebar = ({ annotations, selectedMemoName, onSelect, onClose, onEdited, className }: Props) => {
  const t = useTranslate();
  const selectedRef = useRef<HTMLDivElement>(null);

  const pages = new Map<number, PdfAnnotationEntry[]>();
  for (const entry of annotations) {
    const list = pages.get(entry.page) ?? [];
    list.push(entry);
    pages.set(entry.page, list);
  }

  // Keep the selected entry (just created, or clicked on-page) in view instead of
  // leaving it scrolled off this independently-scrolling list.
  useEffect(() => {
    if (!selectedMemoName) return;
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedMemoName]);

  return (
    <div className={cn("w-full h-full min-h-0 flex flex-col border-l border-t border-border bg-background", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">
          {t("pdf.annotations")}
          {annotations.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{annotations.length}</span>}
        </span>
        {onClose && (
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onClose}>
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3 p-2.5 text-sm">
        {annotations.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-4">{t("pdf.no-annotations")}</div>
        ) : (
          Array.from(pages.entries()).map(([page, entries]) => (
            <div key={page} className="flex flex-col gap-1.5 min-w-0">
              <div className="px-0.5 text-xs font-medium text-muted-foreground">{t("pdf.page-n", { page })}</div>
              {entries.map((entry) => {
                const isSelected = entry.memo.name === selectedMemoName;
                return (
                  <CommentCard
                    key={entry.memo.name}
                    ref={isSelected ? selectedRef : undefined}
                    memo={entry.memo}
                    selected={isSelected}
                    onSelect={() => onSelect?.(entry.memo.name, entry.page)}
                    onEdited={onEdited}
                  />
                );
              })}
            </div>
          ))
        )}
      </nav>
    </div>
  );
};
