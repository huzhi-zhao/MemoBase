import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  MessageSquarePlusIcon,
  MessageSquareTextIcon,
  ScrollTextIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import type { PdfOrientation } from "./usePdfViewerState";

interface Props {
  orientation: PdfOrientation;
  pageNumber: number;
  numPages: number;
  pagesPerView: number;
  scale: number;
  loading: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
  onToggleOrientation: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  className?: string;
  annotateMode?: boolean;
  onToggleAnnotateMode?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** Whether the plain-text panel is open. Omit (with onToggleText) to hide the button. */
  textOpen?: boolean;
  onToggleText?: () => void;
}

export const PdfToolbar = ({
  orientation,
  pageNumber,
  numPages,
  pagesPerView,
  scale,
  loading,
  canGoPrev,
  canGoNext,
  canZoomOut,
  canZoomIn,
  onToggleOrientation,
  onPrev,
  onNext,
  onZoomOut,
  onZoomIn,
  className,
  annotateMode,
  onToggleAnnotateMode,
  sidebarOpen,
  onToggleSidebar,
  textOpen,
  onToggleText,
}: Props) => {
  const t = useTranslate();

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      <Button variant="ghost" size="icon" onClick={onToggleOrientation} title={t("pdf.toggle-orientation")}>
        {orientation === "vertical" ? <BookOpenIcon className="w-4 h-4" /> : <ScrollTextIcon className="w-4 h-4" />}
      </Button>
      {orientation === "horizontal" && (
        <>
          <Button variant="ghost" size="icon" disabled={!canGoPrev} onClick={onPrev}>
            <ChevronLeftIcon className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-16 text-center">
            {loading
              ? t("pdf.loading")
              : pagesPerView === 2
                ? `${pageNumber}-${Math.min(pageNumber + 1, numPages)} / ${numPages}`
                : `${pageNumber} / ${numPages}`}
          </span>
          <Button variant="ghost" size="icon" disabled={!canGoNext} onClick={onNext}>
            <ChevronRightIcon className="w-4 h-4" />
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" disabled={!canZoomOut} onClick={onZoomOut}>
        <ZoomOutIcon className="w-4 h-4" />
      </Button>
      <span className="text-sm text-muted-foreground min-w-12 text-center">{Math.round(scale * 100)}%</span>
      <Button variant="ghost" size="icon" disabled={!canZoomIn} onClick={onZoomIn}>
        <ZoomInIcon className="w-4 h-4" />
      </Button>
      {onToggleAnnotateMode && (
        <Button variant={annotateMode ? "secondary" : "ghost"} size="icon" onClick={onToggleAnnotateMode} title={t("pdf.add-annotation")}>
          <MessageSquarePlusIcon className="w-4 h-4" />
        </Button>
      )}
      {onToggleSidebar && (
        <Button variant={sidebarOpen ? "secondary" : "ghost"} size="icon" onClick={onToggleSidebar} title={t("pdf.annotations")}>
          <MessageSquareTextIcon className="w-4 h-4" />
        </Button>
      )}
      {onToggleText && (
        <Button variant={textOpen ? "secondary" : "ghost"} size="icon" onClick={onToggleText} title={t("pdf.view-plain-text")}>
          <FileTextIcon className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
