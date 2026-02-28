<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/referrals.php';

$ENV = app_boot();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');

function json_out_simple(array $data, int $code=200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  exit;
}

$raw = (string)($_GET['username'] ?? $_GET['user'] ?? $_GET['msisdn'] ?? '');
if (trim($raw) === '') json_out_simple(['ok'=>false,'error'=>'username required'], 400);

$msisdn = normalize_msisdn($raw);
if ($msisdn === '') json_out_simple(['ok'=>false,'error'=>'invalid_username'], 400);

$diag = isset($_GET['diag']) && $_GET['diag'] !== '0';
$tz = new DateTimeZone(date_default_timezone_get());
$now = new DateTimeImmutable('now', $tz);

try {
  $status = radius_user_status($msisdn);
  $plan = radius_get_active_plan($msisdn) ?: [];

  $group = $plan['plan_code'] ?? ($status['group'] ?? null);
  $planName = $plan['display_name'] ?? $plan['name'] ?? $group ?? null;
  $rate = $plan['rate_limit'] ?? null;
  $addrlist = $status['addrlist'] ?? ($plan['address_list'] ?? null);

  $expiryStr = $status['expires_at'] ?? ($plan['expires_at'] ?? null);
  $expiryDt = null;
  if ($expiryStr) {
    $expiryDt = DateTimeImmutable::createFromFormat('d M Y H:i:s', $expiryStr, $tz)
      ?: DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $expiryStr, $tz)
      ?: new DateTimeImmutable($expiryStr, $tz);
  }

  $periodStart = null;
  try {
    $r = rdb_pdo();
    $targets = nister_username_variants($msisdn);
    if ($targets) {
      $ph = implode(",", array_fill(0, count($targets), "?"));
      $st = $r->prepare("SELECT value FROM radreply WHERE username IN ($ph) AND attribute='Nister-Window-Start' ORDER BY value DESC LIMIT 1");
      $st->execute($targets);
      $periodStart = (string)($st->fetchColumn() ?: '');
    }
  } catch (Throwable $e) {
    $periodStart = '';
  }

  if (!$periodStart && $expiryDt instanceof DateTimeImmutable) {
    $days = (int)($plan['duration_days'] ?? 30);
    if ($days <= 0) $days = 30;
    $periodStart = $expiryDt->modify("-{$days} days")->format('Y-m-d H:i:s');
  }

  $expUtc = $expiryDt ? (clone $expiryDt)->setTimezone(new DateTimeZone('UTC')) : null;
  $expStrUtc = $expUtc ? $expUtc->format('Y-m-d H:i:s') . ' GMT' : null;
  $periodUtc = null;
  if ($periodStart) {
    try {
      $pdt = new DateTimeImmutable($periodStart, $tz);
      $periodUtc = $pdt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s') . ' GMT';
    } catch (Throwable $e) { $periodUtc = $periodStart; }
  }

  $state = $status['paid'] ? 'PAID' : 'NOPAID';
  $referral = [
    'invite_code'=>null,
    'pending_cents'=>0,
    'released_cents_month'=>0,
    'released_cents_lifetime'=>0,
  ];
  try { $referral = referrals_user_summary($msisdn); } catch (Throwable $e) { /* keep defaults */ }
  $out = [
    'ok' => true,
    'version' => '2026-02-28a',
    'username' => $raw,
    'state' => $state,
    'can_browse' => (bool)($status['can_browse'] ?? false),
    'plan_name' => $planName,
    'group' => $group,
    'rate' => $rate,
    'addrlist' => $addrlist,
    'quota_bytes' => $status['quota_bytes'] ?? null,
    'used_bytes' => $status['used_bytes'] ?? null,
    'period_start_str' => $periodUtc,
    'expiry_str' => $expStrUtc,
    'referral' => $referral,
  ];

  if ($diag) {
    $out['diag'] = [
      'u1' => nister_username_variants($msisdn)[0] ?? null,
      'u2' => nister_username_variants($msisdn)[1] ?? null,
      'group_resolved' => $group,
      'expiry_raw' => $expiryStr,
      'expired' => (bool)($status['expired'] ?? false),
      'exhausted' => (bool)($status['exhausted'] ?? false),
      'db_cfg_loaded' => true,
      'db_host' => 'radius',
      'time_utc' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('c'),
    ];
  }

  json_out_simple($out);
} catch (Throwable $e) {
  json_out_simple(['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()], 500);
}
