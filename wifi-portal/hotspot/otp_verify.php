<?php
declare(strict_types=1);

require_once __DIR__.'/_paylib.php';

function hotspot_allowed_origins(): array {
  $raw = trim((string)(getenv('HOTSPOT_OTP_ALLOWED_ORIGINS') ?: ''));
  if ($raw === '') {
    return ['https://wifi.nister.org', 'https://pay.nister.org'];
  }
  $vals = preg_split('/[,\s]+/', $raw, -1, PREG_SPLIT_NO_EMPTY) ?: [];
  $out = [];
  foreach ($vals as $v) {
    $v = trim((string)$v);
    if ($v !== '') $out[] = $v;
  }
  return array_values(array_unique($out));
}

function hotspot_origin_allowed(string $origin): bool {
  $parts = parse_url($origin);
  if (!is_array($parts)) return false;
  $scheme = strtolower((string)($parts['scheme'] ?? ''));
  $host = strtolower((string)($parts['host'] ?? ''));
  if ($scheme !== 'https') return false;
  if ($host === '') return false;
  $port = isset($parts['port']) ? (int)$parts['port'] : null;
  $originNorm = $scheme . '://' . $host . (($port !== null && $port > 0) ? (':' . $port) : '');
  $allow = hotspot_allowed_origins();
  foreach ($allow as $item) {
    $p = parse_url($item);
    if (!is_array($p)) continue;
    $s = strtolower((string)($p['scheme'] ?? ''));
    $h = strtolower((string)($p['host'] ?? ''));
    if ($s !== 'https' || $h === '') continue;
    $pt = isset($p['port']) ? (int)$p['port'] : null;
    $norm = $s . '://' . $h . (($pt !== null && $pt > 0) ? (':' . $pt) : '');
    if (hash_equals($norm, $originNorm)) return true;
  }
  return false;
}

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$originAllowed = ($origin === '') ? true : hotspot_origin_allowed($origin);
if ($origin !== '' && $originAllowed) {
  header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Vary: Origin');

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
  http_response_code($originAllowed ? 204 : 403);
  exit;
}
if ($origin !== '' && !$originAllowed) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(403);
  echo json_encode(['ok'=>false, 'error'=>'origin_not_allowed'], JSON_UNESCAPED_SLASHES);
  exit;
}

header('Content-Type: application/json; charset=utf-8');

try {
  hotspot_require_paylib('referrals.php');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'server_misconfigured'], JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok'=>false, 'error'=>'method_not_allowed'], JSON_UNESCAPED_SLASHES);
  exit;
}

$in = $_POST;
$raw = file_get_contents('php://input');
if (is_string($raw) && trim($raw) !== '') {
  $j = json_decode($raw, true);
  if (is_array($j)) $in = array_merge($in, $j);
}

$username = (string)($in['username'] ?? $in['msisdn'] ?? $in['user'] ?? '');
$code = (string)($in['code'] ?? $in['otp'] ?? '');

try {
  $res = referrals_otp_verify($username, $code);
  if (!($res['ok'] ?? false)) {
    $err = (string)($res['error'] ?? 'otp_verify_failed');
    $http = 400;
    if (in_array($err, ['otp_locked'], true)) $http = 429;
    http_response_code($http);
    echo json_encode([
      'ok'=>false,
      'error'=>$err,
      'attempts_left'=>(int)($res['attempts_left'] ?? 0),
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  echo json_encode([
    'ok'=>true,
    'signup_token'=>(string)$res['signup_token'],
    'token_expires_seconds'=>(int)$res['token_expires_seconds'],
  ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'server_error'], JSON_UNESCAPED_SLASHES);
}
