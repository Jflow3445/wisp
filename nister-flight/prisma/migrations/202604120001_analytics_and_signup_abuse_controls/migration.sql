ALTER TABLE `PlatformSetting`
  ADD COLUMN `ga4Enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `ga4MeasurementId` VARCHAR(191) NULL,
  ADD COLUMN `posthogProjectKey` VARCHAR(191) NULL,
  ADD COLUMN `posthogHost` VARCHAR(191) NULL,
  ADD COLUMN `posthogSessionReplayEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `posthogSessionReplaySamplePct` INT NOT NULL DEFAULT 20,
  ADD COLUMN `posthogFeatureFlagsEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `turnstileEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `turnstileSiteKey` VARCHAR(191) NULL,
  ADD COLUMN `turnstileSecretKey` VARCHAR(191) NULL,
  ADD COLUMN `turnstileSecretKeyVersion` INT NULL,
  ADD COLUMN `turnstileProtectSignup` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `turnstileProtectLogin` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `turnstileProtectForgotPassword` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `signupIpMaxAttempts` INT NOT NULL DEFAULT 8,
  ADD COLUMN `signupIpWindowMinutes` INT NOT NULL DEFAULT 60,
  ADD COLUMN `signupIpLockMinutes` INT NOT NULL DEFAULT 60,
  ADD COLUMN `signupEmailMaxAttempts` INT NOT NULL DEFAULT 5,
  ADD COLUMN `signupEmailWindowMinutes` INT NOT NULL DEFAULT 1440,
  ADD COLUMN `signupEmailLockMinutes` INT NOT NULL DEFAULT 1440,
  ADD COLUMN `signupBlockDisposableDomains` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `signupDisposableDomains` JSON NULL,
  ADD COLUMN `enforceVerifiedEmailForActivation` BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE `PlatformSetting`
SET
  `posthogSessionReplayEnabled` = `sessionReplayEnabled`,
  `posthogSessionReplaySamplePct` = `sessionReplaySamplePct`,
  `posthogProjectKey` = CASE
    WHEN `analyticsProvider` = 'posthog' AND (`posthogProjectKey` IS NULL OR `posthogProjectKey` = '') THEN `analyticsSiteKey`
    ELSE `posthogProjectKey`
  END,
  `posthogHost` = CASE
    WHEN `analyticsProvider` = 'posthog' AND (`posthogHost` IS NULL OR `posthogHost` = '') THEN `analyticsHost`
    ELSE `posthogHost`
  END
WHERE `id` = 1;
