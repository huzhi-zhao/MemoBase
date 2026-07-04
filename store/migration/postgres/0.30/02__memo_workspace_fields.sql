-- Add hierarchical-notes fields to memo.
ALTER TABLE memo ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memo ADD COLUMN folder_path TEXT NOT NULL DEFAULT '';
ALTER TABLE memo ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE memo ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'MARKDOWN';

-- Backfill: give every existing user a "Default" workspace and move their memos into it.
INSERT INTO workspace (uid, creator_id, title)
SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 24), "user".id, 'Default'
FROM "user"
WHERE "user".id IN (SELECT DISTINCT creator_id FROM memo WHERE workspace_id = 0);

UPDATE memo
SET workspace_id = default_workspace.workspace_id
FROM (
  SELECT creator_id, MIN(id) AS workspace_id
  FROM workspace
  GROUP BY creator_id
) AS default_workspace
WHERE default_workspace.creator_id = memo.creator_id
  AND memo.workspace_id = 0;

CREATE INDEX idx_memo_workspace_folder ON memo (workspace_id, folder_path);
