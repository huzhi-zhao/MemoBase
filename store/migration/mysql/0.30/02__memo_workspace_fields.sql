-- Add hierarchical-notes fields to memo.
ALTER TABLE `memo` ADD COLUMN `workspace_id` INT NOT NULL DEFAULT 0;
ALTER TABLE `memo` ADD COLUMN `folder_path` VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE `memo` ADD COLUMN `title` VARCHAR(256) NOT NULL DEFAULT '';
ALTER TABLE `memo` ADD COLUMN `doc_type` VARCHAR(32) NOT NULL DEFAULT 'MARKDOWN';

-- Backfill: give every existing user a "Default" workspace and move their memos into it.
INSERT INTO `workspace` (`uid`, `creator_id`, `title`)
SELECT LOWER(HEX(RANDOM_BYTES(12))), `user`.`id`, 'Default'
FROM `user`
WHERE `user`.`id` IN (SELECT DISTINCT `creator_id` FROM `memo` WHERE `workspace_id` = 0);

UPDATE `memo`
JOIN (
  SELECT `creator_id`, MIN(`id`) AS workspace_id
  FROM `workspace`
  GROUP BY `creator_id`
) AS default_workspace ON default_workspace.creator_id = `memo`.`creator_id`
SET `memo`.`workspace_id` = default_workspace.workspace_id
WHERE `memo`.`workspace_id` = 0;

CREATE INDEX `idx_memo_workspace_folder` ON `memo` (`workspace_id`, `folder_path`(255));
