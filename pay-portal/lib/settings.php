<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';

function settings_bootstrap(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;
  try {
    $st = $PDO->prepare("SHOW TABLES LIKE 'app_settings'");
    $st->execute();
    $exists = (bool)$st->fetchColumn();
  } catch (Throwable $e) {
    $exists = false;
  }
  if (!$exists) {
    try {
      $PDO->exec("CREATE TABLE IF NOT EXISTS app_settings (
        `k` VARCHAR(64) PRIMARY KEY,
        `v` TEXT NULL,
        `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
      throw new RuntimeException('settings table missing and cannot be created (db permissions?)');
    }
  }
  $ready = true;
}

function settings_get_all(): array {
  settings_bootstrap();
  global $PDO;
  $out = [];
  $st = $PDO->query("SELECT `k`,`v` FROM app_settings");
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $out[(string)$row['k']] = (string)($row['v'] ?? '');
  }
  return $out;
}

function settings_get(string $k, ?string $default=null): ?string {
  settings_bootstrap();
  global $PDO;
  $st = $PDO->prepare("SELECT `v` FROM app_settings WHERE `k`=:k LIMIT 1");
  $st->execute([':k'=>$k]);
  $v = $st->fetchColumn();
  if ($v === false || $v === null) return $default;
  return (string)$v;
}

function settings_set(string $k, ?string $v): void {
  settings_bootstrap();
  global $PDO;
  $st = $PDO->prepare("INSERT INTO app_settings (`k`,`v`) VALUES (:k,:v)
                       ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)");
  $st->execute([':k'=>$k, ':v'=>$v]);
}
