-- Allow long encrypted SMTP secrets (some providers use long passwords/tokens).
-- Varchar(191) is too small once the value is encrypted and base64url encoded.

ALTER TABLE `EmailSetting`
  MODIFY COLUMN `password` LONGTEXT NOT NULL;
