<?php
declare(strict_types=1);

require_once __DIR__.'/db.php';
require_once __DIR__.'/common.php';

function auto_renew_bootstrap(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;

  $PDO->exec("CREATE TABLE IF NOT EXISTS auto_renew_settings (
    msisdn VARCHAR(32) PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    plan_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_renew_at DATETIME NULL,
    last_attempt_at DATETIME NULL,
    last_error VARCHAR(255) NULL,
    KEY idx_enabled (enabled, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $ready = true;
}

function auto_renew_get(string $rawMsisdn): array {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') {
    return [
      'enabled' => false,
      'plan_code' => null,
      'updated_at' => null,
      'last_renew_at' => null,
      'last_attempt_at' => null,
      'last_error' => null,
    ];
  }

  $st = $PDO->prepare("SELECT enabled, plan_code, updated_at, last_renew_at, last_attempt_at, last_error
                       FROM auto_renew_settings WHERE msisdn=:m LIMIT 1");
  $st->execute([':m'=>$msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) {
    return [
      'enabled' => false,
      'plan_code' => null,
      'updated_at' => null,
      'last_renew_at' => null,
      'last_attempt_at' => null,
      'last_error' => null,
    ];
  }

  return [
    'enabled' => ((int)($row['enabled'] ?? 0)) === 1,
    'plan_code' => ($row['plan_code'] ?? '') !== '' ? (string)$row['plan_code'] : null,
    'updated_at' => $row['updated_at'] ?? null,
    'last_renew_at' => $row['last_renew_at'] ?? null,
    'last_attempt_at' => $row['last_attempt_at'] ?? null,
    'last_error' => $row['last_error'] ?? null,
  ];
}

function auto_renew_set(string $rawMsisdn, bool $enabled, ?string $planCode = null): array {
  auto_renew_bootstrap();
  global $PDO;
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') {
    return [
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

  return auto_renew_get($msisdn);
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
