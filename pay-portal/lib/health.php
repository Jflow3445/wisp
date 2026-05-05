<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
require_once __DIR__.'/alerts.php';

function health_pdo(array $env): PDO {
  $dsn = (string)($env['HEALTH_DB_DSN'] ?? '');
  $user = (string)($env['HEALTH_DB_USER'] ?? '');
  $pass = (string)($env['HEALTH_DB_PASS'] ?? '');
  if ($dsn !== '' && $user !== '') {
    return new NisterPDO($dsn, $user, $pass, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
      PDO::ATTR_STRINGIFY_FETCHES  => false,
    ]);
  }
  return db_pdo($env);
}

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

function health_coa_success_stats(PDO $pdo, int $window=120): array {
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
  $ok = (int)($row['ok_cnt'] ?? 0);
  $tot = (int)($row['tot_cnt'] ?? 0);
  $rate = null;
  if ($tot > 0) {
    $rate = round(($ok / $tot) * 100, 1);
  }
  return [
    'ok' => $ok,
    'total' => $tot,
    'rate' => $rate,
    'window' => $window,
  ];
}

function health_coa_success_rate(PDO $pdo, int $window=120): ?float {
  $stats = health_coa_success_stats($pdo, $window);
  return (is_array($stats) && array_key_exists('rate', $stats)) ? $stats['rate'] : null;
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

function health_table_exists(PDO $pdo, string $table): bool {
  $qt = $pdo->quote($table);
  $st = $pdo->query("SHOW TABLES LIKE {$qt}");
  return (bool)$st->fetchColumn();
}

function health_column_exists(PDO $pdo, string $table, string $col): bool {
  $qc = $pdo->quote($col);
  $st = $pdo->query("SHOW COLUMNS FROM {$table} LIKE {$qc}");
  return (bool)$st->fetchColumn();
}

function health_rdb_or_fallback(PDO $fallback): PDO {
  static $rdb = null;
  if ($rdb instanceof PDO) {
    return $rdb;
  }
  if (!function_exists('rdb_pdo')) {
    $radiusLib = __DIR__.'/radius.php';
    if (is_file($radiusLib)) {
      require_once $radiusLib;
    }
  }
  if (function_exists('rdb_pdo')) {
    try {
      $rdb = rdb_pdo();
      return $rdb;
    } catch (Throwable $e) {
      // Fall back to supplied PDO when RADIUS DB is unavailable.
    }
  }
  $rdb = $fallback;
  return $rdb;
}

function health_enforcement_snapshot(PDO $pdo): array {
  health_bootstrap($pdo);

  $out = [
    'open_sessions_total' => null,
    'open_sessions_recent_15m' => null,
    'open_sessions_stale_15m' => null,
    'open_sessions_stale_60m' => null,
    'active_recent_hs_sessions_15m' => null,
    'acct_last_update_utc' => null,
    'acct_last_update_age_sec' => null,
    'limit_events_15m' => 0,
    'limit_events_60m' => 0,
    'coa_fail_events_60m' => 0,
    'coa_retry_events_60m' => 0,
    'coa_probe_ok_15m' => 0,
    'coa_probe_total_15m' => 0,
    'coa_probe_ok_120' => 0,
    'coa_probe_total_120' => 0,
  ];

  $rdb = health_rdb_or_fallback($pdo);
  if (health_table_exists($rdb, 'radacct')) {
    $strictOpenWhere = "(acctstoptime IS NULL OR acctstoptime='0000-00-00 00:00:00')";
    $recentExpr = health_column_exists($rdb, 'radacct', 'acctupdatetime')
      ? 'COALESCE(acctupdatetime, acctstarttime)'
      : 'acctstarttime';
    $reopenedRecentExpr = "(acctstoptime IS NOT NULL AND acctstoptime<>'0000-00-00 00:00:00' AND {$recentExpr} > acctstoptime AND {$recentExpr} >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))";
    $openWhere = "(($strictOpenWhere) OR ($reopenedRecentExpr))";

    $q = $rdb->query("SELECT
        COUNT(*) AS open_total,
        SUM(CASE WHEN {$recentExpr} >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END) AS open_recent_15m,
        SUM(CASE WHEN {$recentExpr} < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END) AS open_stale_15m,
        SUM(CASE WHEN {$recentExpr} < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS open_stale_60m,
        DATE_FORMAT(MAX({$recentExpr}), '%Y-%m-%d %H:%i:%s') AS last_update_utc,
        COALESCE(TIMESTAMPDIFF(SECOND, MAX({$recentExpr}), UTC_TIMESTAMP()), 0) AS last_update_age_sec
      FROM radacct
      WHERE {$openWhere}");
    $row = $q->fetch(PDO::FETCH_ASSOC) ?: [];

    $out['open_sessions_total'] = (int)($row['open_total'] ?? 0);
    $out['open_sessions_recent_15m'] = (int)($row['open_recent_15m'] ?? 0);
    $out['open_sessions_stale_15m'] = (int)($row['open_stale_15m'] ?? 0);
    $out['open_sessions_stale_60m'] = (int)($row['open_stale_60m'] ?? 0);
    $out['acct_last_update_utc'] = ($row['last_update_utc'] ?? null) ?: null;
    $out['acct_last_update_age_sec'] = isset($row['last_update_age_sec']) ? (int)$row['last_update_age_sec'] : null;

    if (health_table_exists($rdb, 'radusergroup')) {
      $q2 = $rdb->query("
        SELECT COUNT(DISTINCT CONCAT(
          CASE
            WHEN ra.username REGEXP '^233[0-9]{9}$' THEN ra.username
            WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
            ELSE ra.username
          END,
          '|',
          COALESCE(NULLIF(ra.callingstationid,''), NULLIF(ra.acctsessionid,''), NULLIF(ra.framedipaddress,''), CAST(ra.radacctid AS CHAR))
        )) AS c
        FROM radacct ra
        WHERE (
            (ra.acctstoptime IS NULL OR ra.acctstoptime='0000-00-00 00:00:00')
            OR (
              ra.acctstoptime IS NOT NULL
              AND ra.acctstoptime<>'0000-00-00 00:00:00'
              AND COALESCE(ra.acctupdatetime, ra.acctstarttime) > ra.acctstoptime
              AND COALESCE(ra.acctupdatetime, ra.acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
            )
          )
          AND COALESCE(ra.acctupdatetime, ra.acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
          AND EXISTS (
            SELECT 1
            FROM radusergroup rug
            WHERE rug.groupname='HS_ACTIVE'
              AND rug.username IN (
                ra.username,
                CASE
                  WHEN ra.username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTRING(ra.username,4))
                  WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
                  ELSE ra.username
                END,
                CASE
                  WHEN ra.username REGEXP '^233[0-9]{9}$' THEN ra.username
                  WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
                  ELSE ra.username
                END
              )
          )");
      $out['active_recent_hs_sessions_15m'] = (int)($q2->fetchColumn() ?: 0);
    }
  }

  if (health_table_exists($pdo, 'admin_alerts')) {
    $q3 = $pdo->query("SELECT
        SUM(CASE WHEN type='limit' AND COALESCE(ts, created_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END) AS limit_15m,
        SUM(CASE WHEN type='limit' AND COALESCE(ts, created_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS limit_60m,
        SUM(CASE WHEN type='coa_fail' AND COALESCE(ts, created_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS coa_fail_60m,
        SUM(CASE WHEN type='coa_retry' AND COALESCE(ts, created_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS coa_retry_60m
      FROM admin_alerts");
    $r3 = $q3->fetch(PDO::FETCH_ASSOC) ?: [];
    $out['limit_events_15m'] = (int)($r3['limit_15m'] ?? 0);
    $out['limit_events_60m'] = (int)($r3['limit_60m'] ?? 0);
    $out['coa_fail_events_60m'] = (int)($r3['coa_fail_60m'] ?? 0);
    $out['coa_retry_events_60m'] = (int)($r3['coa_retry_60m'] ?? 0);
  }

  $q4 = $pdo->query("SELECT
      SUM(CASE WHEN coa_ok=1 AND ts >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END) AS ok_15m,
      SUM(CASE WHEN coa_ok IS NOT NULL AND ts >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) THEN 1 ELSE 0 END) AS tot_15m
    FROM health_samples");
  $r4 = $q4->fetch(PDO::FETCH_ASSOC) ?: [];
  $out['coa_probe_ok_15m'] = (int)($r4['ok_15m'] ?? 0);
  $out['coa_probe_total_15m'] = (int)($r4['tot_15m'] ?? 0);

  $q5 = $pdo->query("SELECT
      SUM(CASE WHEN coa_ok=1 THEN 1 ELSE 0 END) AS ok_120,
      SUM(CASE WHEN coa_ok IS NULL THEN 0 ELSE 1 END) AS tot_120
    FROM (
      SELECT coa_ok
      FROM health_samples
      ORDER BY id DESC
      LIMIT 120
    ) t");
  $r5 = $q5->fetch(PDO::FETCH_ASSOC) ?: [];
  $out['coa_probe_ok_120'] = (int)($r5['ok_120'] ?? 0);
  $out['coa_probe_total_120'] = (int)($r5['tot_120'] ?? 0);

  return $out;
}
