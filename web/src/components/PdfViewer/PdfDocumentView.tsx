import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MemoEditor from "@/components/MemoEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { memoServiceClient } from "@/connect";
import { extractAttachmentUidFromName } from "@/helpers/resource-names";
import useMediaQuery from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { MemoSchema, PdfAnnotationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { DEFAULT_MARK_COLOR } from "@/utils/markColors";
import { PdfAnnotationSidebar } from "./PdfAnnotationSidebar";
import type { PdfMarkStyle, PdfSelectionPayload } from "./PdfPageCanvas";
import { PdfPages } from "./PdfPages";
import { PdfTextSidebar } from "./PdfTextSidebar";
import { PdfToolbar } from "./PdfToolbar";
import { usePdfAnnotations } from "./usePdfAnnotations";
import { usePdfExtractedText } from "./usePdfExtractedText";
import { usePdfViewerState } from "./usePdfViewerState";

// Which docked side panel is showing. Annotations (comments) and the plain-text view share the
// same slot and are mutually exclusive; null means the panel is closed.
type SidebarPanel = "annotations" | "text" | null;

interface Props {
  url: string;
  /** DOM node (typically a slot in a parent title bar) the toolbar is portaled into. */
  toolbarSlot: HTMLElement;
  className?: string;
  /** The memo this PDF is attached to. Annotation comments are anchored to it. Omit to disable annotations (e.g. no memo context available). */
  parentMemoName?: string;
  /** The attachment's resource name (attachments/{uid}), used to anchor annotations to this specific file. */
  attachmentName?: string;
  /** The attachment's filename, passed to the AI as a hint when formatting the extracted text. */
  filename?: string;
  /** Page to open on (e.g. restored from a scroll-position cache). Only applied on mount/url change. */
  initialPageNumber?: number;
  /** Fired whenever the current page changes (paginated mode only — see usePdfViewerState). */
  onPageNumberChange?: (page: number) => void;
}

// Splits the PDF viewer into a toolbar (portaled into a caller-provided slot, e.g. a
// document title bar) and a pages area rendered inline — used by DocumentView so the
// page/zoom/orientation controls can sit next to the title instead of above the content.
export const PdfDocumentView = ({
  url,
  toolbarSlot,
  className,
  parentMemoName,
  attachmentName,
  filename,
  initialPageNumber,
  onPageNumberChange,
}: Props) => {
  const t = useTranslate();
  const state = usePdfViewerState(url, initialPageNumber);
  const onPageNumberChangeRef = useRef(onPageNumberChange);
  onPageNumberChangeRef.current = onPageNumberChange;
  useEffect(() => {
    onPageNumberChangeRef.current?.(state.pageNumber);
  }, [state.pageNumber]);
  const isDesktop = useMediaQuery("lg");
  const [annotateMode, setAnnotateMode] = useState(true);
  const [selectedMemoName, setSelectedMemoName] = useState<string>();
  const [pendingAnnotation, setPendingAnnotation] = useState<{ page: number; selection: PdfSelectionPayload }>();
  // An existing bare mark whose note is being written for the first time (see `noteOnMark`).
  const [editingMarkName, setEditingMarkName] = useState<string>();
  const [activePanel, setActivePanel] = useState<SidebarPanel>(null);
  // Bumped whenever a PDF page-number badge is clicked, telling the text panel to scroll to
  // that page. The nonce lets clicking the same page twice re-trigger the scroll.
  const [textScrollTarget, setTextScrollTarget] = useState<{ page: number; nonce: number }>();
  const canAnnotate = !!parentMemoName && !!attachmentName;
  const { byPage, all, refetch } = usePdfAnnotations(parentMemoName, attachmentName);
  // Only annotations with something written in them belong in the panel; a bare mark is pure
  // styling on the page's text and would otherwise show up as an empty card.
  const notedAnnotations = useMemo(() => all.filter((entry) => entry.memo.content.trim()), [all]);
  const editingMarkEntry = useMemo(() => all.find((entry) => entry.memo.name === editingMarkName), [all, editingMarkName]);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const defaultOpenedRef = useRef(false);
  // Docked-panel width in px. null keeps the CSS default (30% of the row); a drag on the
  // left-edge handle switches to an explicit px width, clamped to a sane range.
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const sidebarWrapperRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWrapperRef.current?.getBoundingClientRect().width ?? 0;
    const onMove = (ev: MouseEvent) => {
      // Dragging left (clientX decreasing) widens the right-docked panel.
      const next = startWidth + (startX - ev.clientX);
      setSidebarWidth(Math.min(Math.max(next, 240), window.innerWidth * 0.7));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  };

  // Extract + AI-format the text only once the text panel has been opened, reusing the
  // already-loaded pdf.js document so no second fetch/parse is needed.
  const textResult = usePdfExtractedText({
    uid: attachmentName ? extractAttachmentUidFromName(attachmentName) : "",
    url,
    filename: filename ?? "",
    doc: state.doc,
    numPages: state.numPages,
    enabled: activePanel === "text" && !!state.doc && state.numPages > 0,
  });

  const registerPageRef = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  // Both anchors always ride along: the quote selector the mark is drawn from, and the
  // normalized rect that keeps the annotation locatable if the text can't be resolved.
  const buildAnnotation = useCallback(
    (page: number, selection: PdfSelectionPayload, style: PdfMarkStyle) =>
      create(PdfAnnotationSchema, {
        attachmentName,
        page,
        x: selection.rect.x,
        y: selection.rect.y,
        width: selection.rect.width,
        height: selection.rect.height,
        textSnippet: selection.text,
        textExact: selection.quote?.exact ?? "",
        textPrefix: selection.quote?.prefix ?? "",
        textSuffix: selection.quote?.suffix ?? "",
        color: style.color,
        underline: style.underline,
      }),
    [attachmentName],
  );

  // A bare mark: a comment with no written note, existing only to colour its text — the same
  // shape the EPUB reader and the notebook document use. Adding a note later is a plain
  // comment edit in the sidebar; the anchor and styling ride along untouched.
  const createMark = useCallback(
    async (page: number, selection: PdfSelectionPayload, style: PdfMarkStyle) => {
      if (!parentMemoName || !attachmentName) return;
      await memoServiceClient.createMemoComment({
        name: parentMemoName,
        comment: create(MemoSchema, { content: "", pdfAnnotation: buildAnnotation(page, selection, style) }),
      });
      refetch();
    },
    [parentMemoName, attachmentName, buildAnnotation, refetch],
  );

  // Restyle an existing mark, keeping its anchor and any note it carries.
  const restyleMark = useCallback(
    async (memoName: string, style: PdfMarkStyle) => {
      const entry = all.find((a) => a.memo.name === memoName);
      if (!entry?.memo.pdfAnnotation) return;
      // Re-picking what the mark already has changes nothing — don't spend a round trip on it.
      if (entry.color === style.color && entry.underline === style.underline) return;
      await memoServiceClient.updateMemo({
        memo: create(MemoSchema, {
          name: memoName,
          pdfAnnotation: { ...entry.memo.pdfAnnotation, color: style.color, underline: style.underline },
        }),
        updateMask: create(FieldMaskSchema, { paths: ["pdf_annotation"] }),
      });
      refetch();
    },
    [all, refetch],
  );

  // Clearing a mark that carries a note only drops its styling — the note is the valuable part
  // and stays anchored to its text. A bare mark *is* only its styling, so clearing it removes
  // the comment outright.
  const clearMark = useCallback(
    async (memoName: string) => {
      const entry = all.find((a) => a.memo.name === memoName);
      if (!entry) return;
      setSelectedMemoName(undefined);
      if (entry.memo.content.trim()) {
        await restyleMark(memoName, { color: "", underline: false });
        return;
      }
      await memoServiceClient.deleteMemo({ name: memoName });
      refetch();
    },
    [all, restyleMark, refetch],
  );

  // The note button on an existing mark's toolbar. A mark that already carries a note is edited
  // in its sidebar card, so just make sure the panel is open on it; a bare mark has no card at
  // all (the panel filters empty comments out), so its note is composed in the same dialog a
  // fresh selection uses — writing into the mark's own memo, keeping its anchor and colour.
  const noteOnMark = useCallback(
    (memoName: string) => {
      const entry = all.find((a) => a.memo.name === memoName);
      if (!entry) return;
      setSelectedMemoName(memoName);
      if (entry.memo.content.trim()) {
        setActivePanel("annotations");
        return;
      }
      setEditingMarkName(memoName);
    },
    [all],
  );

  // Clicking a page-number badge on the PDF opens the plain-text panel (if not already open)
  // and scrolls it to that page's block.
  const handlePageNumberClick = useCallback((page: number) => {
    setActivePanel("text");
    setTextScrollTarget((prev) => ({ page, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  // Open the comments panel by default when the PDF already has notes, so they're
  // visible on arrival instead of requiring the reader to discover the toggle button.
  // Only does this once per mount (not every time `all` changes), so it doesn't fight
  // a reader who's deliberately closed the panel.
  useEffect(() => {
    if (defaultOpenedRef.current || notedAnnotations.length === 0) return;
    defaultOpenedRef.current = true;
    setActivePanel("annotations");
  }, [notedAnnotations.length]);

  // Jumps to the page an annotation lives on. In paginated (horizontal) mode that means
  // flipping pages; in continuous scroll (vertical) mode it scrolls that page's wrapper
  // into view (sized ahead of render via basePageWidth/Height so the target is accurate
  // even if the page hasn't rendered yet — see PdfPageCanvas's `estimatedWidth/Height`).
  // Uses an instant jump rather than `behavior: "smooth"`: pages between the current
  // scroll position and the target lazy-render as the animation passes over them, and
  // each one swapping from its estimated placeholder size to its real measured size
  // mid-flight shifts the scroll target, which killed the in-progress smooth scroll
  // partway (a single click looked like it needed a second click to "finish").
  const jumpToPage = (page: number) => {
    if (state.orientation === "horizontal") {
      const target = page - ((page - 1) % Math.max(state.pagesPerView, 1));
      if (target !== state.pageNumber) {
        const diff = target - state.pageNumber;
        if (diff > 0) for (let i = 0; i < diff; i += state.pagesPerView) state.goNext();
        else for (let i = 0; i > diff; i -= state.pagesPerView) state.goPrev();
      }
      return;
    }
    pageRefs.current.get(page)?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  if (state.error) {
    return <div className={cn("w-full p-6 text-center text-sm text-destructive", className)}>{t("pdf.load-failed")}</div>;
  }

  // Content of whichever panel is docked/open. `onClose` is wired only on desktop (the mobile
  // Sheet has its own dismiss); on mobile, selecting an entry closes the sheet before jumping.
  const renderPanel = (forDesktop: boolean) =>
    activePanel === "text" ? (
      <PdfTextSidebar
        className={forDesktop ? undefined : "w-full max-w-full border-l-0 border-t-0"}
        blocks={textResult.blocks}
        formatting={textResult.formatting}
        error={textResult.error}
        scrollToPage={textScrollTarget}
        onClose={forDesktop ? () => setActivePanel(null) : undefined}
        onSelect={(page) => {
          if (!forDesktop) setActivePanel(null);
          jumpToPage(page);
        }}
      />
    ) : (
      <PdfAnnotationSidebar
        className={forDesktop ? undefined : "w-full max-w-full border-l-0 border-t-0"}
        annotations={notedAnnotations}
        selectedMemoName={selectedMemoName}
        onClose={forDesktop ? () => setActivePanel(null) : undefined}
        onEdited={refetch}
        onSelect={(memoName, page) => {
          setSelectedMemoName(memoName);
          if (!forDesktop) setActivePanel(null);
          jumpToPage(page);
        }}
      />
    );

  return (
    <>
      {createPortal(
        <PdfToolbar
          orientation={state.orientation}
          pageNumber={state.pageNumber}
          numPages={state.numPages}
          pagesPerView={state.pagesPerView}
          scale={state.scale}
          loading={state.loading}
          canGoPrev={state.canGoPrev}
          canGoNext={state.canGoNext}
          canZoomOut={state.canZoomOut}
          canZoomIn={state.canZoomIn}
          onToggleOrientation={state.toggleOrientation}
          onPrev={state.goPrev}
          onNext={state.goNext}
          onZoomOut={state.zoomOut}
          onZoomIn={state.zoomIn}
          annotateMode={canAnnotate ? annotateMode : undefined}
          onToggleAnnotateMode={canAnnotate ? () => setAnnotateMode((v) => !v) : undefined}
          sidebarOpen={canAnnotate ? activePanel === "annotations" : undefined}
          onToggleSidebar={canAnnotate ? () => setActivePanel((p) => (p === "annotations" ? null : "annotations")) : undefined}
          textOpen={activePanel === "text"}
          onToggleText={() => setActivePanel((p) => (p === "text" ? null : "text"))}
        />,
        toolbarSlot,
      )}
      <div className="w-full flex items-start">
        <PdfPages
          doc={state.doc}
          numPages={state.numPages}
          pageNumber={state.pageNumber}
          scale={state.scale}
          orientation={state.orientation}
          pagesPerView={state.pagesPerView}
          containerRef={state.containerRef}
          className={cn("min-w-0 flex-1", className)}
          annotationsByPage={byPage}
          selectedAnnotationMemoName={selectedMemoName}
          annotateMode={canAnnotate && annotateMode}
          onAnnotationSelect={(memoName) => {
            setSelectedMemoName(memoName);
            setActivePanel("annotations");
          }}
          onMarkCreate={canAnnotate ? createMark : undefined}
          onNoteCreate={canAnnotate ? (page, selection) => setPendingAnnotation({ page, selection }) : undefined}
          onMarkRestyle={canAnnotate ? restyleMark : undefined}
          onMarkClear={canAnnotate ? clearMark : undefined}
          onMarkNote={canAnnotate ? noteOnMark : undefined}
          basePageWidth={state.basePageWidth}
          basePageHeight={state.basePageHeight}
          onWrapperRef={registerPageRef}
          onPageNumberClick={handlePageNumberClick}
        />
        {activePanel !== null && isDesktop && (
          // Sticky (not part of the page stack's own height) so it stays docked to the
          // right edge of whichever ancestor scrolls, like Adobe's comments panel, instead
          // of stretching the row or getting pushed around as notes/pages accumulate.
          // The width lives here (not on the sidebar itself): the sidebar uses w-full, and
          // a percentage width on a child of this auto-width sticky wrapper would resolve
          // circularly and blow up to content width.
          <div
            ref={sidebarWrapperRef}
            style={sidebarWidth != null ? { width: `${sidebarWidth}px` } : undefined}
            className="relative sticky top-0 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-[30%] min-w-[240px] shrink-0"
          >
            {/* Left-edge drag handle: centered on the border, widened hover hit area. */}
            <div
              onMouseDown={startResize}
              className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize transition-colors hover:bg-primary/40"
            />
            {renderPanel(true)}
          </div>
        )}
      </div>
      {activePanel !== null && !isDesktop && (
        <Sheet open onOpenChange={(open) => !open && setActivePanel(null)}>
          <SheetContent side="right" className="w-[85%] max-w-full overflow-y-auto px-2 py-3 bg-background">
            <SheetHeader>
              <SheetTitle>{t(activePanel === "text" ? "pdf.plain-text-view" : "pdf.annotations")}</SheetTitle>
            </SheetHeader>
            {renderPanel(false)}
          </SheetContent>
        </Sheet>
      )}
      {editingMarkEntry && parentMemoName && (
        <Dialog open onOpenChange={(open) => !open && setEditingMarkName(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("pdf.add-annotation")}</DialogTitle>
            </DialogHeader>
            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground line-clamp-4">
              {editingMarkEntry.memo.pdfAnnotation?.textSnippet}
            </blockquote>
            <MemoEditor
              autoFocus
              // Editing the mark's own memo, so the annotation (anchor + colour) rides along
              // untouched — only the content is being filled in.
              memo={editingMarkEntry.memo}
              parentMemoName={parentMemoName}
              toolbarVariant="comment"
              onConfirm={() => {
                setEditingMarkName(undefined);
                setActivePanel("annotations");
                refetch();
              }}
              onCancel={() => setEditingMarkName(undefined)}
            />
          </DialogContent>
        </Dialog>
      )}
      {pendingAnnotation && parentMemoName && attachmentName && (
        <Dialog open onOpenChange={(open) => !open && setPendingAnnotation(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("pdf.add-annotation")}</DialogTitle>
            </DialogHeader>
            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground line-clamp-4">
              {pendingAnnotation.selection.text}
            </blockquote>
            <MemoEditor
              autoFocus
              parentMemoName={parentMemoName}
              // A note also marks its text, as a default-coloured highlight: writing about a
              // passage and highlighting it are one act, not two. Only when the text could
              // actually be anchored — a rect-only annotation has nothing to paint.
              pdfAnnotation={buildAnnotation(pendingAnnotation.page, pendingAnnotation.selection, {
                color: pendingAnnotation.selection.quote ? DEFAULT_MARK_COLOR : "",
                underline: false,
              })}
              onConfirm={(memoName) => {
                setPendingAnnotation(undefined);
                setSelectedMemoName(memoName);
                setActivePanel("annotations");
                refetch();
              }}
              onCancel={() => setPendingAnnotation(undefined)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
