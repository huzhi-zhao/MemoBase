import { useMemo } from "react";
import type { TextQuote } from "@/components/DocComments/textAnchor";
import { useInfiniteMemoComments } from "@/hooks/useMemoQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

export interface PdfAnnotationEntry {
  /** The comment memo carrying this annotation. */
  memo: Memo;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The span of page text this annotation marks, when it has one. Present for everything
   * made by selecting text; absent for annotations on pages with no text layer (scanned
   * PDFs) and for those created before text anchoring existed, which fall back to the rect.
   */
  quote?: TextQuote;
  /** Palette key for the mark's fill. Empty means no fill (underline-only). */
  color: string;
  underline: boolean;
}

/**
 * Reads every comment on `parentMemoName` and filters down to the ones anchored
 * to `attachmentName` (a PDF attachment), grouped by page. Comments are regular
 * memos, so this rides on the same MemoRelation/COMMENT plumbing the comment
 * section already uses; annotations are just comments whose `payload.pdfAnnotation`
 * happens to be set.
 */
export function usePdfAnnotations(parentMemoName: string | undefined, attachmentName: string | undefined) {
  const { data, isLoading, refetch } = useInfiniteMemoComments(parentMemoName ?? "", { enabled: !!parentMemoName });

  const { all, byPage } = useMemo(() => {
    const all: PdfAnnotationEntry[] = [];
    for (const memo of data ?? []) {
      const annotation = memo.pdfAnnotation;
      if (!annotation || annotation.attachmentName !== attachmentName) continue;
      all.push({
        memo,
        page: annotation.page,
        x: annotation.x,
        y: annotation.y,
        width: annotation.width,
        height: annotation.height,
        quote: annotation.textExact
          ? { exact: annotation.textExact, prefix: annotation.textPrefix, suffix: annotation.textSuffix }
          : undefined,
        color: annotation.color,
        underline: annotation.underline,
      });
    }
    all.sort((a, b) => a.page - b.page);
    const byPage = new Map<number, PdfAnnotationEntry[]>();
    for (const entry of all) {
      const list = byPage.get(entry.page) ?? [];
      list.push(entry);
      byPage.set(entry.page, list);
    }
    return { all, byPage };
  }, [data, attachmentName]);

  return { all, byPage, loading: isLoading, refetch };
}
