-- Allow long-form marketing copy for admin-managed templates/campaigns.
-- Removes 191-char storage cap for subject/body fields.

ALTER TABLE `MarketingSequenceTemplate`
  MODIFY COLUMN `subject` LONGTEXT NOT NULL,
  MODIFY COLUMN `body` LONGTEXT NOT NULL;

ALTER TABLE `MarketingBlastCampaign`
  MODIFY COLUMN `subject` LONGTEXT NOT NULL,
  MODIFY COLUMN `body` LONGTEXT NOT NULL;