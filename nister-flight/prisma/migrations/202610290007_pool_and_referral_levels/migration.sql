-- Add three-level stake commissions; preserve all prior rewards and accepted rules.
ALTER TABLE `FlightControl`
 ADD COLUMN `referralLevel2Bps` INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN `referralLevel3Bps` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `FlightRound`
 ADD COLUMN `referralPlanJson` JSON NULL,
 ADD COLUMN `poolCentsAtSettlement` INTEGER NULL,
 ADD COLUMN `resultReason` VARCHAR(191) NULL;
ALTER TABLE `FlightReferralReward`
 ADD COLUMN `level` INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN `rateBps` INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX `FlightReferralReward_roundId_level_key` ON `FlightReferralReward`(`roundId`,`level`);
CREATE UNIQUE INDEX `FlightReferralReward_roundId_userId_key` ON `FlightReferralReward`(`roundId`,`userId`);
CREATE INDEX `FlightReferralReward_userId_referredUserId_status_idx` ON `FlightReferralReward`(`userId`,`referredUserId`,`status`);
DROP INDEX `FlightReferralReward_roundId_key` ON `FlightReferralReward`;
ALTER TABLE `FlightControl` ADD CONSTRAINT `FlightControl_referral_levels_check`
 CHECK (`referralLevel2Bps` BETWEEN 0 AND 300 AND `referralLevel3Bps` BETWEEN 0 AND 300
 AND `referralBps` + `referralLevel2Bps` + `referralLevel3Bps` <= 300);
ALTER TABLE `FlightReferralReward` ADD CONSTRAINT `FlightReferralReward_level_check`
 CHECK (`level` BETWEEN 1 AND 3 AND `rateBps` BETWEEN 0 AND 300);
ALTER TABLE `FlightRound` DROP CONSTRAINT `FlightRound_pilot_engine_check`;
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_pilot_engine_check`
 CHECK (`engineVersion` IN (5,8,9) OR (`engineVersion` IN (6,7) AND `pilotInputsJson` IS NOT NULL AND `pilotStateJson` IS NOT NULL));
ALTER TABLE `FlightRound` DROP CONSTRAINT `FlightRound_draw_check`;
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_draw_check`
 CHECK ((`engineVersion` <> 8 OR (`reservationCents` = `capCents` AND `pilotStateJson` IS NULL AND `pilotInputsJson` IS NULL))
 AND (`engineVersion` <> 9 OR (`reservationCents` = 0 AND `operatorMarginCents` = 0 AND `pilotStateJson` IS NULL AND `pilotInputsJson` IS NULL)));
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_pool_result_check`
 CHECK (`engineVersion` <> 9 OR `payoutCents` IS NULL OR
 (`poolCentsAtSettlement` IS NOT NULL AND `poolCentsAtSettlement` BETWEEN 0 AND 2000000000
 AND `payoutCents` * 10 <= `poolCentsAtSettlement`));
