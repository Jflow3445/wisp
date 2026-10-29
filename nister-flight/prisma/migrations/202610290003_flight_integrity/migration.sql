-- Defense in depth for money invariants. Account registration tables are unchanged.
ALTER TABLE `FlightControl` ADD CONSTRAINT `FlightControl_capital_check` CHECK (
  `houseBalanceCents` BETWEEN 0 AND 2000000000 AND `reservedCents` BETWEEN 0 AND `houseBalanceCents`
  AND `launchReserveCents` BETWEEN 0 AND 2000000000
  AND `feeBps` = 300 AND `referralBps` BETWEEN 0 AND 300
  AND `insuranceBalanceCents` >= 0 AND `referralsPaidCents` >= 0
  AND `feesCollectedCents` BETWEEN 0 AND 2000000000
  AND `insuranceBalanceCents` + `referralsPaidCents` = `feesCollectedCents`
);
ALTER TABLE `FlightRound` ADD CONSTRAINT `FlightRound_money_check` CHECK (
  `stakeCents` > 0 AND `capCents` = 2 * `stakeCents` AND `feeCents` >= 0
  AND `referralCents` BETWEEN 0 AND `feeCents`
  AND (`payoutCents` IS NULL OR `payoutCents` BETWEEN 0 AND `capCents`)
);
ALTER TABLE `FlightReferralReward` ADD CONSTRAINT `FlightReferralReward_money_check` CHECK (
  `amountCents` > 0 AND `status` IN ('PENDING','PAID','RESET')
);
