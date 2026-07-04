import type React from "react";

export interface MemoContentProps {
  content: string;
  /** Resource name of the memo (e.g. `memos/abc123`). Enables footnote links to target the memo detail page. */
  memoName?: string;
  compact?: boolean;
  /** Renders `content` as a sandboxed HTML preview instead of markdown (memo.docType === HTML). */
  isHtml?: boolean;
  /** Fold content taller than the trigger height, regardless of the `compact` display setting. Opt-in per caller (e.g. Explore). */
  autoFold?: boolean;
  /** Never fold, even if the rendered content exceeds the fold trigger height (e.g. pinned memos). */
  alwaysExpanded?: boolean;
  className?: string;
  contentClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export type ContentCompactView = "ALL" | "SNIPPET";
