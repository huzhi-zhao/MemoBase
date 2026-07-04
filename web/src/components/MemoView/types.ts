import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

export interface MemoViewProps {
  memo: Memo;
  compact?: boolean;
  /** Fold content taller than the trigger height, regardless of the `compact` display setting. */
  autoFold?: boolean;
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
  className?: string;
  parentPage?: string;
  shareImageDialogOpen?: boolean;
  onShareImageDialogOpenChange?: (open: boolean) => void;
  /** Only meaningful together with `compact={false}` (memo detail page): toggles the right sidebar. */
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export interface MemoHeaderProps {
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
  compact?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export interface MemoBodyProps {
  compact?: boolean;
  autoFold?: boolean;
}
