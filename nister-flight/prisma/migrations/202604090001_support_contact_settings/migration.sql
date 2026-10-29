ALTER TABLE `PlatformSetting`
  ADD COLUMN `supportEmail` VARCHAR(191) NOT NULL DEFAULT 'support@nisterai.com';

UPDATE `PlatformSetting`
SET `telegramUrl` = 'https://t.me/nister_ai'
WHERE `telegramUrl` = 'https://t.me/+-6S2Re_EcqJiNmU0';

UPDATE `SiteContent`
SET `telegramUrl` = 'https://t.me/nister_ai'
WHERE `telegramUrl` = 'https://t.me/+-6S2Re_EcqJiNmU0';
