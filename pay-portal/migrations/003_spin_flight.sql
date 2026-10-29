CREATE TABLE IF NOT EXISTS flight_configs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rules_json LONGTEXT NOT NULL, rules_hash CHAR(64) NOT NULL,
  created_by VARCHAR(64) NOT NULL, reason VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE spin_state ADD COLUMN flight_config_id BIGINT NULL;
CREATE TABLE IF NOT EXISTS flight_rounds (
  id CHAR(32) NOT NULL PRIMARY KEY, msisdn VARCHAR(32) NOT NULL,
  request_key VARCHAR(64) NOT NULL, active_user VARCHAR(32) NULL,
  config_id BIGINT NOT NULL, config_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL, stake_cents BIGINT NOT NULL,
  return_cap_cents BIGINT NOT NULL, pool_bps INT NOT NULL,
  pool_at_start_cents BIGINT NOT NULL, path_json LONGTEXT NOT NULL, path_hash CHAR(64) NOT NULL,
  start_ms BIGINT NOT NULL, end_ms BIGINT NOT NULL, terminal_ms BIGINT NOT NULL, step_ms INT NOT NULL,
  cash_after_hold_cents BIGINT NOT NULL, payout_cents BIGINT NULL,
  cash_after_cents BIGINT NULL, pool_after_cents BIGINT NULL,
  end_reason VARCHAR(24) NULL, collected_offer_id CHAR(32) NULL, accepted_ms BIGINT NULL, settled_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_flight_start(msisdn,request_key), UNIQUE KEY uq_flight_active(active_user),
  KEY idx_flight_expiry(status,terminal_ms), KEY idx_flight_player(msisdn,start_ms),
  FOREIGN KEY(config_id) REFERENCES flight_configs(id),
  CHECK(stake_cents>0), CHECK(return_cap_cents>=0), CHECK(status IN ('ACTIVE','PAYOUT_PENDING','SETTLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS flight_offers (
  id CHAR(32) NOT NULL PRIMARY KEY, round_id CHAR(32) NOT NULL, sequence_no INT NOT NULL,
  amount_cents BIGINT NOT NULL, issued_ms BIGINT NOT NULL, expires_ms BIGINT NOT NULL,
  UNIQUE KEY uq_flight_frame(round_id,sequence_no), FOREIGN KEY(round_id) REFERENCES flight_rounds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS flight_collect_requests (
  msisdn VARCHAR(32) NOT NULL, request_key VARCHAR(64) NOT NULL,
  round_id CHAR(32) NOT NULL, offer_id CHAR(32) NOT NULL, accepted_ms BIGINT NOT NULL, created_at DATETIME NOT NULL,
  PRIMARY KEY(msisdn,request_key), FOREIGN KEY(round_id) REFERENCES flight_rounds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
