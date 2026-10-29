-- Hot-path index patch for admin, support, payments, and marketing recipient pages.

SET @db := DATABASE();

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PublishedCommand'
    AND index_name = 'PublishedCommand_userId_issuedAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PublishedCommand` ADD INDEX `PublishedCommand_userId_issuedAt_idx` (`userId`, `issuedAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PublishedCommand'
    AND index_name = 'PublishedCommand_agentId_leaseStatus_executionStatus_issuedAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PublishedCommand` ADD INDEX `PublishedCommand_agentId_leaseStatus_executionStatus_issuedAt_idx` (`agentId`, `leaseStatus`, `executionStatus`, `issuedAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PublishedCommand'
    AND index_name = 'PublishedCommand_agentId_leaseStatus_executionStatus_expiresAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PublishedCommand` ADD INDEX `PublishedCommand_agentId_leaseStatus_executionStatus_expiresAt_idx` (`agentId`, `leaseStatus`, `executionStatus`, `expiresAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PaymentOrder'
    AND index_name = 'PaymentOrder_status_graceExpiresAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PaymentOrder` ADD INDEX `PaymentOrder_status_graceExpiresAt_idx` (`status`, `graceExpiresAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PaymentOrder'
    AND index_name = 'PaymentOrder_userId_status_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PaymentOrder` ADD INDEX `PaymentOrder_userId_status_createdAt_idx` (`userId`, `status`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'SupportTicket'
    AND index_name = 'SupportTicket_userId_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `SupportTicket` ADD INDEX `SupportTicket_userId_createdAt_idx` (`userId`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'MarketingBlastRecipient'
    AND index_name = 'MarketingBlastRecipient_campaignId_scheduledFor_id_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `MarketingBlastRecipient` ADD INDEX `MarketingBlastRecipient_campaignId_scheduledFor_id_idx` (`campaignId`, `scheduledFor`, `id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'MarketingBlastRecipient'
    AND index_name = 'MarketingBlastRecipient_campaignId_status_scheduledFor_id_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `MarketingBlastRecipient` ADD INDEX `MarketingBlastRecipient_campaignId_status_scheduledFor_id_idx` (`campaignId`, `status`, `scheduledFor`, `id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'PaymentManualReview'
    AND index_name = 'PaymentManualReview_resolvedAt_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `PaymentManualReview` ADD INDEX `PaymentManualReview_resolvedAt_createdAt_idx` (`resolvedAt`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'AuditLog'
    AND index_name = 'AuditLog_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `AuditLog` ADD INDEX `AuditLog_createdAt_idx` (`createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'AuditLog'
    AND index_name = 'AuditLog_actorType_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `AuditLog` ADD INDEX `AuditLog_actorType_createdAt_idx` (`actorType`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db
    AND table_name = 'AuditLog'
    AND index_name = 'AuditLog_entityType_createdAt_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `AuditLog` ADD INDEX `AuditLog_entityType_createdAt_idx` (`entityType`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
