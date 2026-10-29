-- Apply to the existing PAY database with a migration-owner account. Never run from a web request.
-- All original WISP tables remain intact. UTC datetimes; integer pesewas, no floating money.
CREATE TABLE IF NOT EXISTS spin_configs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rules_json LONGTEXT NOT NULL,
  rules_hash CHAR(64) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO spin_configs VALUES (1,
  '{"win_bps":4500,"min_bonus_pct":1,"max_bonus_pct":100,"distribution":"uniform","weights":[],"pool_bps":1000,"min_stake_cents":100,"max_stake_cents":10000,"daily_stake_cents":20000,"daily_loss_cents":10000,"interval_seconds":10,"delivery_cost_bps":3000}',
  SHA2('{"win_bps":4500,"min_bonus_pct":1,"max_bonus_pct":100,"distribution":"uniform","weights":[],"pool_bps":1000,"min_stake_cents":100,"max_stake_cents":10000,"daily_stake_cents":20000,"daily_loss_cents":10000,"interval_seconds":10,"delivery_cost_bps":3000}',256),
  'migration','Initial disabled configuration',UTC_TIMESTAMP());
CREATE TABLE IF NOT EXISTS spin_state (
  id INT NOT NULL PRIMARY KEY,
  state VARCHAR(16) NOT NULL DEFAULT 'GHOSTED',
  restore_state VARCHAR(16) NOT NULL DEFAULT 'PAUSED',
  config_id BIGINT NOT NULL,
  pool_cents BIGINT NOT NULL DEFAULT 0,
  pool_revision BIGINT NOT NULL DEFAULT 0,
  last_admin_login DATETIME NULL,
  last_admin_user VARCHAR(64) NULL,
  threshold_seconds INT NOT NULL DEFAULT 172800,
  last_watchdog_at DATETIME NULL,
  last_reconcile_at DATETIME NULL,
  reconcile_ok TINYINT NOT NULL DEFAULT 0,
  health_error VARCHAR(500) NULL,
  audit_head CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (config_id) REFERENCES spin_configs(id),
  CHECK (pool_cents >= 0), CHECK (state IN ('ACTIVE','PAUSED','GHOSTED')),
  CHECK (threshold_seconds BETWEEN 3600 AND 604800)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO spin_state(id,config_id,audit_head,created_at) VALUES(1,1,REPEAT('0',64),UTC_TIMESTAMP());
CREATE TABLE IF NOT EXISTS spin_players (
  msisdn VARCHAR(32) NOT NULL PRIMARY KEY,
  birth_date DATE NULL,
  verified_at DATETIME NULL,
  verified_by VARCHAR(64) NULL,
  verification_ref VARCHAR(128) NULL,
  restricted TINYINT NOT NULL DEFAULT 0,
  excluded_until DATETIME NULL,
  daily_stake_cents BIGINT NULL,
  daily_loss_cents BIGINT NULL,
  terms_version VARCHAR(32) NULL,
  terms_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_quotes (
  id CHAR(32) NOT NULL PRIMARY KEY, msisdn VARCHAR(32) NOT NULL,
  stake_cents BIGINT NOT NULL, config_id BIGINT NOT NULL, pool_revision BIGINT NOT NULL,
  quote_json LONGTEXT NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL,
  KEY idx_spin_quotes_expiry(expires_at), FOREIGN KEY(config_id) REFERENCES spin_configs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_spins (
  id CHAR(32) NOT NULL PRIMARY KEY, msisdn VARCHAR(32) NOT NULL,
  request_key VARCHAR(64) NOT NULL, quote_id CHAR(32) NOT NULL,
  config_id BIGINT NOT NULL, outcome VARCHAR(8) NOT NULL,
  config_hash CHAR(64) NOT NULL,
  stake_cents BIGINT NOT NULL, bonus_pct INT NOT NULL, bonus_cents BIGINT NOT NULL,
  credit_cents BIGINT NOT NULL, pool_before_cents BIGINT NOT NULL, pool_after_cents BIGINT NOT NULL,
  cash_after_cents BIGINT NOT NULL, credit_after_cents BIGINT NOT NULL,
  expected_rtp_pct DECIMAL(12,6) NOT NULL, created_at DATETIME NOT NULL,
  UNIQUE KEY uq_spin_request(msisdn,request_key), UNIQUE KEY uq_spin_quote(quote_id),
  KEY idx_spin_player_time(msisdn,created_at), KEY idx_spin_time(created_at),
  FOREIGN KEY(config_id) REFERENCES spin_configs(id), FOREIGN KEY(quote_id) REFERENCES spin_quotes(id),
  CHECK(outcome IN ('win','loss')), CHECK(stake_cents>0), CHECK(bonus_cents>=0), CHECK(credit_cents>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_credit_accounts (
  msisdn VARCHAR(32) NOT NULL PRIMARY KEY, balance_cents BIGINT NOT NULL DEFAULT 0,
  CHECK(balance_cents>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_credit_entries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, msisdn VARCHAR(32) NOT NULL,
  ref VARCHAR(64) NOT NULL UNIQUE, kind VARCHAR(32) NOT NULL,
  amount_cents BIGINT NOT NULL, balance_after_cents BIGINT NOT NULL,
  notes VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL,
  KEY idx_spin_credit_user(msisdn,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_pool_movements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, ref VARCHAR(64) NOT NULL UNIQUE,
  kind VARCHAR(24) NOT NULL, amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL, actor VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NOT NULL, created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_journals (
  ref VARCHAR(64) NOT NULL PRIMARY KEY, kind VARCHAR(32) NOT NULL,
  msisdn VARCHAR(32) NULL, created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_postings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, journal_ref VARCHAR(64) NOT NULL,
  account VARCHAR(40) NOT NULL, amount_cents BIGINT NOT NULL,
  FOREIGN KEY(journal_ref) REFERENCES spin_journals(ref), KEY idx_spin_posting_ref(journal_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor VARCHAR(64) NOT NULL,
  event VARCHAR(40) NOT NULL, payload LONGTEXT NOT NULL,
  previous_hash CHAR(64) NOT NULL, event_hash CHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL, KEY idx_spin_audit_event(event,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_admin_requests (
  actor VARCHAR(64) NOT NULL, request_key VARCHAR(64) NOT NULL,
  fingerprint CHAR(64) NOT NULL, result_json LONGTEXT NOT NULL, created_at DATETIME NOT NULL,
  PRIMARY KEY(actor,request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_admin_mfa (
  actor VARCHAR(64) NOT NULL PRIMARY KEY, last_counter BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_redemptions (
  id CHAR(32) NOT NULL PRIMARY KEY, msisdn VARCHAR(32) NOT NULL,
  request_key VARCHAR(64) NOT NULL, plan_code VARCHAR(64) NOT NULL, location_id INT NOT NULL,
  price_cents BIGINT NOT NULL, purchase_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL,
  UNIQUE KEY uq_spin_redemption_request(msisdn,request_key), KEY idx_spin_redemption_time(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS spin_security_limits (
  bucket VARCHAR(128) NOT NULL PRIMARY KEY, window_start BIGINT NOT NULL, hits INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
