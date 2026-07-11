import type * as PdfJs from "pdfjs-dist";

// A line consisting only of "---" separates one PDF page from the next in the extracted
// text. It doubles as a Markdown thematic break (so it renders as a divider) and as a
// machine-readable page boundary we can split on to align the text back to PDF pages —
// the AI formatting step is instructed to preserve these lines and never emit new ones.
export const PDF_PAGE_SEPARATOR = "\n\n---\n\n";

// Reconstructs a plain-text rendering of a single PDF page from pdf.js's per-item text
// content. Each item's `hasEOL` flag marks the end of a visual line (same boundary pdf.js's
// own text layer uses), joined with single newlines so MemoMarkdownRenderer's remark-breaks
// turns them into hard breaks within a paragraph. Multi-column layouts and table alignment
// are not reconstructed since pdf.js only exposes a linear reading-order text stream.
async function extractPageText(page: PdfJs.PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent();
  let pageText = "";
  for (const item of textContent.items) {
    if (!("str" in item)) continue;
    pageText += item.str;
    if (item.hasEOL) pageText += "\n";
  }
  return pageText.trim();
}

// Extracts each page's text separately so callers can keep the page boundaries (for
// page-aligned rendering) or join them into a single document.
export async function extractPdfTextPages(doc: PdfJs.PDFDocumentProxy, numPages: number): Promise<string[]> {
  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    pageTexts.push(await extractPageText(page));
  }
  return pageTexts;
}

// Joins the extracted pages into a single string, with each page separated by a "---"
// thematic break so each page becomes its own visually-divided block once rendered.
export async function extractPdfText(doc: PdfJs.PDFDocumentProxy, numPages: number): Promise<string> {
  const pageTexts = await extractPdfTextPages(doc, numPages);
  return pageTexts.join(PDF_PAGE_SEPARATOR);
}

// Splits AI-formatted (or raw) markdown back into per-page chunks on the "---" separator
// lines. Returns one chunk per page when the separators survived formatting; callers compare
// the chunk count against the known page count to decide whether page alignment is reliable.
export function splitPdfTextPages(markdown: string): string[] {
  return markdown
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}
