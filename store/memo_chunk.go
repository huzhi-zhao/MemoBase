package store

import (
	"context"
	"encoding/binary"
	"math"

	"github.com/pkg/errors"
)

// Index job status values.
const (
	IndexJobStatusPending    = "pending"
	IndexJobStatusProcessing = "processing"
	IndexJobStatusDone       = "done"
	IndexJobStatusFailed     = "failed"
)

// Index job reasons.
const (
	IndexJobReasonCreated      = "created"
	IndexJobReasonUpdated      = "updated"
	IndexJobReasonModelChanged = "model_changed"
	IndexJobReasonManual       = "manual"
)

// MemoChunk is one indexed fragment of a memo's content. When an embedding model
// is configured, Embedding/EmbeddingModel/EmbeddingDim are populated; otherwise
// only the content (searchable via FTS) is stored.
type MemoChunk struct {
	ID             int32
	MemoID         int32
	WorkspaceID    int32
	FolderPath     string
	ChunkIndex     int32
	Content        string
	Embedding      []float32
	EmbeddingModel string
	EmbeddingDim   int32
	CreatedTs      int64
	UpdatedTs      int64
}

// FindMemoChunk filters chunk lookups. MemoIDs, when set, restricts results to a
// permission-scoped set of memos.
type FindMemoChunk struct {
	MemoID       *int32
	WorkspaceID  *int32
	MemoIDs      []int32
	HasEmbedding *bool
}

// ChunkFTSQuery describes a full-text search over chunk content.
type ChunkFTSQuery struct {
	Query       string
	WorkspaceID *int32
	MemoIDs     []int32
	Limit       int
}

// ChunkFTSResult is a single FTS hit. Rank is FTS5's bm25 rank (lower is better).
type ChunkFTSResult struct {
	ChunkID int32
	MemoID  int32
	Content string
	Rank    float64
}

// MemoIndexJob is a queued (re)index request for a memo.
type MemoIndexJob struct {
	MemoID    int32
	Status    string
	Reason    string
	Attempts  int32
	LastError string
	CreatedTs int64
	UpdatedTs int64
}

// FindMemoIndexJob filters index-job lookups.
type FindMemoIndexJob struct {
	MemoID *int32
	Status *string
	Limit  *int
}

// UpdateMemoIndexJob updates the state of a queued index job.
type UpdateMemoIndexJob struct {
	MemoID    int32
	Status    *string
	Attempts  *int32
	LastError *string
}

// EncodeEmbedding serializes a float32 vector into a little-endian BLOB.
func EncodeEmbedding(vec []float32) []byte {
	buf := make([]byte, len(vec)*4)
	for i, v := range vec {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(v))
	}
	return buf
}

// DecodeEmbedding deserializes a little-endian BLOB back into a float32 vector.
func DecodeEmbedding(buf []byte) []float32 {
	if len(buf) == 0 {
		return nil
	}
	vec := make([]float32, len(buf)/4)
	for i := range vec {
		vec[i] = math.Float32frombits(binary.LittleEndian.Uint32(buf[i*4:]))
	}
	return vec
}

// ReplaceMemoChunks atomically removes any existing chunks for the memo and writes
// the new set (keeping the FTS index in sync).
func (s *Store) ReplaceMemoChunks(ctx context.Context, memoID int32, chunks []*MemoChunk) error {
	if memoID == 0 {
		return errors.New("memo id is required")
	}
	return s.driver.ReplaceMemoChunks(ctx, memoID, chunks)
}

// DeleteMemoChunks removes all chunks (and FTS rows) for a memo.
func (s *Store) DeleteMemoChunks(ctx context.Context, memoID int32) error {
	return s.driver.DeleteMemoChunks(ctx, memoID)
}

// ListMemoChunks returns chunks matching the filter.
func (s *Store) ListMemoChunks(ctx context.Context, find *FindMemoChunk) ([]*MemoChunk, error) {
	return s.driver.ListMemoChunks(ctx, find)
}

// SearchMemoChunksFTS runs a full-text query over chunk content.
func (s *Store) SearchMemoChunksFTS(ctx context.Context, query *ChunkFTSQuery) ([]*ChunkFTSResult, error) {
	return s.driver.SearchMemoChunksFTS(ctx, query)
}

// UpsertMemoIndexJob enqueues (or re-enqueues) a memo for indexing.
func (s *Store) UpsertMemoIndexJob(ctx context.Context, memoID int32, reason string) error {
	if memoID == 0 {
		return errors.New("memo id is required")
	}
	if reason == "" {
		reason = IndexJobReasonUpdated
	}
	return s.driver.UpsertMemoIndexJob(ctx, memoID, reason)
}

// ListMemoIndexJobs returns queued index jobs matching the filter.
func (s *Store) ListMemoIndexJobs(ctx context.Context, find *FindMemoIndexJob) ([]*MemoIndexJob, error) {
	return s.driver.ListMemoIndexJobs(ctx, find)
}

// UpdateMemoIndexJob updates a queued index job.
func (s *Store) UpdateMemoIndexJob(ctx context.Context, update *UpdateMemoIndexJob) error {
	return s.driver.UpdateMemoIndexJob(ctx, update)
}

// DeleteMemoIndexJob removes a memo's index job.
func (s *Store) DeleteMemoIndexJob(ctx context.Context, memoID int32) error {
	return s.driver.DeleteMemoIndexJob(ctx, memoID)
}

// CountMemoIndexJobsByStatus returns a status -> count map over the job queue.
func (s *Store) CountMemoIndexJobsByStatus(ctx context.Context) (map[string]int, error) {
	return s.driver.CountMemoIndexJobsByStatus(ctx)
}
