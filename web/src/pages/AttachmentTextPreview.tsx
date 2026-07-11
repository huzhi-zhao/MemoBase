import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";
import { usePdfExtractedText } from "@/components/PdfViewer/usePdfExtractedText";
import { attachmentNamePrefix } from "@/helpers/resource-names";
import { useAttachment } from "@/hooks/useAttachmentQueries";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";

const NO_MENTIONS = new Set<string>();

// Bare page (no sidebar/app chrome) opened in a new tab to show a PDF attachment's text
// content rendered through the same markdown pipeline as a regular memo — not the canvas
// image the main viewer renders, which has no real DOM text for the browser's translate
// feature to read. This never creates a persisted memo; the extracted text lives only in
// this page's state (and the shared formatted-markdown cache).
const AttachmentTextPreview = () => {
  const t = useTranslate();
  const params = useParams();

  const name = params.uid ? `${attachmentNamePrefix}${params.uid}` : "";
  const { data: attachment, isLoading, error } = useAttachment(name, { enabled: !!name });

  useEffect(() => {
    if (!attachment) return;
    document.title = attachment.filename;
  }, [attachment]);

  const {
    blocks,
    formatting,
    error: extractError,
  } = usePdfExtractedText({
    uid: params.uid ?? "",
    url: attachment ? getAttachmentUrl(attachment) : "",
    filename: attachment?.filename ?? "",
    enabled: !!attachment,
  });

  if (isLoading) {
    return <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">{t("pdf.loading")}</div>;
  }

  if (error || !attachment) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-destructive">
        {t("attachment-preview.unavailable")}
      </div>
    );
  }

  return (
    <div className="mx-auto h-screen w-screen max-w-3xl overflow-y-auto px-6 py-8">
      <h1 className="mb-4 text-lg font-medium text-foreground">{attachment.filename}</h1>
      {extractError ? (
        <p className="text-sm text-destructive">{t("pdf.load-failed")}</p>
      ) : blocks === null ? (
        <p className="text-sm text-muted-foreground">{formatting ? t("attachment-preview.ai-formatting") : t("pdf.loading")}</p>
      ) : (
        <div className="flex flex-col gap-6 text-base leading-6 text-foreground">
          {blocks.map((block, i) => (
            <div key={block.page ?? i} className="min-w-0">
              {block.page !== null && (
                <div className="mb-1 text-xs font-medium text-muted-foreground">{t("pdf.page-n", { page: block.page })}</div>
              )}
              <MemoMarkdownRenderer content={block.content} resolvedMentionUsernames={NO_MENTIONS} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttachmentTextPreview;
