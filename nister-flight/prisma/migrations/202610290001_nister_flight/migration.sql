-- CreateTable
CREATE TABLE `FlightControl` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `depositsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `withdrawalsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `minStakeCents` INTEGER NOT NULL DEFAULT 100,
    `maxStakeCents` INTEGER NOT NULL DEFAULT 10000,
    `minWithdrawalCents` INTEGER NOT NULL DEFAULT 1000,
    `houseEdgePpm` INTEGER NOT NULL DEFAULT 64250,
    `houseBalanceCents` INTEGER NOT NULL DEFAULT 0,
    `reservedCents` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightPlayer` (
    `userId` VARCHAR(191) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `consentAt` DATETIME(3) NULL,
    `termsVersion` VARCHAR(191) NULL,
    `blocked` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightRound` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `activeUserId` VARCHAR(191) NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `stakeCents` INTEGER NOT NULL,
    `capCents` INTEGER NOT NULL,
    `payoutCents` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'FLYING',
    `seed` VARCHAR(191) NOT NULL,
    `commitment` VARCHAR(191) NOT NULL,
    `rulesJson` JSON NOT NULL,
    `pathJson` JSON NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endsAt` DATETIME(3) NOT NULL,
    `settledAt` DATETIME(3) NULL,

    UNIQUE INDEX `FlightRound_activeUserId_key`(`activeUserId`),
    INDEX `FlightRound_status_endsAt_idx`(`status`, `endsAt`),
    INDEX `FlightRound_userId_startedAt_idx`(`userId`, `startedAt`),
    UNIQUE INDEX `FlightRound_userId_requestKey_key`(`userId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightWithdrawal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `network` VARCHAR(191) NOT NULL DEFAULT 'TRC20',
    `token` VARCHAR(191) NOT NULL DEFAULT 'USDT',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `txHash` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FlightWithdrawal_txHash_key`(`txHash`),
    INDEX `FlightWithdrawal_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `FlightWithdrawal_userId_requestKey_key`(`userId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightWalletEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FlightWalletEntry_reference_key`(`reference`),
    INDEX `FlightWalletEntry_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightAudit` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `details` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FlightAudit_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FlightPlayer` ADD CONSTRAINT `FlightPlayer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlightWithdrawal` ADD CONSTRAINT `FlightWithdrawal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlightWalletEntry` ADD CONSTRAINT `FlightWalletEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initialize the singleton before the service accepts wallet mutations.
INSERT INTO `FlightControl` (`id`, `updatedAt`) VALUES (1, UTC_TIMESTAMP(3));

-- Carry existing available capital into the new ledger without changing balances.
INSERT INTO `FlightWalletEntry` (`id`,`userId`,`reference`,`kind`,`amountCents`,`createdAt`)
SELECT CONCAT('flight_opening_',SHA2(`userId`,256)),`userId`,CONCAT('opening:',`userId`),'OPENING_BALANCE',`availableFundsUsdCents`,UTC_TIMESTAMP(3)
FROM `UserTradingProfile` WHERE COALESCE(`availableFundsUsdCents`,0) <> 0;
