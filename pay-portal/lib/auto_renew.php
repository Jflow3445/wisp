<?php
declare(strict_types=1);

require_once __DIR__.'/db.php';
require_once __DIR__.'/common.php';
require_once __DIR__.'/location.php';

function auto_renew_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t' => $table]);
  return (bool)$st->fetchColumn();
}

function auto_renew_column_exists(PDO $pdo, string $table, string $column): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
  );
  $st->execute([':t' => $table, ':c' => $column]);
  return (bool)$st->fetchColumn();
}

function auto_renew_index_exists(PDO $pdo, string $table, string $index): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = :t AND index_name = :i LIMIT 1"
  );
  $st->execute([':t' => $table, ':i' => $index]);
  return (bool)$st->fetchColumn();
}

function auto_renew_has_location_column(): bool {
  global $PDO;
  try {
    return auto_renew_column_exists($PDO, 'auto_renew_settings', 'location_id');
  } catch (Throwable $e) {
    return false;
  }
}

function auto_renew_ensure_location_column(PDO $pdo): bool {
  if (!auto_renew_table_exists($pdo, 'auto_renew_settings')) return false;
  if (!auto_renew_column_exists($pdo, 'auto_renew_settings', 'location_id')) {
    $pdo->exec("ALTER TABLE auto_renew_settings ADD COLUMN location_id INT NULL AFTER msisdn");
  }
  if (
    auto_renew_column_exists($pdo, 'auto_renew_settings', 'location_id') &&
    !auto_renew_index_exists($pdo, 'auto_renew_settings', 'idx_auto_renew_location')
  ) {
    $pdo->exec("ALTER TABLE auto_renew_settings ADD KEY idx_auto_renew_location (location_id)");
  }
  return auto_renew_column_exists($pdo, 'auto_renew_settings', 'location_id');
}

function auto_renew_bootstrap(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;

  $PDO->exec("CREATE TABLE IF NOT EXISTS auto_renew_settings (
    msisdn VARCHAR(32) PRIMARY KEY,
    location_id INT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    plan_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_renew_at DATETIME NULL,
    last_attempt_at DATETIME NULL,
    last_error VARCHAR(255) NULL,
    KEY idx_enabled (enabled, updated_at),
    KEY idx_auto_renew_location (location_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  try {
    if (auto_renew_ensure_location_column($PDO)) {
      $defaultLoc = location_default_id();
      $PDO->prepare("UPDATE auto_renew_settings SET location_id=:l WHERE location_id IS NULL")
        ->execute([':l' => $defaultLoc]);
    }
  } catch (Throwable $e) {
    // non-fatal
  }

  $ready = true;
}

function auto_renew_get(string $rawMsisdn, ?int $locationId = null): array {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') {
    return [
      'location_id' => $locationId,
      'enabled' => false,
      'plan_code' => null,
      'updated_at' => null,
      'last_renew_at' => null,
      'last_attempt_at' => null,
      'last_error' => null,
    ];
  }

  $st = $PDO->prepare("SELECT location_id, enabled, plan_code, updated_at, last_renew_at, last_attempt_at, last_error
                       FROM auto_renew_settings WHERE msisdn=:m LIMIT 1");
  if (!auto_renew_has_location_column()) {
    $st = $PDO->prepare("SELECT NULL AS location_id, enabled, plan_code, updated_at, last_renew_at, last_attempt_at, last_error
                         FROM auto_renew_settings WHERE msisdn=:m LIMIT 1");
  }
  $st->execute([':m' => $msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) {
    return [
      'location_id' => $locationId,
      'enabled' => false,
      'plan_code' => null,
      'updated_at' => null,
      'last_renew_at' => null,
      'last_attempt_at' => null,
      'last_error' => null,
    ];
  }

  $rowLoc = (int)($row['location_id'] ?? 0);
  if (auto_renew_has_location_column() && $locationId !== null && $locationId > 0 && $rowLoc !== $locationId) {
    try {
      $PDO->prepare("UPDATE auto_renew_settings SET location_id=:l WHERE msisdn=:m")
        ->execute([':l' => $locationId, ':m' => $msisdn]);
      $rowLoc = $locationId;
    } catch (Throwable $e) { /* non-fatal */ }
  }

  return [
    'location_id' => $rowLoc > 0 ? $rowLoc : $locationId,
    'enabled' => ((int)($row['enabled'] ?? 0)) === 1,
    'plan_code' => ($row['plan_code'] ?? '') !== '' ? (string)$row['plan_code'] : null,
    'updated_at' => $row['updated_at'] ?? null,
    'last_renew_at' => $row['last_renew_at'] ?? null,
    'last_attempt_at' => $row['last_attempt_at'] ?? null,
    'last_error' => $row['last_error'] ?? null,
  ];
}

function auto_renew_set(string $rawMsisdn, bool $enabled, ?string $planCode = null, ?int $locationId = null): array {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') {
    return [
      'location_id' => $locationId,
      'enabled' => false,
      'plan_code' => null,
      'updated_at' => null,
      'last_renew_at' => null,
      'last_attempt_at' => null,
      'last_error' => null,
    ];
  }

  $planCode = $planCode !== null ? trim($planCode) : null;
  if ($planCode === '') $planCode = null;
  if ($locationId === null || $locationId <= 0) {
    $locationId = location_default_id();
  }

  if (auto_renew_has_location_column()) {
    $st = $PDO->prepare(
      "INSERT INTO auto_renew_settings (msisdn, location_id, enabled, plan_code, created_at, updated_at)
       VALUES (:m, :l, :e, :p, NOW(), NOW())
       ON DUPLICATE KEY UPDATE location_id=VALUES(location_id), enabled=VALUES(enabled), plan_code=VALUES(plan_code), updated_at=NOW()"
    );
    $st->execute([
      ':m'=>$msisdn,
      ':l'=>$locationId,
      ':e'=>$enabled ? 1 : 0,
      ':p'=>$planCode,
    ]);
  } else {
    $st = $PDO->prepare(
      "INSERT INTO auto_renew_settings (msisdn, enabled, plan_code, created_at, updated_at)
       VALUES (:m, :e, :p, NOW(), NOW())
       ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), plan_code=VALUES(plan_code), updated_at=NOW()"
    );
    $st->execute([
      ':m'=>$msisdn,
      ':e'=>$enabled ? 1 : 0,
      ':p'=>$planCode,
    ]);
  }

  return auto_renew_get($msisdn, $locationId);
}

function auto_renew_mark_attempt(string $rawMsisdn, ?string $error=null): void {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') return;
  $st = $PDO->prepare("UPDATE auto_renew_settings SET last_attempt_at=NOW(), last_error=:e WHERE msisdn=:m");
  $st->execute([':m'=>$msisdn, ':e'=>$error]);
}

function auto_renew_mark_success(string $rawMsisdn): void {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') return;
  $st = $PDO->prepare("UPDATE auto_renew_settings
                        SET last_attempt_at=NOW(), last_renew_at=NOW(), last_error=NULL
                        WHERE msisdn=:m");
  $st->execute([':m'=>$msisdn]);
}
