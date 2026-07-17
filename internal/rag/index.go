package rag

import (
	"context"

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

	fragments := ChunkMarkdown(memo.Content)
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

	if embedding.Configured {
		inputs := make([]string, len(chunks))
		for i, c := range chunks {
			inputs[i] = c.Content
		}
		vectors, err := ai.Embed(ctx, embedding.Provider, embedding.Model, inputs)
		if err != nil {
			// Embedding failed (e.g. provider rate limit / 429). Persist the chunks
			// WITHOUT vectors so keyword (FTS) search works immediately, then surface the
			// error so the job is retried to backfill embeddings once the provider recovers.
			if replaceErr := s.ReplaceMemoChunks(ctx, memoID, chunks); replaceErr != nil {
				return errors.Wrap(replaceErr, "failed to store chunks after embedding failure")
			}
			return errors.Wrap(err, "failed to generate embeddings")
		}
		if len(vectors) != len(chunks) {
			// Same fallback: keep chunks searchable via FTS, retry for embeddings.
			if replaceErr := s.ReplaceMemoChunks(ctx, memoID, chunks); replaceErr != nil {
				return errors.Wrap(replaceErr, "failed to store chunks after embedding mismatch")
			}
			return errors.Errorf("embedding count mismatch: got %d, want %d", len(vectors), len(chunks))
		}
		for i, c := range chunks {
			c.Embedding = vectors[i]
			c.EmbeddingModel = embedding.Model
			c.EmbeddingDim = int32(len(vectors[i]))
		}
	}

	return s.ReplaceMemoChunks(ctx, memoID, chunks)
}
