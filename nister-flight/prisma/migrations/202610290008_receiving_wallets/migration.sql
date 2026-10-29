CREATE TABLE `FlightReceivingWallet` (
 `id` VARCHAR(191) NOT NULL,
 `label` VARCHAR(191) NOT NULL,
 `address` VARCHAR(191) NOT NULL,
 `active` BOOLEAN NOT NULL DEFAULT true,
 `defaultKey` VARCHAR(191) NULL,
 `qrImageData` LONGTEXT NULL,
 `hasCustomQr` BOOLEAN NOT NULL DEFAULT false,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `FlightReceivingWallet_address_key` (`address`),
 UNIQUE INDEX `FlightReceivingWallet_defaultKey_key` (`defaultKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `FlightReceivingWallet` ADD CONSTRAINT `FlightReceivingWallet_default_check`
 CHECK (`defaultKey` IS NULL OR (`defaultKey` = 'DEFAULT' AND `active` = true));
ALTER TABLE `FlightReceivingWallet` ADD CONSTRAINT `FlightReceivingWallet_image_check`
 CHECK (`hasCustomQr` = (`qrImageData` IS NOT NULL));
ALTER TABLE `PaymentOrder` ADD COLUMN `receivingWalletId` VARCHAR(191) NULL;
CREATE INDEX `PaymentOrder_receivingWalletId_idx` ON `PaymentOrder` (`receivingWalletId`);
CREATE INDEX `PaymentOrder_merchantReceiveAddress_idx` ON `PaymentOrder` (`merchantReceiveAddress`);
ALTER TABLE `PaymentOrder` ADD CONSTRAINT `PaymentOrder_receivingWalletId_fkey`
 FOREIGN KEY (`receivingWalletId`) REFERENCES `FlightReceivingWallet` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
