-- Add hierarchical-notes fields to memo.
ALTER TABLE memo ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memo ADD COLUMN folder_path TEXT NOT NULL DEFAULT '';
ALTER TABLE memo ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE memo ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'MARKDOWN';

-- Backfill: give every existing user a "Default" workspace and move their memos into it.
-- New installations have no rows in `memo` yet, so this is a no-op for fresh installs.
INSERT INTO workspace (uid, creator_id, title)
SELECT lower(hex(randomblob(12))), id, 'Default'
FROM user
WHERE id IN (SELECT DISTINCT creator_id FROM memo WHERE workspace_id = 0);

UPDATE memo
SET workspace_id = (
  SELECT workspace.id FROM workspace
  WHERE workspace.creator_id = memo.creator_id
  ORDER BY workspace.id ASC
  LIMIT 1
)
WHERE workspace_id = 0;

CREATE INDEX idx_memo_workspace_folder ON memo (workspace_id, folder_path);
