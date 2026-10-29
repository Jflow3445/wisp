-- Marketing automation controls
-- 1) Fix per-stage onboarding reminder counters
-- 2) Global sequence templates + dispatch dedupe
-- 3) Blast scheduling defaults + campaign/recipient queue

ALTER TABLE `OnboardingRecoveryState`
  ADD COLUMN `stageReminderCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `stageEnteredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `MarketingSequenceTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `stage` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `subject` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `ctaLabel` VARCHAR(191) NULL,
  `ctaPath` VARCHAR(191) NULL,
  `ctaHref` VARCHAR(191) NULL,
  `cadenceMinutesJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MarketingSequenceTemplate_stage_key`(`stage`),
  INDEX `MarketingSequenceTemplate_stage_idx`(`stage`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketingSequenceDispatch` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `stage` VARCHAR(191) NOT NULL,
  `attempt` INTEGER NOT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `metadataJson` JSON NULL,
  UNIQUE INDEX `MarketingSequenceDispatch_userId_stage_attempt_key`(`userId`, `stage`, `attempt`),
  INDEX `MarketingSequenceDispatch_stage_sentAt_idx`(`stage`, `sentAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketingBlastScheduleConfig` (
  `id` INTEGER NOT NULL,
  `smallAudienceThreshold` INTEGER NOT NULL DEFAULT 500,
  `smallAudienceWindowMinHrs` INTEGER NOT NULL DEFAULT 48,
  `smallAudienceWindowMaxHrs` INTEGER NOT NULL DEFAULT 72,
  `largeAudienceWindowMinDays` INTEGER NOT NULL DEFAULT 7,
  `largeAudienceWindowMaxDays` INTEGER NOT NULL DEFAULT 28,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketingBlastCampaign` (
  `id` VARCHAR(191) NOT NULL,
  `audienceCategory` VARCHAR(191) NOT NULL,
  `audienceCount` INTEGER NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `ctaLabel` VARCHAR(191) NULL,
  `ctaPath` VARCHAR(191) NULL,
  `ctaHref` VARCHAR(191) NULL,
  `status` ENUM('SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `onlyVerified` BOOLEAN NOT NULL DEFAULT true,
  `windowStartAt` DATETIME(3) NOT NULL,
  `windowEndAt` DATETIME(3) NOT NULL,
  `scheduleSource` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `totalRecipients` INTEGER NOT NULL DEFAULT 0,
  `sentRecipients` INTEGER NOT NULL DEFAULT 0,
  `failedRecipients` INTEGER NOT NULL DEFAULT 0,
  `createdByAdminId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `MarketingBlastCampaign_status_windowStartAt_idx`(`status`, `windowStartAt`),
  INDEX `MarketingBlastCampaign_audienceCategory_createdAt_idx`(`audienceCategory`, `createdAt`),
  INDEX `MarketingBlastCampaign_createdByAdminId_createdAt_idx`(`createdByAdminId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketingBlastRecipient` (
  `id` VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING', 'SENT', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `sentAt` DATETIME(3) NULL,
  `lastError` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MarketingBlastRecipient_campaignId_userId_key`(`campaignId`, `userId`),
  INDEX `MarketingBlastRecipient_status_scheduledFor_idx`(`status`, `scheduledFor`),
  INDEX `MarketingBlastRecipient_campaignId_status_idx`(`campaignId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MarketingSequenceDispatch`
  ADD CONSTRAINT `MarketingSequenceDispatch_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MarketingBlastCampaign`
  ADD CONSTRAINT `MarketingBlastCampaign_createdByAdminId_fkey`
  FOREIGN KEY (`createdByAdminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MarketingBlastRecipient`
  ADD CONSTRAINT `MarketingBlastRecipient_campaignId_fkey`
  FOREIGN KEY (`campaignId`) REFERENCES `MarketingBlastCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MarketingBlastRecipient_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
