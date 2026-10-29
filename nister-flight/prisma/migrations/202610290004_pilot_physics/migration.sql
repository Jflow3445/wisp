-- AlterTable
ALTER TABLE `FlightRound` ADD COLUMN `engineVersion` INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN `pilotInputsJson` JSON NULL,
    ADD COLUMN `pilotStateJson` JSON NULL;

ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_pilot_engine_check`
CHECK (`engineVersion` = 5 OR (`engineVersion` = 6 AND `pilotInputsJson` IS NOT NULL AND `pilotStateJson` IS NOT NULL));
