import type * as PdfJs from "pdfjs-dist";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import type { PdfAnnotationRect } from "./PdfAnnotationLayer";
import { PdfPageCanvas } from "./PdfPageCanvas";
import type { PdfAnnotationEntry } from "./usePdfAnnotations";
import type { PdfOrientation } from "./usePdfViewerState";

interface Props {
  doc: PdfJs.PDFDocumentProxy | null;
  numPages: number;
  pageNumber: number;
  scale: number;
  orientation: PdfOrientation;
  pagesPerView: number;
  containerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  annotationsByPage?: Map<number, PdfAnnotationEntry[]>;
  selectedAnnotationMemoName?: string;
  annotateMode?: boolean;
  onAnnotationSelect?: (memoName: string) => void;
  onAnnotationCreate?: (page: number, rect: PdfAnnotationRect, textSnippet: string) => void;
  /** Page width/height in CSS px at scale=1, used to size not-yet-rendered pages so a
   *  scroll-to-page jump lands close to correct before the real canvas has measured in. */
  basePageWidth?: number;
  basePageHeight?: number;
  onWrapperRef?: (pageNumber: number, el: HTMLDivElement | null) => void;
  /** When provided, each page's number badge becomes a button that jumps the plain-text panel to that page. */
  onPageNumberClick?: (pageNumber: number) => void;
}

export const PdfPages = ({
  doc,
  numPages,
  pageNumber,
  scale,
  orientation,
  pagesPerView,
  containerRef,
  className,
  annotationsByPage,
  selectedAnnotationMemoName,
  annotateMode,
  onAnnotationSelect,
  onAnnotationCreate,
  basePageWidth,
  basePageHeight,
  onWrapperRef,
  onPageNumberClick,
}: Props) => {
  if (!doc) return <div ref={containerRef} className={className} />;

  const pageProps = (n: number) => ({
    annotations: annotationsByPage?.get(n),
    selectedAnnotationMemoName,
    annotateMode,
    onAnnotationSelect,
    onAnnotationCreate: onAnnotationCreate
      ? (rect: PdfAnnotationRect, textSnippet: string) => onAnnotationCreate(n, rect, textSnippet)
      : undefined,
    estimatedWidth: basePageWidth ? basePageWidth * scale : undefined,
    estimatedHeight: basePageHeight ? basePageHeight * scale : undefined,
    onWrapperRef,
    onPageNumberClick,
  });

  if (orientation === "vertical") {
    return (
      <div ref={containerRef} className={cn("w-full flex flex-col items-center gap-4 overflow-y-auto", className)}>
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <PdfPageCanvas key={n} doc={doc} pageNumber={n} scale={scale} lazy {...pageProps(n)} />
        ))}
      </div>
    );
  }

  const pages = pagesPerView === 2 ? [pageNumber, pageNumber + 1].filter((n) => n <= numPages) : [pageNumber];
  return (
    <div ref={containerRef} className={cn("w-full flex items-start justify-center gap-4 overflow-x-auto", className)}>
      {pages.map((n) => (
        <PdfPageCanvas key={n} doc={doc} pageNumber={n} scale={scale} {...pageProps(n)} />
      ))}
    </div>
  );
};
