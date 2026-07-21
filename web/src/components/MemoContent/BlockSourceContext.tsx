import { createContext, useContext, useMemo } from "react";
import { useMemoViewContextOptional } from "@/components/MemoView/MemoViewContext";
import { useUpdateMemo } from "@/hooks/useMemoQueries";

/**
 * Interactive blocks (calendar, kanban, …) persist edits by rewriting the
 * markdown they were parsed from. Normally that markdown *is* the memo's whole
 * content, so they read `memo.content` and PATCH it back. But the same blocks
 * also render inside hosts where the markdown is only a fragment of the
 * document — a VIEW doc keeps its Intro/Note markdown as a string field inside
 * a JSON config. Such a host provides this context so the blocks stay
 * interactive without knowing anything about the enclosing format.
 */
export interface BlockSourceValue {
  /** The markdown the block was rendered from. */
  source: string;
  readonly: boolean;
  /** Persists a rewritten version of `source`. */
  save: (next: string) => void;
}

const BlockSourceContext = createContext<BlockSourceValue | null>(null);

export const BlockSourceProvider = BlockSourceContext.Provider;

/**
 * Resolves how the calling block should read and write its own markdown:
 * the host-provided fragment when there is one, else the whole memo.
 * Returns undefined when neither is available (the block renders read-only).
 */
export const useBlockSource = (): BlockSourceValue | undefined => {
  const hosted = useContext(BlockSourceContext);
  const memoViewContext = useMemoViewContextOptional();
  const memo = memoViewContext?.memo;
  const memoReadonly = memoViewContext?.readonly ?? true;
  const { mutate: updateMemo } = useUpdateMemo();

  return useMemo(() => {
    if (hosted) return hosted;
    if (!memo) return undefined;
    return {
      source: memo.content,
      readonly: memoReadonly,
      save: (next: string) => {
        if (next === memo.content) return;
        updateMemo({ update: { name: memo.name, content: next }, updateMask: ["content", "update_time"] });
      },
    };
  }, [hosted, memo, memoReadonly, updateMemo]);
};
