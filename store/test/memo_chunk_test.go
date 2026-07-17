package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestMemoChunkStoreAndFTS(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	if getDriverFromEnv() != "sqlite" {
		t.Skip("RAG chunk store is only implemented for sqlite")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	memo, err := ts.CreateMemo(ctx, &store.Memo{
		UID:        "rag-memo-1",
		CreatorID:  user.ID,
		Content:    "机器学习是人工智能的一个分支",
		Visibility: store.Public,
	})
	require.NoError(t, err)

	// Creating a memo should enqueue an index job.
	pending := store.IndexJobStatusPending
	jobs, err := ts.ListMemoIndexJobs(ctx, &store.FindMemoIndexJob{Status: &pending})
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, memo.ID, jobs[0].MemoID)

	// Write chunks (simulating the worker) and verify FTS + listing.
	err = ts.ReplaceMemoChunks(ctx, memo.ID, []*store.MemoChunk{
		{MemoID: memo.ID, WorkspaceID: memo.WorkspaceID, ChunkIndex: 0, Content: "机器学习是人工智能的一个分支"},
		{MemoID: memo.ID, WorkspaceID: memo.WorkspaceID, ChunkIndex: 1, Content: "深度学习使用神经网络"},
	})
	require.NoError(t, err)

	chunks, err := ts.ListMemoChunks(ctx, &store.FindMemoChunk{MemoID: &memo.ID})
	require.NoError(t, err)
	require.Len(t, chunks, 2)

	results, err := ts.SearchMemoChunksFTS(ctx, &store.ChunkFTSQuery{Query: "神经网络", Limit: 10})
	require.NoError(t, err)
	require.Len(t, results, 1)
	require.Equal(t, "深度学习使用神经网络", results[0].Content)

	// Replacing chunks should not leave stale FTS rows.
	err = ts.ReplaceMemoChunks(ctx, memo.ID, []*store.MemoChunk{
		{MemoID: memo.ID, ChunkIndex: 0, Content: "全新内容不含之前的词"},
	})
	require.NoError(t, err)
	results, err = ts.SearchMemoChunksFTS(ctx, &store.ChunkFTSQuery{Query: "神经网络", Limit: 10})
	require.NoError(t, err)
	require.Empty(t, results)

	// Deleting the memo should remove chunks and the job.
	err = ts.DeleteMemo(ctx, &store.DeleteMemo{ID: memo.ID})
	require.NoError(t, err)
	chunks, err = ts.ListMemoChunks(ctx, &store.FindMemoChunk{MemoID: &memo.ID})
	require.NoError(t, err)
	require.Empty(t, chunks)
}

func TestMemoChunkEmbeddingRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	if getDriverFromEnv() != "sqlite" {
		t.Skip("RAG chunk store is only implemented for sqlite")
	}
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	memo, err := ts.CreateMemo(ctx, &store.Memo{
		UID: "rag-memo-2", CreatorID: user.ID, Content: "x", Visibility: store.Public,
	})
	require.NoError(t, err)

	vec := []float32{0.1, -0.2, 0.3, 0.4}
	err = ts.ReplaceMemoChunks(ctx, memo.ID, []*store.MemoChunk{
		{MemoID: memo.ID, ChunkIndex: 0, Content: "embedded chunk", Embedding: vec, EmbeddingModel: "test-model"},
	})
	require.NoError(t, err)

	hasEmbedding := true
	chunks, err := ts.ListMemoChunks(ctx, &store.FindMemoChunk{MemoID: &memo.ID, HasEmbedding: &hasEmbedding})
	require.NoError(t, err)
	require.Len(t, chunks, 1)
	require.Equal(t, vec, chunks[0].Embedding)
	require.Equal(t, "test-model", chunks[0].EmbeddingModel)
	require.Equal(t, int32(4), chunks[0].EmbeddingDim)
}
