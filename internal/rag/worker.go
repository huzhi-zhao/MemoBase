package rag

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/store"
)

const (
	// pollInterval is how often the worker checks the queue when idle.
	pollInterval = 5 * time.Second
	// maxAttempts caps retries before a job is marked failed.
	maxAttempts = 3
	// batchSize is how many jobs the worker claims per poll.
	batchSize = 20
	// rateLimitCooldown is how long the worker pauses after a provider 429.
	// Embedding quotas are per-minute, so retrying sooner is guaranteed to fail again.
	rateLimitCooldown = time.Minute
	// maxRateLimitCooldown caps the exponential backoff applied to consecutive 429s.
	// A per-minute quota clears in a minute; anything still limited after half an
	// hour is a longer-lived problem (exhausted plan, revoked key) that polling
	// harder cannot fix.
	maxRateLimitCooldown = 30 * time.Minute
	// maxRateLimitAttempts caps how often one job may be deferred for a rate limit
	// before it is failed like any other error. Higher than maxAttempts because a
	// 429 is usually transient, but not unbounded: a monthly quota that is spent,
	// or a revoked key, returns 429 indefinitely, and an uncapped deferral would
	// retry that job — rewriting last_error each time — for the life of the process.
	maxRateLimitAttempts = 10
)

// Worker drains the memo_index_job queue, (re)building chunk/embedding data.
type Worker struct {
	store *store.Store
	// cooldownUntil pauses processing after a provider rate limit. The limit is
	// provider-wide, so one 429 means every queued job would also fail.
	cooldownUntil time.Time
	// rateLimitStreak counts consecutive rate-limited jobs, doubling the cooldown
	// each time. Reset by the first job that indexes successfully.
	rateLimitStreak int
}

// NewWorker constructs an index worker.
func NewWorker(s *store.Store) *Worker {
	return &Worker{store: s}
}

// Backfill enqueues every indexable memo for indexing when the index queue is
// empty. This bootstraps the search index for documents that already existed
// before the RAG feature was installed (they are otherwise never enqueued, since
// enqueuing only happens on memo create/update). It is a no-op once any job exists.
func Backfill(ctx context.Context, s *store.Store) error {
	counts, err := s.CountMemoIndexJobsByStatus(ctx)
	if err != nil {
		return err
	}
	total := 0
	for _, c := range counts {
		total += c
	}
	if total > 0 {
		// The queue has already been populated (prior backfill, edits, or rebuild).
		return nil
	}

	const batchSize = 200
	offset := 0
	enqueued := 0
	normal := store.Normal
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		limit := batchSize
		memos, err := s.ListMemos(ctx, &store.FindMemo{
			RowStatus:       &normal,
			ExcludeComments: true,
			ExcludeContent:  true,
			Limit:           &limit,
			Offset:          &offset,
		})
		if err != nil {
			return err
		}
		if len(memos) == 0 {
			break
		}
		for _, memo := range memos {
			if !IsIndexable(memo) {
				continue
			}
			if err := s.UpsertMemoIndexJob(ctx, memo.ID, store.IndexJobReasonManual); err != nil {
				return err
			}
			enqueued++
		}
		offset += len(memos)
	}
	if enqueued > 0 {
		slog.Info("rag: backfilled search index queue", "enqueued", enqueued)
	}
	return nil
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
	// Track memos already attempted this cycle. A job that fails is set back to
	// pending; without this it would be re-listed and retried immediately in the
	// same loop, burning all attempts in a tight spin (e.g. against a 429). Skipping
	// seen memos defers each retry to the next poll (pollInterval apart).
	seen := map[int32]bool{}
	for {
		if ctx.Err() != nil {
			return
		}
		if time.Now().Before(w.cooldownUntil) {
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
		// Filter out jobs already attempted this cycle; if nothing new remains, stop
		// and let the next poll pick up the retries.
		fresh := jobs[:0]
		for _, job := range jobs {
			if !seen[job.MemoID] {
				fresh = append(fresh, job)
			}
		}
		if len(fresh) == 0 {
			return
		}
		jobs = fresh

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
			seen[job.MemoID] = true
			w.process(ctx, job, embedding)
		}
	}
}

// rateLimitBackoff returns the pause for the streak-th consecutive rate limit:
// rateLimitCooldown doubled once per prior hit, clamped to maxRateLimitCooldown.
func rateLimitBackoff(streak int) time.Duration {
	if streak < 1 {
		streak = 1
	}
	backoff := rateLimitCooldown
	for i := 1; i < streak && backoff < maxRateLimitCooldown; i++ {
		backoff *= 2
	}
	if backoff > maxRateLimitCooldown {
		return maxRateLimitCooldown
	}
	return backoff
}

func (w *Worker) process(ctx context.Context, job *store.MemoIndexJob, embedding EmbeddingResolution) {
	processing := store.IndexJobStatusProcessing
	if err := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{MemoID: job.MemoID, Status: &processing}); err != nil {
		slog.Error("rag: failed to mark job processing", "err", err, "memoID", job.MemoID)
		return
	}

	err := indexMemo(ctx, w.store, job.MemoID, embedding)
	if err == nil {
		w.rateLimitStreak = 0
		done := store.IndexJobStatusDone
		if uerr := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{MemoID: job.MemoID, Status: &done}); uerr != nil {
			slog.Error("rag: failed to mark job done", "err", uerr, "memoID", job.MemoID)
		}
		return
	}

	if errors.Is(err, ai.ErrRateLimited) {
		// Usually not a job failure but an exhausted provider quota, so pause the
		// whole worker — the limit is provider-wide, and processing more jobs now
		// would only extend the window. Each consecutive 429 doubles the pause.
		w.rateLimitStreak++
		w.cooldownUntil = time.Now().Add(rateLimitBackoff(w.rateLimitStreak))
		// The attempt still counts. A provider that is limited permanently (spent
		// quota, revoked key) would otherwise keep this job pending forever.
		attempts := job.Attempts + 1
		jobStatus := store.IndexJobStatusPending
		if attempts >= maxRateLimitAttempts {
			jobStatus = store.IndexJobStatusFailed
			slog.Warn("rag: giving up on memo after repeated rate limits", "memoID", job.MemoID, "attempts", attempts)
		} else {
			slog.Info("rag: embedding provider rate limited, pausing indexing",
				"memoID", job.MemoID, "attempts", attempts, "cooldown", rateLimitBackoff(w.rateLimitStreak))
		}
		msg := err.Error()
		if uerr := w.store.UpdateMemoIndexJob(ctx, &store.UpdateMemoIndexJob{
			MemoID:    job.MemoID,
			Status:    &jobStatus,
			Attempts:  &attempts,
			LastError: &msg,
		}); uerr != nil {
			slog.Error("rag: failed to reset rate-limited job", "err", uerr, "memoID", job.MemoID)
		}
		return
	}
	w.rateLimitStreak = 0

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
