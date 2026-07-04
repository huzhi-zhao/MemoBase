import { useEffect, useRef, useState } from "react";

interface Props {
  content: string;
  className?: string;
  onHeightChange?: (height: number) => void;
}

// Small resize-reporting script appended to the sandboxed document. It has no access to the
// parent's DOM (the iframe is NOT given `allow-same-origin`), so it can only talk back via
// postMessage — this keeps arbitrary user-authored HTML from ever touching the app's own origin.
const RESIZE_REPORTER_SCRIPT = `
<script>
  (function () {
    var lastHeight = -1;
    function reportHeight() {
      var height = document.documentElement.scrollHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage({ source: "memos-html-preview", height: height }, "*");
    }
    window.addEventListener("load", reportHeight);
    new ResizeObserver(reportHeight).observe(document.documentElement);
    reportHeight();
  })();
</script>
`;

export const HtmlPreviewFrame = ({ content, className, onHeightChange }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.source !== "memos-html-preview") return;
      const measured = Math.ceil(event.data.height);
      setHeight((prev) => {
        if (prev === measured) {
          return prev;
        }
        onHeightChange?.(measured);
        return measured;
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onHeightChange]);

  return (
    <iframe
      ref={iframeRef}
      title="html-preview"
      sandbox="allow-scripts allow-popups allow-forms"
      srcDoc={content + RESIZE_REPORTER_SCRIPT}
      className={className}
      style={{ height: height || 300, width: "100%", border: 0, display: "block", background: "#fff" }}
    />
  );
};
