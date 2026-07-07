import { useCallback, useEffect, useRef } from "react";
import { cacheService } from "../services";
import { useEditorStore } from "../state";

/**
 * Persists the editor's content to localStorage as a draft. Subscribes to the
 * editor store directly for content rather than taking it as a prop, so the
 * component that mounts this hook does not re-render on every keystroke.
 */
export const useAutoSave = (username: string, cacheKey: string | undefined, enabled = true) => {
  const store = useEditorStore();
  const latestContentRef = useRef(store.getState().content);
  const discardedContentRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    const key = cacheService.key(username, cacheKey);
    const persist = (content: string) => {
      latestContentRef.current = content;
      if (discardedContentRef.current !== undefined && discardedContentRef.current !== content) {
        discardedContentRef.current = undefined;
      }
      cacheService.save(key, content);
    };

    // Persist the current content on mount/enable, then on every change.
    persist(store.getState().content);
    return store.subscribe(() => {
      const content = store.getState().content;
      if (content !== latestContentRef.current) {
        persist(content);
      }
    });
  }, [store, username, cacheKey, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const key = cacheService.key(username, cacheKey);
    const flushDraft = () => {
      if (discardedContentRef.current === latestContentRef.current) {
        return;
      }

      cacheService.saveNow(key, latestContentRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    // window blur covers focus leaving the browser entirely (e.g. switching to another app),
    // which visibilitychange alone does not always catch.
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("blur", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Belt-and-suspenders periodic flush in case the debounced save missed something
    // (e.g. rapid changes right before the interval), independent of focus/blur state.
    const intervalId = window.setInterval(flushDraft, 60 * 1000);

    return () => {
      // Flush on unmount (e.g. editor closes) to ensure the draft is persisted
      // before the component is torn down — distinct from the visibility flush above.
      flushDraft();
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("blur", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [store, username, cacheKey, enabled]);

  const discardDraft = useCallback(() => {
    const key = cacheService.key(username, cacheKey);
    discardedContentRef.current = latestContentRef.current;
    cacheService.clear(key);
  }, [username, cacheKey]);

  return { discardDraft };
};
