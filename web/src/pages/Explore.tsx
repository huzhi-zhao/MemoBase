import { useEffect } from "react";
import ExploreSearchResults from "@/components/MemoExplorer/ExploreSearchResults";
import MemoView from "@/components/MemoView";
import PagedMemoList from "@/components/PagedMemoList";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useView } from "@/contexts/ViewContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import usePageTitle from "@/hooks/usePageTitle";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const Explore = () => {
  const t = useTranslate();
  usePageTitle(t("common.explore"));
  const currentUser = useCurrentUser();
  const { compactMode } = useView();
  const { hasFilter, removeFiltersByFactor, getFiltersByFactor } = useMemoFilterContext();

  // Explore now defaults to ALL visible documents (no implicit "today" filter). The
  // keyword search box (contentSearch filters) drives a relevance-ranked RAG search;
  // an empty keyword shows the normal paged feed.

  // The workspace/visibility/archived filters are Explore-only; reset them on
  // navigating away so they don't leak into Home's or Archived's filter (which share
  // the same global MemoFilterContext).
  useEffect(() => {
    return () => {
      removeFiltersByFactor("workspace");
      removeFiltersByFactor("visibility");
      removeFiltersByFactor("archived");
      removeFiltersByFactor("displayTime");
      removeFiltersByFactor("contentSearch");
    };
  }, [removeFiltersByFactor]);

  // Determine visibility filter based on authentication status
  // - Logged-in users: Can see PUBLIC, PROTECTED, and their own PRIVATE memos
  // - Visitors: Can only see PUBLIC memos
  // Note: The backend is responsible for filtering stats based on visibility permissions.
  // This is only the *default*; the Secondary Sidebar's visibility multi-select
  // (see ExploreVisibilityAndArchivedFilters) can override it via useMemoFilters.
  const visibilities = currentUser ? [Visibility.PUBLIC, Visibility.PROTECTED, Visibility.PRIVATE] : [Visibility.PUBLIC];

  // Build filter using unified hook (no creator scoping for Explore). This also
  // folds in the workspace and visibility selections from the Secondary Sidebar.
  const memoFilter = useMemoFilters({
    includeShortcuts: false,
    includePinned: false,
    visibilities,
    // VIEW docs are structural organization nodes, not browsable notes.
    excludeNonFeedDocTypes: true,
  });

  // The candidate-corpus filter for RAG search: every structured filter EXCEPT the
  // keyword (which becomes the RAG query). This lets the sidebar's workspace/visibility/
  // tag/time filters narrow the corpus that keyword ranking runs over.
  const ragCandidateFilter = useMemoFilters({
    includeShortcuts: false,
    includePinned: false,
    visibilities,
    excludeNonFeedDocTypes: true,
    excludeContentSearch: true,
  });

  const keyword = getFiltersByFactor("contentSearch")
    .map((f) => f.value)
    .join(" ")
    .trim();

  const archived = hasFilter({ factor: "archived", value: "true" });
  const state = archived ? State.ARCHIVED : State.NORMAL;

  // Get sorting logic using unified hook (no pinned sorting)
  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: false,
    state,
  });

  // Keyword present → relevance-ranked RAG search over the filtered corpus.
  if (keyword) {
    return <ExploreSearchResults query={keyword} filter={ragCandidateFilter} />;
  }

  // No keyword → the normal paged feed of all visible documents.
  return (
    <PagedMemoList
      renderer={(memo: Memo) => (
        <MemoView key={`${memo.name}-${memo.updateTime}`} memo={memo} showCreator showVisibility compact={compactMode} autoFold />
      )}
      listSort={listSort}
      orderBy={orderBy}
      filter={memoFilter}
      state={state}
      showCreator
    />
  );
};

export default Explore;
