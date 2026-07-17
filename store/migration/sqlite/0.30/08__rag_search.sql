-- RAG search: chunk store, full-text index, and incremental index queue.

-- memo_chunk holds the chunked, per-fragment content and (optional) embedding
-- vector for a memo. Embedding-related columns stay empty until an embedding
-- model is configured, so full-text search works standalone.
CREATE TABLE memo_chunk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memo_id INTEGER NOT NULL,
  workspace_id INTEGER NOT NULL DEFAULT 0,
  folder_path TEXT NOT NULL DEFAULT '',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding BLOB,
  embedding_model TEXT NOT NULL DEFAULT '',
  embedding_dim INTEGER NOT NULL DEFAULT 0,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_memo_chunk_memo_id ON memo_chunk(memo_id);
CREATE INDEX idx_memo_chunk_workspace_id ON memo_chunk(workspace_id);

-- memo_chunk_fts is a standalone FTS5 index over chunk content. rowid is kept
-- equal to memo_chunk.id so the application layer can sync it directly. The
-- trigram tokenizer gives substring matching that works for CJK without an
-- external word segmenter.
CREATE VIRTUAL TABLE memo_chunk_fts USING fts5(content, tokenize='trigram');

-- memo_index_job is the incremental (re)index queue. One row per memo (memo_id
-- is the primary key), upserted whenever a memo needs indexing.
CREATE TABLE memo_index_job (
  memo_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT 'updated',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_memo_index_job_status ON memo_index_job(status);
