-- Make missing UserPolicy trade-count caps default to unlimited.
-- Existing explicit policy values are preserved; positive values still enforce a cap.

ALTER TABLE `UserPolicy`
  ALTER COLUMN `maxOpenTradesTotal` SET DEFAULT 0,
  ALTER COLUMN `maxOpenTradesPerSymbol` SET DEFAULT 0;
