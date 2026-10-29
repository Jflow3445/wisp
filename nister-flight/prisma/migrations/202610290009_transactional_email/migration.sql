CREATE TABLE `FlightEmail` (
 `id` VARCHAR(191) NOT NULL,
 `reference` VARCHAR(191) NOT NULL,
 `userId` VARCHAR(191) NOT NULL,
 `toEmail` VARCHAR(191) NOT NULL,
 `subject` VARCHAR(191) NOT NULL,
 `text` TEXT NOT NULL,
 `html` LONGTEXT NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `lockedAt` DATETIME(3) NULL,
 `sentAt` DATETIME(3) NULL,
 `lastError` VARCHAR(191) NULL,
 `expiresAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 UNIQUE INDEX `FlightEmail_reference_key` (`reference`),
 INDEX `FlightEmail_status_nextAttemptAt_idx` (`status`,`nextAttemptAt`),
 INDEX `FlightEmail_userId_createdAt_idx` (`userId`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `FlightEmail` ADD CONSTRAINT `FlightEmail_state_check`
 CHECK (`status` IN ('PENDING','SENDING','SENT','CANCELLED') AND `attempts` >= 0);
