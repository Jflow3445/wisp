<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';

function alerts_bootstrap(PDO $pdo): void {
  try {
    $st = $pdo->query("SHOW TABLES LIKE 'admin_alerts'");
    $exists = (bool)$st->fetchColumn();
  } catch (Throwable $e) {
    $exists = false;
  }
  if (!$exists) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_alerts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ts DATETIME NULL,
      type VARCHAR(32) NULL,
      username VARCHAR(32) NULL,
      msg TEXT NOT NULL,
      remote_addr VARCHAR(64) NULL,
      acked TINYINT(1) NOT NULL DEFAULT 0,
      acked_at DATETIME NULL,
      acked_by VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  } else {
    $cols = $pdo->query("SHOW COLUMNS FROM admin_alerts")->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $has = [];
    foreach ($cols as $c) $has[strtolower($c['Field'])] = true;
    try {
      if (empty($has['acked'])) $pdo->exec("ALTER TABLE admin_alerts ADD COLUMN acked TINYINT(1) NOT NULL DEFAULT 0");
    } catch (Throwable $e) {}
    try {
      if (empty($has['acked_at'])) $pdo->exec("ALTER TABLE admin_alerts ADD COLUMN acked_at DATETIME NULL");
    } catch (Throwable $e) {}
    try {
      if (empty($has['acked_by'])) $pdo->exec("ALTER TABLE admin_alerts ADD COLUMN acked_by VARCHAR(64) NULL");
    } catch (Throwable $e) {}
  }
}

function alerts_insert(PDO $pdo, ?string $ts, ?string $type, ?string $user, string $msg, ?string $remote): void {
  alerts_bootstrap($pdo);
  $st = $pdo->prepare("INSERT INTO admin_alerts (ts, type, username, msg, remote_addr, acked)
                       VALUES (:ts, :t, :u, :m, :r, 0)");
  $st->execute([
    ':ts' => $ts,
    ':t'  => $type,
    ':u'  => $user,
    ':m'  => $msg,
    ':r'  => $remote,
  ]);
}
