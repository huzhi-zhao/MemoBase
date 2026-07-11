import { create } from "@bufbuild/protobuf";
import type * as PdfJs from "pdfjs-dist";
import { useEffect, useState } from "react";
import { aiServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import { FormatMarkdownRequestSchema } from "@/types/proto/api/v1/ai_service_pb";
import { withChunkReload } from "@/utils/dynamicImport";
import { getCachedFormattedMarkdown, setCachedFormattedMarkdown } from "@/utils/formattedMarkdownCache";
import { extractPdfTextPages, PDF_PAGE_SEPARATOR, splitPdfTextPages } from "./extractPdfText";

// One rendered block of a PDF's text view. When `page` is set, the block corresponds to that
// PDF page (1-based) and can be used as a jump target; when it's null, page alignment could not
// be recovered (the AI formatting dropped or added "---" separators) so the whole document is
// shown as a single un-paged block.
export interface PdfTextBlock {
  page: number | null;
  content: string;
}

interface Options {
  /** Attachment uid, used as the formatted-markdown cache key. */
  uid: string;
  /** URL to fetch the PDF from when `doc` is not supplied. */
  url: string;
  filename: string;
  /** An already-loaded pdf.js document (e.g. from the viewer) to avoid re-fetching/parsing. */
  doc?: PdfJs.PDFDocumentProxy | null;
  numPages?: number;
  /** When false, extraction is not started (used to defer work until the text panel is opened). */
  enabled?: boolean;
}

interface Result {
  blocks: PdfTextBlock[] | null;
  loading: boolean;
  formatting: boolean;
  error: boolean;
}

// Turns markdown (raw or AI-formatted) into page blocks by splitting on the "---" separators:
// each chunk between separators is one page, numbered sequentially, and gets its own jump
// button. This is best-effort — if the AI dropped or added a separator the numbers past that
// point drift by one, but every block still jumps somewhere rather than the whole document
// collapsing into one un-paged block. A document with no separators (single page, or all
// separators lost) renders as a single un-paged block.
function toBlocks(markdown: string): PdfTextBlock[] {
  const chunks = splitPdfTextPages(markdown);
  if (chunks.length <= 1) {
    return [{ page: null, content: markdown.trim() }];
  }
  return chunks.map((content, i) => ({ page: i + 1, content }));
}

// Extracts a PDF's text and restructures it into markdown via the instance AI provider, shared
// by the standalone text page and the in-viewer text sidebar. Pages are joined with "---"
// separators (see extractPdfText) so the result can be split back into page-aligned blocks. The
// AI-formatted markdown is cached (see formattedMarkdownCache) so re-opening does not re-run the
// slow, billable call; when AI is not configured or fails, the raw extracted text is used, which
// still carries reliable page boundaries.
export function usePdfExtractedText({ uid, url, filename, doc, numPages, enabled = true }: Options): Result {
  const { aiSetting } = useInstance();
  const formatWithAI = aiSetting.formatPdfText;
  const [blocks, setBlocks] = useState<PdfTextBlock[] | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        // A cache hit already holds the full formatted markdown with its "---" separators;
        // split it back into page blocks. Only consult the cache when AI formatting is on —
        // it stores AI output, which we shouldn't surface when the feature is turned off.
        const cached = formatWithAI && uid ? getCachedFormattedMarkdown(uid) : null;

        let ownedDoc: PdfJs.PDFDocumentProxy | null = null;
        let activeDoc = doc ?? null;
        let pageCount = numPages ?? activeDoc?.numPages ?? 0;

        if (!activeDoc) {
          const pdfjs = await withChunkReload(() => import("pdfjs-dist"));
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const data = await response.arrayBuffer();
          if (cancelled) return;
          ownedDoc = await pdfjs.getDocument({ data }).promise;
          activeDoc = ownedDoc;
          pageCount = ownedDoc.numPages;
        }

        try {
          if (cancelled) return;

          if (cached !== null) {
            setBlocks(toBlocks(cached));
            return;
          }

          const pages = await extractPdfTextPages(activeDoc, pageCount);
          if (cancelled) return;
          const rawText = pages.join(PDF_PAGE_SEPARATOR);

          // With AI formatting disabled (the instance default), show the raw extracted text
          // as-is — pages are still separated by "---", so page alignment still works.
          if (!formatWithAI) {
            setBlocks(toBlocks(rawText));
            return;
          }

          // Restructure the raw extracted text into markdown (content preserved verbatim,
          // "---" page separators preserved). Falls back to the raw text on any failure.
          setFormatting(true);
          let finalMarkdown = rawText;
          try {
            const response = await aiServiceClient.formatMarkdown(create(FormatMarkdownRequestSchema, { text: rawText, filename }));
            if (response.markdown.trim() !== "") {
              finalMarkdown = response.markdown;
              if (uid) setCachedFormattedMarkdown(uid, response.markdown);
            }
          } catch {
            // Keep the raw extracted text.
          }
          if (cancelled) return;
          setFormatting(false);
          setBlocks(toBlocks(finalMarkdown));
        } finally {
          ownedDoc?.destroy();
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, url, filename, doc, numPages, enabled, formatWithAI]);

  return { blocks, loading: blocks === null && !error, formatting, error };
}
