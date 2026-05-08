<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/referrals.php';

$ENV = app_boot();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Vary: Origin');

function status_origin_allowed(string $origin, array $env): bool {
  $origin = trim($origin);
  if ($origin === '') return false;
  $parts = parse_url($origin);
  if (!is_array($parts)) return false;
  $scheme = strtolower((string)($parts['scheme'] ?? ''));
  $host = strtolower((string)($parts['host'] ?? ''));
  if (!in_array($scheme, ['http', 'https'], true) || $host === '') return false;

  if (preg_match('/(^|\\.)nister\\.org$/', $host) === 1) return true;
  if (in_array($host, ['192.168.88.1', '192.168.80.1', '10.10.20.2'], true)) return true;

  $extra = trim((string)($env['HOTSPOT_STATUS_ALLOWED_ORIGINS'] ?? ''));
  if ($extra === '') return false;
  foreach (preg_split('/[,\s]+/', $extra, -1, PREG_SPLIT_NO_EMPTY) as $item) {
    $item = trim((string)$item);
    if ($item === '') continue;
    if (strpos($item, '://') !== false) {
      $ep = parse_url($item);
      $es = strtolower((string)($ep['scheme'] ?? ''));
      $eh = strtolower((string)($ep['host'] ?? ''));
      if ($es !== '' && $eh !== '' && $es === $scheme && $eh === $host) return true;
      continue;
    }
    if (strtolower($item) === $host) return true;
  }
  return false;
}

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$trustedOrigin = status_origin_allowed($origin, $ENV);
if ($trustedOrigin) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Access-Control-Allow-Methods: GET, OPTIONS');
  header('Access-Control-Allow-Headers: X-Status-Token, Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}
header('Content-Type: application/json; charset=utf-8');

if ($origin !== '' && !$trustedOrigin) {
  json_out_simple(['ok'=>false,'error'=>'forbidden'], 403);
}

function json_out_simple(array $data, int $code=200): void {
  http_response_code($code);
  $json = json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  echo $json;
  exit;
}

$statusToken = trim((string)($ENV['HOTSPOT_STATUS_TOKEN'] ?? getenv('HOTSPOT_STATUS_TOKEN') ?: ''));
if ($statusToken !== '') {
  $provided = trim((string)($_SERVER['HTTP_X_STATUS_TOKEN'] ?? ''));
  $tokenOk = ($provided !== '' && hash_equals($statusToken, $provided));
  $trustedBrowserOrigin = ($origin !== '' && $trustedOrigin);
  if (!$tokenOk && !$trustedBrowserOrigin) {
    json_out_simple(['ok'=>false,'error'=>'forbidden'], 403);
  }
}

$raw = (string)($_GET['username'] ?? $_GET['user'] ?? $_GET['msisdn'] ?? '');
if (trim($raw) === '') json_out_simple(['ok'=>false,'error'=>'username required'], 400);

$msisdn = normalize_msisdn($raw);
if ($msisdn === '') json_out_simple(['ok'=>false,'error'=>'invalid_username'], 400);

$clientIp = nister_client_ip($ENV);
if ($clientIp === '') $clientIp = 'unknown';
$ipGate = nister_rate_limit_hit('hotspot_status_ip', $clientIp, 180, 60, 120);
if (!($ipGate['allowed'] ?? false)) {
  json_out_simple(['ok'=>false,'error'=>'rate_limited'], 429);
}
$userGate = nister_rate_limit_hit('hotspot_status_user', $clientIp . '|' . strtolower($msisdn), 40, 60, 120);
if (!($userGate['allowed'] ?? false)) {
  json_out_simple(['ok'=>false,'error'=>'rate_limited'], 429);
}

$tz = new DateTimeZone(date_default_timezone_get());
$now = new DateTimeImmutable('now', $tz);

try {
  $status = radius_user_status($msisdn);
  $stateRow = null;
  try {
    $stateRow = radius_user_state_exact($msisdn);
  } catch (Throwable $e) {
    $stateRow = null;
  }
  if (is_array($stateRow)) {
    if (!empty($stateRow['expires'])) $status['expires_at'] = (string)$stateRow['expires'];
    if (array_key_exists('quota_bytes', $stateRow)) $status['quota_bytes'] = $stateRow['quota_bytes'];
    if (array_key_exists('used_bytes', $stateRow)) $status['used_bytes'] = (int)($stateRow['used_bytes'] ?? 0);
    $status['expired'] = !empty($stateRow['expired_flag']);
    $status['exhausted'] = !empty($stateRow['exhausted_flag']);
    if (!empty($stateRow['groupname'])) $status['group'] = (string)$stateRow['groupname'];
    $g = strtoupper((string)($status['group'] ?? ''));
    if (in_array($g, ['HS_LIMITED','HS_NOPAID','NOPAID'], true)) {
      $status['policy_limited'] = true;
    }
    $policyLimited = !empty($status['policy_limited']);
    $addr = strtoupper((string)($status['addrlist'] ?? ''));
    $isNoPaid = in_array($g, ['HS_NOPAID','NOPAID'], true) || $addr === 'HS_NOPAID';
    $paid = (bool)($status['paid'] ?? false);
    if ($isNoPaid) $paid = false;
    $status['paid'] = $paid;
    $status['can_browse'] = $paid && !$status['expired'] && !$status['exhausted'] && !$policyLimited;
  }
  $plan = radius_get_active_plan($msisdn) ?: [];
  if (is_array($stateRow)) {
    $rowRate = trim((string)($stateRow['rate_limit'] ?? ''));
    if ($rowRate !== '') {
      if (!is_array($plan)) $plan = [];
      if (empty($plan['rate_limit'])) $plan['rate_limit'] = $rowRate;
    }
  }

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

  $periodStart = '';
  if (is_array($stateRow)) {
    $periodStart = trim((string)($stateRow['window_start'] ?? ''));
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
    'version' => '2026-03-01b',
    'username' => $raw,
    'state' => $state,
    'paid' => (bool)($status['paid'] ?? false),
    'expired' => (bool)($status['expired'] ?? false),
    'exhausted' => (bool)($status['exhausted'] ?? false),
    'policy_limited' => (bool)($status['policy_limited'] ?? false),
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

  json_out_simple($out);
} catch (Throwable $e) {
  json_out_simple(['ok'=>false,'error'=>'server_error'], 500);
}
