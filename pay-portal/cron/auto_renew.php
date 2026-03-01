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
require_once __DIR__.'/../lib/sms.php';

$ENV = app_boot();
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

function recent_purchase_exists(PDO $pdo, string $msisdn, string $planCode, int $minutes): bool {
  if (!table_exists($pdo, 'purchases')) return false;
  $mins = max(1, min(1440, $minutes));
  $st = $pdo->prepare(
    "SELECT id FROM purchases
     WHERE msisdn=:m AND plan_code=:c
       AND created_at >= (NOW() - INTERVAL {$mins} MINUTE)
       AND status IN ('pending','applied')
     ORDER BY id DESC LIMIT 1"
  );
  $st->execute([':m'=>$msisdn, ':c'=>$planCode]);
  return (bool)$st->fetchColumn();
}

function auto_renew_purchase(string $msisdn, array $plan, DateTimeImmutable $purchaseAt): array {
  global $PDO, $ENV;

  $price = (int)($plan['price_cents'] ?? 0);
  if ($price <= 0) return ['ok'=>false,'error'=>'invalid_price'];
  $code = (string)($plan['code'] ?? '');
  if ($code === '') return ['ok'=>false,'error'=>'invalid_plan'];

  if (recent_purchase_exists($PDO, $msisdn, $code, 120)) {
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
  try {
    if (table_exists($PDO, 'purchases')) {
      $PDO->prepare("INSERT INTO purchases(msisdn,plan_code,price_cents,status)
                     VALUES(:m,:c,:p,'pending')")
          ->execute([':m'=>$msisdn, ':c'=>$code, ':p'=>$price]);
      $pid = (int)$PDO->lastInsertId();
    }

    $days = (int)($plan['duration_days'] ?? 30);
    if ($days <= 0) $days = 30;
    $applyPlan = [
      'code' => $code,
      'address_list' => $plan['address_list'] ?? 'HS_ACTIVE',
      'rate_limit' => $plan['rate_limit'] ?? null,
      'quota_bytes' => $plan['quota_bytes'] ?? null,
      'duration_days' => $days,
    ];

    radius_apply_plan($msisdn, $applyPlan, $purchaseAt);

    if (function_exists('radius_try_disconnect')) {
      try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
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
        if ($loginUrl === '') $loginUrl = 'http://wifi.nister.org/login.html';
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
    wallet_credit($msisdn, $price, $ref.'-REFUND', 'Auto-refund: auto-renew failed');
    if ($pid) {
      $PDO->prepare("UPDATE purchases SET status='failed' WHERE id=:id")->execute([':id'=>$pid]);
    }
    return ['ok'=>false,'error'=>'apply_failed','detail'=>$e->getMessage()];
  }
}

$tz = new DateTimeZone(date_default_timezone_get());
$now = new DateTimeImmutable('now', $tz);
$thresholds = fetch_thresholds();

$st = $PDO->prepare(
  "SELECT msisdn, plan_code, enabled, last_attempt_at, last_renew_at, last_error
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
  if ($msisdn === '') {
    $summary['errors']++;
    continue;
  }

  $lastAttempt = null;
  if (!empty($row['last_attempt_at'])) {
    try { $lastAttempt = new DateTimeImmutable((string)$row['last_attempt_at'], $tz); } catch (Throwable $e) { $lastAttempt = null; }
  }
  if ($lastAttempt instanceof DateTimeImmutable) {
    $diff = $now->getTimestamp() - $lastAttempt->getTimestamp();
    if ($diff >= 0 && $diff < ($attemptCooldownMin * 60)) {
      $summary['skipped']++;
      continue;
    }
  }

  $planCode = trim((string)($row['plan_code'] ?? ''));
  $activePlan = null;
  try { $activePlan = radius_get_active_plan($msisdn); } catch (Throwable $e) { $activePlan = null; }
  if ($planCode === '' && $activePlan) $planCode = (string)($activePlan['plan_code'] ?? '');
  if ($planCode === '') {
    auto_renew_mark_attempt($msisdn, 'plan_missing');
    $summary['errors']++;
    continue;
  }

  $plan = radius_find_plan($planCode);
  if (!$plan) {
    auto_renew_mark_attempt($msisdn, 'plan_invalid');
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

  $res = auto_renew_purchase($msisdn, $plan, $now);
  if (!($res['ok'] ?? false)) {
    auto_renew_mark_attempt($msisdn, (string)($res['error'] ?? 'renew_failed'));
    $summary['errors']++;
    $details[] = ['msisdn'=>$msisdn,'error'=>$res['error'] ?? 'renew_failed'];
    continue;
  }

  auto_renew_mark_success($msisdn);
  $summary['renewed']++;
  $details[] = ['msisdn'=>$msisdn,'purchase_id'=>$res['purchase_id'] ?? null];
}

$out = [
  'ok' => true,
  'ts' => $now->format('Y-m-d H:i:s'),
  'result' => $summary,
  'details' => $details,
];

echo json_encode($out, JSON_UNESCAPED_SLASHES), PHP_EOL;
