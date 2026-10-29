-- Add PAUSED as a first-class blast campaign status so admins can pause/resume running sends.

ALTER TABLE `MarketingBlastCampaign`
  MODIFY COLUMN `status` ENUM('SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED';
