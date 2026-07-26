<?php
declare(strict_types=1);

require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/settings.php';
require_once __DIR__.'/../lib/wallet.php';
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/plans_radius.php';
require_once __DIR__.'/../lib/referrals.php';
require_once __DIR__.'/../lib/auto_renew.php';
require_once __DIR__.'/../lib/transaction_safety.php';
require_once __DIR__.'/../lib/sms.php';
require_once __DIR__.'/../lib/location.php';

$ENV = app_boot();
nister_require_cli_or_token($ENV);
auto_renew_bootstrap();

$limit = isset($argv[1]) && is_numeric($argv[1]) ? (int)$argv[1] : 200;
$limit = max(1, min(2000, $limit));
$attemptCooldownMin = isset($argv[2]) && is_numeric($argv[2]) ? (int)$argv[2] : 10;
$attemptCooldownMin = max(1, min(1440, $attemptCooldownMin));

function table_exists(PDO $pdo, string $table): bool {
  $qt = $pdo->quote($table);
  $st = $pdo->query("SHOW TABLES LIKE {$qt}");
  return (bool)$st->fetchColumn();
}

function column_exists(PDO $pdo, string $table, string $column): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
  );
  $st->execute([':t'=>$table, ':c'=>$column]);
  return (bool)$st->fetchColumn();
}

function fetch_thresholds(): array {
  $pct = (int)(settings_get('SMS_QUOTA_WARN_PCT', '10') ?? 10);
  $mb  = (int)(settings_get('SMS_QUOTA_WARN_MB', '200') ?? 200);
  $hrs = (int)(settings_get('SMS_EXPIRY_WARN_HOURS', '24') ?? 24);
  if ($pct < 1) $pct = 1; if ($pct > 95) $pct = 95;
  if ($mb < 1) $mb = 1;
  if ($hrs < 1) $hrs = 1; if ($hrs > 720) $hrs = 720;
  return ['remain_pct'=>$pct, 'remain_mb'=>$mb, 'expiry_hours'=>$hrs];
}

function near_exhaustion(int $quotaBytes, int $usedBytes, int $warnPct, int $warnMb): bool {
  if ($quotaBytes <= 0) return false;
  $remain = $quotaBytes - $usedBytes;
  if ($remain < 0) $remain = 0;
  $remainPct = (int)floor(($remain / $quotaBytes) * 100);
  $remainMb = (int)floor($remain / (1024 * 1024));
  return ($remainPct <= $warnPct) || ($remainMb <= $warnMb);
}

function parse_dt(?string $raw, DateTimeZone $tz): ?DateTimeImmutable {
  $v = trim((string)$raw);
  if ($v === '') return null;
  try {
    return new DateTimeImmutable($v, $tz);
  } catch (Throwable $e) {
    return null;
  }
}

function auto_renew_lock_name(string $msisdn): string {
  return 'auto_renew:'.substr(sha1($msisdn), 0, 40);
}

function auto_renew_try_lock(PDO $pdo, string $msisdn, int $timeoutSec=0): bool {
  $timeoutSec = max(0, min(30, $timeoutSec));
  try {
    $st = $pdo->prepare("SELECT GET_LOCK(:k, :t)");
    $st->execute([':k'=>auto_renew_lock_name($msisdn), ':t'=>$timeoutSec]);
    return ((int)($st->fetchColumn() ?: 0)) === 1;
  } catch (Throwable $e) {
    // If named locks are unavailable, continue without lock.
    return true;
  }
}

function auto_renew_release_lock(PDO $pdo, string $msisdn): void {
  try {
    $st = $pdo->prepare("SELECT RELEASE_LOCK(:k)");
    $st->execute([':k'=>auto_renew_lock_name($msisdn)]);
  } catch (Throwable $e) { /* ignore */ }
}

function auto_renew_min_gap_seconds(array $plan, array $thresholds): int {
  $days = (int)($plan['duration_days'] ?? 30);
  if ($days <= 0) $days = 30;
  $durationSecs = max(3600, $days * 86400);
  $leadSecs = max(3600, (int)($thresholds['expiry_hours'] ?? 24) * 3600);
  return max(3600, min($durationSecs, $leadSecs));
}

function recent_purchase_exists(PDO $pdo, string $msisdn, string $planCode, int $minutes, ?int $locationId = null): bool {
  if (!table_exists($pdo, 'purchases')) return false;
  $mins = max(1, min(1440, $minutes));
  $hasLocation = column_exists($pdo, 'purchases', 'location_id');
  if ($hasLocation && $locationId !== null && $locationId > 0) {
    $st = $pdo->prepare(
      "SELECT id FROM purchases
       WHERE msisdn=:m AND location_id=:l AND plan_code=:c
         AND created_at >= (NOW() - INTERVAL {$mins} MINUTE)
         AND status IN ('pending','applied')
       ORDER BY id DESC LIMIT 1"
    );
    $st->execute([':m'=>$msisdn, ':l'=>$locationId, ':c'=>$planCode]);
  } else {
    $st = $pdo->prepare(
      "SELECT id FROM purchases
       WHERE msisdn=:m AND plan_code=:c
         AND created_at >= (NOW() - INTERVAL {$mins} MINUTE)
         AND status IN ('pending','applied')
       ORDER BY id DESC LIMIT 1"
    );
    $st->execute([':m'=>$msisdn, ':c'=>$planCode]);
  }
  return (bool)$st->fetchColumn();
}

function auto_renew_purchase(string $msisdn, array $plan, DateTimeImmutable $purchaseAt, ?int $locationId = null): array {
  global $PDO, $ENV;

  $price = (int)($plan['price_cents'] ?? 0);
  if ($price <= 0) return ['ok'=>false,'error'=>'invalid_price'];
  $code = (string)($plan['code'] ?? '');
  if ($code === '') return ['ok'=>false,'error'=>'invalid_plan'];

  if (recent_purchase_exists($PDO, $msisdn, $code, 120, $locationId)) {
    return ['ok'=>false,'error'=>'recent_purchase'];
  }

  $ref = 'AUTO-RENEW-'.date('YmdHis').'-'.bin2hex(random_bytes(3));

  try {
    $debited = wallet_try_debit($msisdn, $price, $ref, 'Auto-renew '.$code);
  } catch (Throwable $e) {
    if ($e->getMessage() === 'wallet_tables_missing') {
      return ['ok'=>false,'error'=>'wallet_unavailable'];
    }
    return ['ok'=>false,'error'=>'wallet_debit_failed','detail'=>$e->getMessage()];
  }
  if (!$debited) return ['ok'=>false,'error'=>'insufficient_funds'];

  $pid = null;
  $planApplied = false;
  try {
    if (table_exists($PDO, 'purchases')) {
      if (column_exists($PDO, 'purchases', 'location_id') && $locationId !== null && $locationId > 0) {
        $PDO->prepare("INSERT INTO purchases(msisdn,location_id,plan_code,price_cents,status)
                       VALUES(:m,:l,:c,:p,'pending')")
            ->execute([':m'=>$msisdn, ':l'=>$locationId, ':c'=>$code, ':p'=>$price]);
      } else {
        $PDO->prepare("INSERT INTO purchases(msisdn,plan_code,price_cents,status)
                       VALUES(:m,:c,:p,'pending')")
            ->execute([':m'=>$msisdn, ':c'=>$code, ':p'=>$price]);
      }
      $pid = (int)$PDO->lastInsertId();
    }

    $days = (int)($plan['duration_days'] ?? 30);
    if ($days <= 0) $days = 30;
    $renewAddr = trim((string)($plan['address_list'] ?? 'HS_ACTIVE'));
    $renewAddrUp = strtoupper($renewAddr);
    if ($renewAddr === '' || in_array($renewAddrUp, ['HS_LIMITED','HS_NOPAID'], true)) {
      $renewAddr = 'HS_ACTIVE';
    }
    $applyPlan = [
      'code' => $code,
      'address_list' => $renewAddr,
      'rate_limit' => $plan['rate_limit'] ?? null,
      'quota_bytes' => $plan['quota_bytes'] ?? null,
      'duration_days' => $days,
      'strict_quota' => true,
    ];

    radius_apply_plan($msisdn, $applyPlan, $purchaseAt);
    $planApplied = true;

    // Ensure renewal immediately restores browse policy, even if user was previously limited.
    try {
      $r = rdb_pdo();
      foreach (nister_username_variants($msisdn) as $u) {
        if ($u === '') continue;
        $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_LIMITED','HS_NOPAID','nopaid')")
          ->execute([':u'=>$u]);
        $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                     SELECT :u, 'HS_ACTIVE', 0 FROM DUAL
                     WHERE NOT EXISTS (
                       SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_ACTIVE'
                     )")->execute([':u'=>$u]);
        radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', $renewAddr);
      }
    } catch (Throwable $e) { /* ignore */ }

    if (function_exists('radius_try_disconnect')) {
      try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : [], $locationId); } catch (Throwable $e) { /* ignore */ }
    }

    $actualExpires = $purchaseAt->modify('+'.$days.' days');
    try {
      $active = radius_get_active_plan($msisdn);
      if ($active && !empty($active['expires_at'])) {
        $tz = new DateTimeZone(date_default_timezone_get());
        $dt = nister_parse_expiry_datetime((string)$active['expires_at'], $tz);
        if ($dt instanceof DateTimeImmutable) $actualExpires = $dt;
      }
    } catch (Throwable $e) { /* keep computed expiry */ }

    $expiresStr = $actualExpires->format('Y-m-d H:i:s');
    if ($pid) {
      $PDO->prepare("UPDATE purchases SET status='applied', activated_at=NOW(), expires_at=:e WHERE id=:id")
          ->execute([':e'=>$expiresStr, ':id'=>$pid]);
    }

    try {
      referrals_create_reward_for_purchase((int)$pid, $msisdn, (int)$price, $purchaseAt);
    } catch (Throwable $e) { /* ignore */ }

    try {
      referrals_release_pending_for_referrer($msisdn, 200);
    } catch (Throwable $e) { /* ignore */ }

    try {
      $tpl = trim((string)(sms_setting('SMS_PURCHASE_CONFIRM_TEXT', '') ?? ''));
      if ($tpl !== '') {
        $loginUrl = trim((string)(sms_setting('SMS_LOGIN_URL', '') ?? ''));
        $msg = sms_template($tpl, [
          'NAME' => '',
          'MSISDN' => sms_normalize_local($msisdn),
          'PLAN' => (string)($plan['name'] ?? $code),
          'EXPIRES_AT' => $expiresStr,
          'REF' => $ref,
          'AMOUNT_GHS' => number_format($price / 100, 2),
          'LOGIN_URL' => $loginUrl,
        ]);
        sms_send($msisdn, $msg);
      }

      $tpl2 = trim((string)(sms_setting('SMS_BACK_ONLINE_TEXT', '') ?? ''));
      if ($tpl2 !== '') {
        $msg2 = sms_template($tpl2, [
          'NAME' => '',
          'MSISDN' => sms_normalize_local($msisdn),
          'PLAN' => (string)($plan['name'] ?? $code),
          'EXPIRES_AT' => $expiresStr,
        ]);
        sms_send($msisdn, $msg2);
      }
    } catch (Throwable $e) { /* ignore */ }

    return ['ok'=>true,'purchase_id'=>$pid,'expires_at'=>$expiresStr,'ref'=>$ref];
  } catch (Throwable $e) {
    $resolution = nister_apply_failure_resolution($planApplied);
    $refundErr = null;
    if (!empty($resolution['should_refund'])) {
      try {
        wallet_credit($msisdn, $price, $ref.'-REFUND', 'Auto-refund: auto-renew failed');
      } catch (Throwable $re) {
        $refundErr = $re->getMessage();
        error_log('[cron/auto_renew.php] refund_failed msisdn=' . $msisdn . ' ref=' . $ref . ' err=' . $refundErr);
      }
    }
    if ($pid) {
      $PDO->prepare("UPDATE purchases SET status=:s WHERE id=:id")
        ->execute([':s'=>(string)($resolution['purchase_status'] ?? 'failed'), ':id'=>$pid]);
    }
    if ($refundErr !== null) {
      return ['ok'=>false,'error'=>'apply_failed','detail'=>'refund_manual_check_required'];
    }
    return [
      'ok'=>false,
      'error'=>(string)($resolution['error'] ?? 'apply_failed'),
      'detail'=>$e->getMessage(),
    ];
  }
}

$tz = new DateTimeZone(date_default_timezone_get());
$now = new DateTimeImmutable('now', $tz);
$thresholds = fetch_thresholds();

$autoRenewLocationSelect = column_exists($PDO, 'auto_renew_settings', 'location_id')
  ? 'location_id'
  : 'NULL AS location_id';
$st = $PDO->prepare(
  "SELECT msisdn, {$autoRenewLocationSelect}, plan_code, enabled, last_attempt_at, last_renew_at, last_error
   FROM auto_renew_settings
   WHERE enabled=1
   ORDER BY updated_at ASC
   LIMIT {$limit}"
);
$st->execute();
$rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

$summary = [
  'processed' => 0,
  'renewed' => 0,
  'skipped' => 0,
  'errors' => 0,
];
$details = [];

foreach ($rows as $row) {
  $summary['processed']++;
  $msisdn = normalize_msisdn((string)($row['msisdn'] ?? ''));
  $locationId = (int)($row['location_id'] ?? 0);
  if ($locationId <= 0) $locationId = location_default_id();
  if ($msisdn === '') {
    $summary['errors']++;
    continue;
  }

  $lockHeld = false;
  try {
    $lockHeld = auto_renew_try_lock($PDO, $msisdn, 0);
    if (!$lockHeld) {
      $summary['skipped']++;
      $details[] = ['msisdn'=>$msisdn,'skipped'=>'lock_busy'];
      continue;
    }

    $lastAttempt = parse_dt((string)($row['last_attempt_at'] ?? ''), $tz);
    if ($lastAttempt instanceof DateTimeImmutable) {
      $diff = $now->getTimestamp() - $lastAttempt->getTimestamp();
      if ($diff >= 0 && $diff < ($attemptCooldownMin * 60)) {
        $summary['skipped']++;
        continue;
      }
    }

    $lastRenew = parse_dt((string)($row['last_renew_at'] ?? ''), $tz);

    $planCode = trim((string)($row['plan_code'] ?? ''));
    $activePlan = null;
    try { $activePlan = radius_get_active_plan($msisdn); } catch (Throwable $e) { $activePlan = null; }
    if ($planCode === '' && $activePlan) $planCode = (string)($activePlan['plan_code'] ?? '');
    if ($planCode === '') {
      auto_renew_mark_attempt($msisdn, 'plan_missing');
      $summary['errors']++;
      continue;
    }

    $plan = radius_find_plan($planCode, $locationId, true);
    $planSource = 'location';
    if ($plan && !radius_plan_is_active($plan)) {
      auto_renew_mark_attempt($msisdn, 'plan_inactive');
      $summary['errors']++;
      continue;
    }
    if (!$plan) {
      // Hotfix: keep legacy renewals alive during location rollout.
      // If site catalog is missing, fall back to global plan definition
      // so paid users do not lapse into router auth rejects on expiration.
      $plan = radius_find_plan($planCode, $locationId, false);
      if ($plan) {
        $planSource = 'global_fallback';
      }
    }
    if (!$plan) {
      auto_renew_mark_attempt($msisdn, 'plan_invalid');
      $summary['errors']++;
      continue;
    }
    if (!radius_plan_is_active($plan)) {
      auto_renew_mark_attempt($msisdn, 'plan_inactive');
      $summary['errors']++;
      continue;
    }

    $status = [];
    try { $status = radius_user_status($msisdn); } catch (Throwable $e) { $status = []; }

    $expiryDt = null;
    if ($activePlan && !empty($activePlan['expires_at'])) {
      $expiryDt = nister_parse_expiry_datetime((string)$activePlan['expires_at'], $tz);
    }
    $nearExpiry = false;
    if ($expiryDt instanceof DateTimeImmutable) {
      $secsLeft = $expiryDt->getTimestamp() - $now->getTimestamp();
      if ($secsLeft <= ($thresholds['expiry_hours'] * 3600)) $nearExpiry = true;
    }

    $quota = (int)($status['quota_bytes'] ?? 0);
    $used  = (int)($status['used_bytes'] ?? 0);
    $nearExhaust = near_exhaustion($quota, $used, $thresholds['remain_pct'], $thresholds['remain_mb']);

    $expired = (bool)($status['expired'] ?? false);
    $exhausted = (bool)($status['exhausted'] ?? false);

    $shouldRenew = $nearExpiry || $nearExhaust || $expired || $exhausted;
    if (!$shouldRenew) {
      $summary['skipped']++;
      continue;
    }

    // Avoid duplicate top-ups when a user is already in the near-expiry window.
    if (!$expired && !$exhausted && $lastRenew instanceof DateTimeImmutable) {
      $minGap = auto_renew_min_gap_seconds($plan, $thresholds);
      $since = $now->getTimestamp() - $lastRenew->getTimestamp();
      if ($since >= 0 && $since < $minGap) {
        $summary['skipped']++;
        $details[] = ['msisdn'=>$msisdn,'skipped'=>'recent_renew'];
        continue;
      }
    }

    $price = (int)($plan['price_cents'] ?? 0);
    if ($price <= 0) {
      auto_renew_mark_attempt($msisdn, 'invalid_price');
      $summary['errors']++;
      continue;
    }

    try {
      $bal = wallet_balance($msisdn);
    } catch (Throwable $e) {
      auto_renew_mark_attempt($msisdn, 'wallet_unavailable');
      $summary['errors']++;
      continue;
    }

    if ($bal < $price) {
      auto_renew_mark_attempt($msisdn, 'insufficient_funds');
      $summary['errors']++;
      continue;
    }

    $res = auto_renew_purchase($msisdn, $plan, $now, $locationId);
    if (!($res['ok'] ?? false)) {
      auto_renew_mark_attempt($msisdn, (string)($res['error'] ?? 'renew_failed'));
      $summary['errors']++;
      $details[] = ['msisdn'=>$msisdn,'error'=>$res['error'] ?? 'renew_failed'];
      continue;
    }

    auto_renew_mark_success($msisdn);
    $summary['renewed']++;
    $details[] = [
      'msisdn'=>$msisdn,
      'purchase_id'=>$res['purchase_id'] ?? null,
      'plan_source'=>$planSource,
    ];
  } finally {
    if ($lockHeld) {
      try { auto_renew_release_lock($PDO, $msisdn); } catch (Throwable $e) { /* ignore */ }
    }
  }
}

$out = [
  'ok' => true,
  'ts' => $now->format('Y-m-d H:i:s'),
  'result' => $summary,
  'details' => $details,
];

echo json_encode($out, JSON_UNESCAPED_SLASHES), PHP_EOL;
