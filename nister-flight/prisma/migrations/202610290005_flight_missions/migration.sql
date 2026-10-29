-- AlterTable
ALTER TABLE `FlightControl` ADD COLUMN `protectedHouseCents` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `FlightRound` ADD COLUMN `contestResult` VARCHAR(191) NULL,
    ADD COLUMN `matchId` VARCHAR(191) NULL,
    ADD COLUMN `missionSeedJson` JSON NULL,
    ADD COLUMN `operatorMarginCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `opponentReplayJson` JSON NULL,
    ADD COLUMN `reservationCents` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `FlightMatch` (
    `id` VARCHAR(191) NOT NULL,
    `season` INTEGER NOT NULL,
    `stakeCents` INTEGER NOT NULL,
    `prizeCents` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'FLYING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `settledAt` DATETIME(3) NULL,

    INDEX `FlightMatch_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlightOffer` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stakeCents` INTEGER NOT NULL,
    `retainedCents` INTEGER NOT NULL,
    `seed` VARCHAR(191) NOT NULL,
    `commitment` VARCHAR(191) NOT NULL,
    `rulesJson` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedRoundId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FlightOffer_userId_key`(`userId`),
    UNIQUE INDEX `FlightOffer_usedRoundId_key`(`usedRoundId`),
    INDEX `FlightOffer_userId_stakeCents_expiresAt_idx`(`userId`, `stakeCents`, `expiresAt`),
    INDEX `FlightOffer_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FlightRound_engineVersion_status_startedAt_matchId_idx` ON `FlightRound`(`engineVersion`, `status`, `startedAt`, `matchId`);

-- CreateIndex
CREATE UNIQUE INDEX `FlightRound_matchId_userId_key` ON `FlightRound`(`matchId`, `userId`);

-- AddForeignKey
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `FlightMatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FlightControl` ADD CONSTRAINT `FlightControl_protected_revenue_check`
CHECK (`protectedHouseCents` BETWEEN 0 AND `houseBalanceCents` - `reservedCents`);
ALTER TABLE `FlightRound` DROP CONSTRAINT `FlightRound_pilot_engine_check`;
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_pilot_engine_check`
CHECK (`engineVersion` = 5 OR (`engineVersion` IN (6,7) AND `pilotInputsJson` IS NOT NULL AND `pilotStateJson` IS NOT NULL));
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_operator_allocation_check`
CHECK (`operatorMarginCents` BETWEEN 0 AND `stakeCents`);
ALTER TABLE `FlightMatch` ADD CONSTRAINT `FlightMatch_prize_check`
CHECK (`stakeCents` > 0 AND `prizeCents` BETWEEN 0 AND 2 * `stakeCents`);

ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_mission_reservation_check`
CHECK (`reservationCents` BETWEEN 0 AND `capCents` AND (`engineVersion` <> 7 OR
(`missionSeedJson` IS NOT NULL AND `reservationCents` IN (`stakeCents`,`capCents`))));
ALTER TABLE `FlightOffer` ADD CONSTRAINT `FlightOffer_amount_check`
CHECK (`stakeCents` > 0 AND `retainedCents` BETWEEN 0 AND `stakeCents`);
