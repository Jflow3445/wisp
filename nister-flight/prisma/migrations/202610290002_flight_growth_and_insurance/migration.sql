-- AlterTable
ALTER TABLE `FlightControl` ADD COLUMN `feeBps` INTEGER NOT NULL DEFAULT 300,
    ADD COLUMN `feesCollectedCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `insuranceBalanceCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `launchReserveCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `liveLaunchedAt` DATETIME(3) NULL,
    ADD COLUMN `referralBps` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `referralsEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `referralsPaidCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `season` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `seasonStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `FlightPlayer` ADD COLUMN `isTestAccount` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `FlightRound` ADD COLUMN `feeCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `referralCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `referralUserId` VARCHAR(191) NULL,
    ADD COLUMN `season` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `FlightReferralReward` (
    `id` VARCHAR(191) NOT NULL,
    `roundId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `referredUserId` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,

    UNIQUE INDEX `FlightReferralReward_roundId_key`(`roundId`),
    INDEX `FlightReferralReward_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    INDEX `FlightReferralReward_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FlightRound_season_settledAt_idx` ON `FlightRound`(`season`, `settledAt`);

-- AddForeignKey
ALTER TABLE `FlightReferralReward` ADD CONSTRAINT `FlightReferralReward_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `FlightRound`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlightReferralReward` ADD CONSTRAINT `FlightReferralReward_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlightReferralReward` ADD CONSTRAINT `FlightReferralReward_referredUserId_fkey` FOREIGN KEY (`referredUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
