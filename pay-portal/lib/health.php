<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
require_once __DIR__.'/alerts.php';

function health_bootstrap(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS health_samples (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ts DATETIME NOT NULL,
    overall_ok TINYINT(1) NULL,
    radius_ok TINYINT(1) NULL,
    radius_ms INT NULL,
    coa_ok TINYINT(1) NULL,
    coa_ms INT NULL,
    tunnel_ok TINYINT(1) NULL,
    route_dev VARCHAR(32) NULL,
    ping_ms INT NULL,
    loss_pct INT NULL,
    speed_mbps DECIMAL(8,2) NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ts (ts),
    KEY idx_overall (overall_ok)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $pdo->exec("CREATE TABLE IF NOT EXISTS health_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    start_ts DATETIME NOT NULL,
    end_ts DATETIME NULL,
    reason VARCHAR(64) NULL,
    last_msg TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_open (end_ts),
    KEY idx_start (start_ts)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function health_insert_sample(PDO $pdo, array $s): void {
  health_bootstrap($pdo);
  $st = $pdo->prepare("INSERT INTO health_samples
    (ts, overall_ok, radius_ok, radius_ms, coa_ok, coa_ms, tunnel_ok, route_dev, ping_ms, loss_pct, speed_mbps, note)
    VALUES (:ts, :overall_ok, :radius_ok, :radius_ms, :coa_ok, :coa_ms, :tunnel_ok, :route_dev, :ping_ms, :loss_pct, :speed_mbps, :note)");
  $st->execute([
    ':ts' => $s['ts'],
    ':overall_ok' => $s['overall_ok'],
    ':radius_ok' => $s['radius_ok'],
    ':radius_ms' => $s['radius_ms'],
    ':coa_ok' => $s['coa_ok'],
    ':coa_ms' => $s['coa_ms'],
    ':tunnel_ok' => $s['tunnel_ok'],
    ':route_dev' => $s['route_dev'],
    ':ping_ms' => $s['ping_ms'],
    ':loss_pct' => $s['loss_pct'],
    ':speed_mbps' => $s['speed_mbps'],
    ':note' => $s['note'],
  ]);
}

function health_update_events(PDO $pdo, array $s): void {
  health_bootstrap($pdo);
  $overall = $s['overall_ok'];
  $note = (string)($s['note'] ?? '');
  $now = (string)($s['ts'] ?? date('Y-m-d H:i:s'));

  $open = $pdo->query("SELECT id FROM health_events WHERE end_ts IS NULL ORDER BY id DESC LIMIT 1")->fetchColumn();
  if ($overall === 0) {
    if (!$open) {
      $st = $pdo->prepare("INSERT INTO health_events (start_ts, reason, last_msg) VALUES (:s, :r, :m)");
      $st->execute([':s'=>$now, ':r'=>'health_fail', ':m'=>$note]);
      alerts_insert($pdo, $now, 'health_fail', null, 'Health check failed: '.$note, null);
    } else {
      $st = $pdo->prepare("UPDATE health_events SET last_msg=:m WHERE id=:id");
      $st->execute([':m'=>$note, ':id'=>$open]);
    }
  } else {
    if ($open) {
      $st = $pdo->prepare("UPDATE health_events SET end_ts=:e WHERE id=:id");
      $st->execute([':e'=>$now, ':id'=>$open]);
      alerts_insert($pdo, $now, 'health_ok', null, 'Health check recovered', null);
    }
  }
}

function health_latest(PDO $pdo): ?array {
  health_bootstrap($pdo);
  $st = $pdo->query("SELECT * FROM health_samples ORDER BY id DESC LIMIT 1");
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function health_events(PDO $pdo, int $limit=30): array {
  health_bootstrap($pdo);
  $st = $pdo->prepare("SELECT * FROM health_events ORDER BY id DESC LIMIT :lim");
  $st->bindValue(':lim', $limit, PDO::PARAM_INT);
  $st->execute();
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function health_coa_success_rate(PDO $pdo, int $window=120): ?float {
  health_bootstrap($pdo);
  $st = $pdo->prepare("SELECT
      SUM(CASE WHEN coa_ok=1 THEN 1 ELSE 0 END) AS ok_cnt,
      SUM(CASE WHEN coa_ok IS NULL THEN 0 ELSE 1 END) AS tot_cnt
    FROM (
      SELECT coa_ok FROM health_samples ORDER BY id DESC LIMIT :lim
    ) t");
  $st->bindValue(':lim', $window, PDO::PARAM_INT);
  $st->execute();
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  $tot = (int)($row['tot_cnt'] ?? 0);
  if ($tot <= 0) return null;
  $ok = (int)($row['ok_cnt'] ?? 0);
  return round(($ok / $tot) * 100, 1);
}

function health_uptime_ratio(PDO $pdo, int $hours=24): ?float {
  health_bootstrap($pdo);
  $st = $pdo->prepare("SELECT
      SUM(CASE WHEN overall_ok=1 THEN 1 ELSE 0 END) AS ok_cnt,
      COUNT(*) AS tot_cnt
    FROM health_samples
    WHERE ts >= (NOW() - INTERVAL :h HOUR)");
  $st->bindValue(':h', $hours, PDO::PARAM_INT);
  $st->execute();
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  $tot = (int)($row['tot_cnt'] ?? 0);
  if ($tot <= 0) return null;
  $ok = (int)($row['ok_cnt'] ?? 0);
  return round(($ok / $tot) * 100, 2);
}
