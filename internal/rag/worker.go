package rag

import (
	"context"
	"log/slog"
	"time"

	"github.com/usememos/memos/store"
)

const (
	// pollInterval is how often the worker checks the queue when idle.
	pollInterval = 5 * time.Second
	// maxAttempts caps retries before a job is marked failed.
	maxAttempts = 3
	// batchSize is how many jobs the worker claims per poll.
	batchSize = 20
)

// Worker drains the memo_index_job queue, (re)building chunk/embedding data.
type Worker struct {
	store *store.Store
}

// NewWorker constructs an index worker.
func NewWorker(s *store.Store) *Worker {
	return &Worker{store: s}
}

// Run consumes the index queue until the context is cancelled.
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// Drain once immediately on startup.
	w.drain(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.drain(ctx)
		}
	}
}

func (w *Worker) drain(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		pending := store.IndexJobStatusPending
		limit := batchSize
		jobs, err := w.store.ListMemoIndexJobs(ctx, &store.FindMemoIndexJob{Status: &pending, Limit: &limit})
		if err != nil {
			slog.Error("rag: failed to list index jobs", "err", err)
			return
		}
		if len(jobs) == 0 {
			return
		}

		// Resolve embedding config once per batch; it rarely changes and each
		// resolution reads the instance setting.
		embedding, err := resolveEmbedding(ctx, w.store)
		if err != nil {
			slog.Error("rag: failed to resolve embedding config", "err", err)
			return
		}

		for _, job := range jobs {
			if ctx.Err() != nil {
				return
			}
			w.process(ctx, job, embedding)
		}
	}
}

func (w *Worker) process(ctx context.Context, job *store.MemoIndexJob, embedding EmbeddingResolution) {
	processing := store.IndexJobStatusProcessing
	if err := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{MemoID: job.MemoID, Status: &processing}); err != nil {
		slog.Error("rag: failed to mark job processing", "err", err, "memoID", job.MemoID)
		return
	}

	err := indexMemo(ctx, w.store, job.MemoID, embedding)
	if err == nil {
		done := store.IndexJobStatusDone
		if uerr := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{MemoID: job.MemoID, Status: &done}); uerr != nil {
			slog.Error("rag: failed to mark job done", "err", uerr, "memoID", job.MemoID)
		}
		return
	}

	slog.Warn("rag: failed to index memo", "err", err, "memoID", job.MemoID, "attempts", job.Attempts+1)
	attempts := job.Attempts + 1
	msg := err.Error()
	status := store.IndexJobStatusPending
	if attempts >= maxAttempts {
		status = store.IndexJobStatusFailed
	}
	if uerr := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{
		MemoID:    job.MemoID,
		Status:    &status,
		Attempts:  &attempts,
		LastError: &msg,
	}); uerr != nil {
		slog.Error("rag: failed to update failed job", "err", uerr, "memoID", job.MemoID)
	}
}
