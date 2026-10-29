ALTER TABLE `PlatformSetting`
  ADD COLUMN `googleSocialAuthEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `googleSocialAuthClientId` VARCHAR(191) NULL,
  ADD COLUMN `googleSocialAuthClientSecret` VARCHAR(191) NULL,
  ADD COLUMN `googleSocialAuthClientSecretKeyVersion` INT NULL,
  ADD COLUMN `facebookSocialAuthEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `facebookSocialAuthClientId` VARCHAR(191) NULL,
  ADD COLUMN `facebookSocialAuthClientSecret` VARCHAR(191) NULL,
  ADD COLUMN `facebookSocialAuthClientSecretKeyVersion` INT NULL;

CREATE TABLE `UserSocialAccount` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` ENUM('GOOGLE', 'FACEBOOK') NOT NULL,
  `providerAccountId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UserSocialAccount_provider_providerAccountId_key`(`provider`, `providerAccountId`),
  UNIQUE INDEX `UserSocialAccount_userId_provider_key`(`userId`, `provider`),
  INDEX `UserSocialAccount_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserSocialAccount`
  ADD CONSTRAINT `UserSocialAccount_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
