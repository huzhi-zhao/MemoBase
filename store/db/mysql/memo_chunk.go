package mysql

import (
	"context"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

// RAG chunk indexing and search are only implemented for the SQLite driver in
// this release. The mysql driver satisfies the interface with explicit
// "unsupported" errors so the rest of the store still compiles and runs.
var errRAGUnsupported = errors.New("RAG search is not supported on this database driver")

func (*DB) ReplaceMemoChunks(_ context.Context, _ int32, _ []*store.MemoChunk) error {
	return errRAGUnsupported
}

func (*DB) DeleteMemoChunks(_ context.Context, _ int32) error {
	return errRAGUnsupported
}

func (*DB) ListMemoChunks(_ context.Context, _ *store.FindMemoChunk) ([]*store.MemoChunk, error) {
	return nil, errRAGUnsupported
}

func (*DB) SearchMemoChunksFTS(_ context.Context, _ *store.ChunkFTSQuery) ([]*store.ChunkFTSResult, error) {
	return nil, errRAGUnsupported
}

func (*DB) UpsertMemoIndexJob(_ context.Context, _ int32, _ string) error {
	return errRAGUnsupported
}

func (*DB) ListMemoIndexJobs(_ context.Context, _ *store.FindMemoIndexJob) ([]*store.MemoIndexJob, error) {
	return nil, errRAGUnsupported
}

func (*DB) UpdateMemoIndexJob(_ context.Context, _ *store.UpdateMemoIndexJob) error {
	return errRAGUnsupported
}

func (*DB) DeleteMemoIndexJob(_ context.Context, _ int32) error {
	return errRAGUnsupported
}

func (*DB) CountMemoIndexJobsByStatus(_ context.Context) (map[string]int, error) {
	return nil, errRAGUnsupported
}
