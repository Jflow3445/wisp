ALTER TABLE `FlightRound` DROP CONSTRAINT `FlightRound_pilot_engine_check`;
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_pilot_engine_check`
CHECK (`engineVersion` IN (5,8) OR (`engineVersion` IN (6,7) AND `pilotInputsJson` IS NOT NULL AND `pilotStateJson` IS NOT NULL));
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_draw_check`
CHECK (`engineVersion` <> 8 OR (`reservationCents` = `capCents` AND `pilotStateJson` IS NULL AND `pilotInputsJson` IS NULL));
