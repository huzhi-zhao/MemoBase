package rag

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/store"
)

// Mode selects the retrieval strategy.
type Mode int

const (
	// ModeMixed fuses keyword and semantic retrieval.
	ModeMixed Mode = iota
	// ModeKeyword uses full-text (FTS) retrieval only.
	ModeKeyword
	// ModeSemantic uses vector (embedding) retrieval only.
	ModeSemantic
)

const (
	// rrfK is the RRF constant; larger values flatten rank influence.
	rrfK = 60
	// candidateLimit caps how many chunks each retrieval path contributes.
	candidateLimit = 50
	// minTrigramRunes is the shortest query FTS5's trigram tokenizer accepts.
	minTrigramRunes = 3
	// snippetRunes is the target snippet length.
	snippetRunes = 200
	// semanticMinSimilarity is the cosine floor below which a purely semantic
	// (no keyword match) hit is treated as noise and dropped. FTS/substring matches
	// are always kept regardless of this floor.
	semanticMinSimilarity = 0.30
	// relativeScoreCutoff drops long-tail hits whose fused score falls below this
	// fraction of the top hit's score. The top hit is always kept.
	relativeScoreCutoff = 0.25
)

// SearchParams describes a scoped retrieval request. MemoIDs is the permission-
// scoped candidate set computed by the caller; an empty (non-nil) slice yields
// no results.
type SearchParams struct {
	Query   string
	MemoIDs []int32
	Mode    Mode
	Limit   int
}

// Hit is a document-level search result.
type Hit struct {
	MemoID      int32
	WorkspaceID int32
	FolderPath  string
	Score       float64
	Snippet     string
	Highlights  []string
}

// Result bundles hits with the mode actually applied.
type Result struct {
	Hits          []Hit
	EffectiveMode Mode
}

// Search runs hybrid retrieval over the scoped candidate memos.
func Search(ctx context.Context, s *store.Store, params SearchParams) (*Result, error) {
	query := strings.TrimSpace(params.Query)
	if query == "" {
		return &Result{Hits: []Hit{}, EffectiveMode: params.Mode}, nil
	}
	if params.MemoIDs != nil && len(params.MemoIDs) == 0 {
		return &Result{Hits: []Hit{}, EffectiveMode: params.Mode}, nil
	}
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}

	embedding, err := resolveEmbedding(ctx, s)
	if err != nil {
		return nil, err
	}

	// Downgrade to keyword-only when semantic retrieval is unavailable.
	effective := params.Mode
	if !embedding.Configured {
		effective = ModeKeyword
	}

	var ftsResults []*store.ChunkFTSResult
	runFTS := func() error {
		if utf8.RuneCountInString(query) < minTrigramRunes {
			return nil
		}
		results, ftsErr := s.SearchMemoChunksFTS(ctx, &store.ChunkFTSQuery{
			Query:   query,
			MemoIDs: params.MemoIDs,
			Limit:   candidateLimit,
		})
		if ftsErr != nil {
			return errors.Wrap(ftsErr, "full-text search failed")
		}
		ftsResults = results
		return nil
	}

	if effective != ModeSemantic {
		if err := runFTS(); err != nil {
			return nil, err
		}
	}

	var vecResults []scoredChunk
	if effective != ModeKeyword && embedding.Configured {
		vecResults, err = vectorSearch(ctx, s, embedding, query, params.MemoIDs)
		if err != nil {
			// Embedding failed at query time (rate limit, quota, network, etc.). Rather
			// than failing the whole search, degrade gracefully to keyword-only so the
			// user still gets FTS results. Ensure FTS ran (semantic-only skipped it).
			slog.Warn("semantic search unavailable; falling back to keyword-only", slog.Any("error", err))
			vecResults = nil
			effective = ModeKeyword
			if ftsResults == nil {
				if err := runFTS(); err != nil {
					return nil, err
				}
			}
		}
	}

	hits := fuseAndDedup(ftsResults, vecResults, query, limit)
	return &Result{Hits: hits, EffectiveMode: effective}, nil
}

type scoredChunk struct {
	ChunkID     int32
	MemoID      int32
	WorkspaceID int32
	FolderPath  string
	Content     string
	Similarity  float64
}

// vectorSearch embeds the query and ranks scoped chunks by cosine similarity.
func vectorSearch(ctx context.Context, s *store.Store, embedding EmbeddingResolution, query string, memoIDs []int32) ([]scoredChunk, error) {
	vectors, err := ai.Embed(ctx, embedding.Provider, embedding.Model, []string{query})
	if err != nil {
		return nil, err
	}
	if len(vectors) != 1 {
		return nil, errors.New("query embedding failed")
	}
	queryVec := vectors[0]

	hasEmbedding := true
	chunks, err := s.ListMemoChunks(ctx, &store.FindMemoChunk{MemoIDs: memoIDs, HasEmbedding: &hasEmbedding})
	if err != nil {
		return nil, err
	}

	scored := make([]scoredChunk, 0, len(chunks))
	for _, c := range chunks {
		// Only compare against chunks embedded with the active model/dim.
		if len(c.Embedding) != len(queryVec) {
			continue
		}
		scored = append(scored, scoredChunk{
			ChunkID:     c.ID,
			MemoID:      c.MemoID,
			WorkspaceID: c.WorkspaceID,
			FolderPath:  c.FolderPath,
			Content:     c.Content,
			Similarity:  cosine(queryVec, c.Embedding),
		})
	}
	sort.Slice(scored, func(i, j int) bool { return scored[i].Similarity > scored[j].Similarity })
	if len(scored) > candidateLimit {
		scored = scored[:candidateLimit]
	}
	return scored, nil
}

// fuseAndDedup merges the two retrieval paths with Reciprocal Rank Fusion, then
// collapses chunks to their best-scoring document.
func fuseAndDedup(fts []*store.ChunkFTSResult, vec []scoredChunk, query string, limit int) []Hit {
	type acc struct {
		memoID         int32
		workspaceID    int32
		folderPath     string
		score          float64
		bestContent    string
		bestRank       float64 // lower is better; used to pick snippet source
		hasKeyword     bool    // matched via FTS (substring) — always relevant
		bestSimilarity float64 // best cosine similarity across this memo's chunks
	}
	byMemo := map[int32]*acc{}

	consider := func(memoID, workspaceID int32, folderPath, content string, rrf, rankKey, similarity float64, isKeyword bool) {
		a := byMemo[memoID]
		if a == nil {
			a = &acc{memoID: memoID, workspaceID: workspaceID, folderPath: folderPath, bestRank: rankKey, bestContent: content}
			byMemo[memoID] = a
		}
		a.score += rrf
		if isKeyword {
			a.hasKeyword = true
		}
		if similarity > a.bestSimilarity {
			a.bestSimilarity = similarity
		}
		if rankKey < a.bestRank || a.bestContent == "" {
			a.bestRank = rankKey
			a.bestContent = content
			if workspaceID != 0 {
				a.workspaceID = workspaceID
			}
			if folderPath != "" {
				a.folderPath = folderPath
			}
		}
	}

	for rank, r := range fts {
		rrf := 1.0 / float64(rrfK+rank+1)
		consider(r.MemoID, 0, "", r.Content, rrf, float64(rank), 0, true)
	}
	for rank, r := range vec {
		rrf := 1.0 / float64(rrfK+rank+1)
		consider(r.MemoID, r.WorkspaceID, r.FolderPath, r.Content, rrf, float64(rank), r.Similarity, false)
	}

	accs := make([]*acc, 0, len(byMemo))
	for _, a := range byMemo {
		// Drop purely-semantic hits whose best similarity is below the noise floor.
		// Keyword (substring) matches are always kept.
		if !a.hasKeyword && a.bestSimilarity < semanticMinSimilarity {
			continue
		}
		accs = append(accs, a)
	}
	sort.Slice(accs, func(i, j int) bool {
		if accs[i].score == accs[j].score {
			return accs[i].memoID < accs[j].memoID
		}
		return accs[i].score > accs[j].score
	})

	// Trim the long tail relative to the top hit so we don't always pad up to `limit`
	// with weak matches.
	if len(accs) > 0 {
		threshold := accs[0].score * relativeScoreCutoff
		kept := accs[:1]
		for _, a := range accs[1:] {
			if a.score < threshold {
				break
			}
			kept = append(kept, a)
		}
		accs = kept
	}

	if len(accs) > limit {
		accs = accs[:limit]
	}

	highlights := []string{query}
	hits := make([]Hit, 0, len(accs))
	for _, a := range accs {
		hits = append(hits, Hit{
			MemoID:      a.memoID,
			WorkspaceID: a.workspaceID,
			FolderPath:  a.folderPath,
			Score:       a.score,
			Snippet:     makeSnippet(a.bestContent, query),
			Highlights:  highlights,
		})
	}
	return hits
}

// makeSnippet returns a window of content centered on the first query match.
func makeSnippet(content, query string) string {
	content = strings.TrimSpace(content)
	if utf8.RuneCountInString(content) <= snippetRunes {
		return content
	}
	runes := []rune(content)
	idx := -1
	if lower := strings.ToLower(content); query != "" {
		if b := strings.Index(lower, strings.ToLower(query)); b >= 0 {
			idx = utf8.RuneCountInString(content[:b])
		}
	}
	start := 0
	if idx >= 0 {
		start = idx - snippetRunes/2
		if start < 0 {
			start = 0
		}
	}
	end := start + snippetRunes
	if end > len(runes) {
		end = len(runes)
		start = end - snippetRunes
		if start < 0 {
			start = 0
		}
	}
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(runes) {
		snippet += "…"
	}
	return snippet
}
