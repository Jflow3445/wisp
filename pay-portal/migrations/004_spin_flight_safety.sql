ALTER TABLE flight_rounds ADD COLUMN engine_version INT NOT NULL DEFAULT 1;
ALTER TABLE flight_rounds ADD COLUMN schedule_json LONGTEXT NULL;
ALTER TABLE flight_rounds ADD COLUMN schedule_hash CHAR(64) NULL;
ALTER TABLE flight_rounds ADD COLUMN last_retry_ms BIGINT NOT NULL DEFAULT 0;
