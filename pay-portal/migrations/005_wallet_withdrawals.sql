CREATE TABLE IF NOT EXISTS wallet_withdrawals (
  id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  msisdn VARCHAR(32) NOT NULL,
  active_user VARCHAR(32) NULL,
  request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount_cents INT NOT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  network VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  approved_by VARCHAR(128) NULL,
  approved_at DATETIME NULL,
  paid_by VARCHAR(128) NULL,
  paid_at DATETIME NULL,
  payout_ref VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  declined_by VARCHAR(128) NULL,
  declined_at DATETIME NULL,
  decline_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_withdrawal_request (msisdn, request_key),
  UNIQUE KEY uq_withdrawal_active (active_user),
  UNIQUE KEY uq_withdrawal_payout (payout_ref),
  KEY idx_withdrawal_queue (status, created_at),
  KEY idx_withdrawal_customer (msisdn, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_withdrawal_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  withdrawal_id VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event VARCHAR(32) NOT NULL,
  actor VARCHAR(128) NOT NULL,
  details_json LONGTEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_withdrawal_transition (withdrawal_id, event),
  KEY idx_withdrawal_event_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (`k`,`v`) VALUES ('WITHDRAWAL_MIN_CENTS','10000');
INSERT IGNORE INTO app_settings (`k`,`v`) VALUES ('WITHDRAWALS_ENABLED','1');
