package rag

import (
	"context"
	"strings"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/store"
)

// docTypeMarkdown is the only document type indexed in this release. HTML/PDF
// (render-only) and VIEW (config) documents are intentionally excluded.
const docTypeMarkdown = "MARKDOWN"

// IsIndexable reports whether a memo should be included in the search index.
// This is the extensible filter point: future work can consult per-workspace
// index-scope configuration here.
func IsIndexable(memo *store.Memo) bool {
	if memo == nil {
		return false
	}
	if memo.RowStatus == store.Archived {
		return false
	}
	return memo.DocType == docTypeMarkdown || memo.DocType == ""
}

// indexMemo (re)builds the chunk set for a single memo. When embedding is
// configured, each chunk is embedded; otherwise only chunk text is stored (FTS
// still works). Non-indexable or missing memos have their chunks removed.
func indexMemo(ctx context.Context, s *store.Store, memoID int32, embedding EmbeddingResolution) error {
	memo, err := s.GetMemo(ctx, &store.FindMemo{ID: &memoID})
	if err != nil {
		return errors.Wrap(err, "failed to get memo")
	}
	if memo == nil || !IsIndexable(memo) {
		// Nothing to index; ensure any stale chunks are gone.
		return s.DeleteMemoChunks(ctx, memoID)
	}

	// Index the title alongside the body: in a knowledge-base a lot of meaning lives
	// in the document name, and a query term may only appear there. Prepending it as a
	// leading heading keeps it in the first chunk (and its embedding) without a schema change.
	content := memo.Content
	if title := strings.TrimSpace(memo.Title); title != "" {
		content = "# " + title + "\n\n" + content
	}

	fragments := ChunkMarkdown(content)
	if len(fragments) == 0 {
		return s.ReplaceMemoChunks(ctx, memoID, nil)
	}

	chunks := make([]*store.MemoChunk, 0, len(fragments))
	for _, f := range fragments {
		chunks = append(chunks, &store.MemoChunk{
			MemoID:      memoID,
			WorkspaceID: memo.WorkspaceID,
			FolderPath:  memo.FolderPath,
			ChunkIndex:  int32(f.Index),
			Content:     f.Content,
		})
	}

	// Reuse embeddings from the previous index run by matching on chunk content.
	// Peripheral updates are filtered out before enqueueing, but folder moves,
	// retries, and partial edits still land here with mostly-identical text; only
	// chunks whose content actually changed need a provider round-trip.
	existing, err := s.ListMemoChunks(ctx, &store.FindMemoChunk{MemoID: &memoID})
	if err != nil {
		return errors.Wrap(err, "failed to list existing chunks")
	}
	reusable := map[string]storedVector{}
	for _, c := range existing {
		if len(c.Embedding) > 0 {
			reusable[c.Content] = storedVector{vector: c.Embedding, model: c.EmbeddingModel, dim: c.EmbeddingDim}
		}
	}

	if !embedding.Configured {
		// Embedding is off — either never configured, or explicitly disabled. Carry
		// any vector we already hold for identical chunk text through the rebuild:
		// ReplaceMemoChunks writes the whole set, so without this an unrelated edit
		// (or a folder move) while embedding is disabled would silently erase the
		// corpus's vectors, and re-enabling would have to re-embed everything.
		for _, c := range chunks {
			if v, ok := reusable[c.Content]; ok {
				c.Embedding, c.EmbeddingModel, c.EmbeddingDim = v.vector, v.model, v.dim
			}
		}
	}

	if embedding.Configured {
		var missing []int
		var inputs []string
		for i, c := range chunks {
			// A vector built by a different model isn't comparable against this
			// model's query vectors, so it has to be regenerated.
			if v, ok := reusable[c.Content]; ok && v.model == embedding.Model {
				c.Embedding = v.vector
				c.EmbeddingModel = v.model
				c.EmbeddingDim = v.dim
			} else {
				missing = append(missing, i)
				inputs = append(inputs, c.Content)
			}
		}
		if len(missing) > 0 {
			vectors, err := ai.Embed(ctx, embedding.Provider, embedding.Model, inputs)
			if err != nil {
				// Embedding failed (e.g. provider rate limit / 429). Persist the chunks
				// with whatever vectors were reused so keyword (FTS) search works
				// immediately, then surface the error so the job is retried to backfill
				// the missing embeddings once the provider recovers.
				if replaceErr := s.ReplaceMemoChunks(ctx, memoID, chunks); replaceErr != nil {
					return errors.Wrap(replaceErr, "failed to store chunks after embedding failure")
				}
				return errors.Wrap(err, "failed to generate embeddings")
			}
			if len(vectors) != len(inputs) {
				// Same fallback: keep chunks searchable via FTS, retry for embeddings.
				if replaceErr := s.ReplaceMemoChunks(ctx, memoID, chunks); replaceErr != nil {
					return errors.Wrap(replaceErr, "failed to store chunks after embedding mismatch")
				}
				return errors.Errorf("embedding count mismatch: got %d, want %d", len(vectors), len(inputs))
			}
			for j, i := range missing {
				chunks[i].Embedding = vectors[j]
				chunks[i].EmbeddingModel = embedding.Model
				chunks[i].EmbeddingDim = int32(len(vectors[j]))
			}
		}
	}

	// Skip the write entirely when the stored chunk set is already identical —
	// this keeps no-op reindexes (retries, unchanged saves) from churning the FTS index.
	if chunksEqual(existing, chunks) {
		return nil
	}
	return s.ReplaceMemoChunks(ctx, memoID, chunks)
}

// storedVector is an embedding already persisted for a chunk, kept with the
// model that produced it so a rebuild can tell reusable vectors from stale ones.
type storedVector struct {
	vector []float32
	model  string
	dim    int32
}

// chunksEqual reports whether the stored chunk set already matches the desired
// one across every field the index persists.
func chunksEqual(existing, desired []*store.MemoChunk) bool {
	if len(existing) != len(desired) {
		return false
	}
	for i, e := range existing {
		d := desired[i]
		if e.ChunkIndex != d.ChunkIndex || e.Content != d.Content ||
			e.WorkspaceID != d.WorkspaceID || e.FolderPath != d.FolderPath ||
			e.EmbeddingModel != d.EmbeddingModel || len(e.Embedding) != len(d.Embedding) {
			return false
		}
	}
	return true
}
