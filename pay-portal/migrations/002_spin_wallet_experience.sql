-- Preserve all existing receipts and credit history. New spins use the ordinary wallet.
ALTER TABLE spin_spins ADD COLUMN payout_wallet VARCHAR(16) NOT NULL DEFAULT 'network';
ALTER TABLE spin_state ADD COLUMN wallet_experience_version INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS spin_consents (
  msisdn VARCHAR(32) NOT NULL,
  version VARCHAR(32) NOT NULL,
  consent_text VARCHAR(500) NOT NULL,
  text_hash CHAR(64) NOT NULL,
  accepted_at DATETIME NOT NULL,
  PRIMARY KEY(msisdn,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
