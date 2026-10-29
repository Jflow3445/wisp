-- Hardened security patch:
-- 1) add encryption-key version metadata for stored secrets
-- 2) add companion refresh-session table for revocation/rotation

ALTER TABLE `AgentSecret`
  ADD COLUMN `secretKeyVersion` INTEGER NULL;

ALTER TABLE `AiService`
  ADD COLUMN `signingSecretKeyVersion` INTEGER NULL;

ALTER TABLE `EmailSetting`
  ADD COLUMN `passwordKeyVersion` INTEGER NULL;

CREATE TABLE `CompanionSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `refreshTokenHash` VARCHAR(191) NOT NULL,
  `refreshExpiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `replacedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CompanionSession_refreshTokenHash_key`(`refreshTokenHash`),
  INDEX `CompanionSession_userId_revokedAt_refreshExpiresAt_idx`(`userId`, `revokedAt`, `refreshExpiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CompanionSession`
  ADD CONSTRAINT `CompanionSession_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
