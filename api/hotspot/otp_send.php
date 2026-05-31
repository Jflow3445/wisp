<?php
declare(strict_types=1);

require_once __DIR__.'/_paylib.php';
require_once __DIR__.'/_db.php';

function hotspot_allowed_origins(): array {
  $raw = trim((string)(getenv('HOTSPOT_OTP_ALLOWED_ORIGINS') ?: ''));
  if ($raw === '') {
    return [
      'https://wifi.nister.org',
      'http://wifi.nister.org',
      'https://pay.nister.org',
      'http://192.168.88.1',
      'https://192.168.88.1',
      'http://192.168.80.1',
      'https://192.168.80.1',
      'http://10.10.20.2',
      'https://10.10.20.2',
    ];
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
  if (!in_array($scheme, ['http', 'https'], true)) return false;
  if ($host === '') return false;
  $port = isset($parts['port']) ? (int)$parts['port'] : null;
  $originNorm = $scheme . '://' . $host . (($port !== null && $port > 0) ? (':' . $port) : '');
  $allow = hotspot_allowed_origins();
  foreach ($allow as $item) {
    $p = parse_url($item);
    if (!is_array($p)) continue;
    $s = strtolower((string)($p['scheme'] ?? ''));
    $h = strtolower((string)($p['host'] ?? ''));
    if (!in_array($s, ['http', 'https'], true) || $h === '') continue;
    $pt = isset($p['port']) ? (int)$p['port'] : null;
    $norm = $s . '://' . $h . (($pt !== null && $pt > 0) ? (':' . $pt) : '');
    if (hash_equals($norm, $originNorm)) return true;
  }
  return false;
}

function hotspot_client_ip(): string {
  if (function_exists('nister_client_ip')) {
    $env = (isset($GLOBALS['ENV']) && is_array($GLOBALS['ENV'])) ? $GLOBALS['ENV'] : [];
    $trusted = trim((string)nister_client_ip($env));
    if (filter_var($trusted, FILTER_VALIDATE_IP)) return $trusted;
  }

  $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
  if (!filter_var($remote, FILTER_VALIDATE_IP)) return '';
  $trustProxy = filter_var((string)(getenv('HOTSPOT_TRUST_PROXY') ?: ''), FILTER_VALIDATE_BOOLEAN);
  if (!$trustProxy) return $remote;

  $xff = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
  if ($xff === '') return $remote;
  foreach (explode(',', $xff) as $part) {
    $part = trim((string)$part);
    if (filter_var($part, FILTER_VALIDATE_IP)) return $part;
  }
  return $remote;
}

function hotspot_otp_username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [];
  if (preg_match('/^233\d{9}$/', $d)) return array_values(array_unique([$d, '0' . substr($d, 3)]));
  if (preg_match('/^0\d{9}$/', $d)) return array_values(array_unique([$d, '233' . substr($d, 1)]));
  return [$d];
}

function hotspot_otp_account_exists(string $username): bool {
  $variants = hotspot_otp_username_variants($username);
  if (!$variants) return false;
  $pdo = hotspot_radius_pdo();
  $ph = implode(',', array_fill(0, count($variants), '?'));
  $attrs = [
    'Cleartext-Password','Password','Crypt-Password',
    'MD5-Password','SHA-Password','SSHA-Password','SMD5-Password',
    'NT-Password','LM-Password',
  ];
  $aph = implode(',', array_fill(0, count($attrs), '?'));
  $st = $pdo->prepare("SELECT 1 FROM radcheck WHERE username IN ($ph) AND attribute IN ($aph) LIMIT 1");
  $st->execute(array_merge($variants, $attrs));
  return (bool)$st->fetchColumn();
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
  hotspot_require_paylib('sms.php');
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
$purpose = strtolower(trim((string)($in['purpose'] ?? 'signup')));
if (!in_array($purpose, ['signup', 'password_reset'], true)) $purpose = 'signup';
$ip = hotspot_client_ip();
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

try {
  if ($purpose === 'password_reset' && !hotspot_otp_account_exists($username)) {
    http_response_code(404);
    echo json_encode(['ok'=>false, 'error'=>'account_not_found'], JSON_UNESCAPED_SLASHES);
    exit;
  }

  $otp = referrals_otp_send($username, $ip, $ua);
  if (!($otp['ok'] ?? false)) {
    $err = (string)($otp['error'] ?? 'otp_send_failed');
    $code = in_array($err, ['rate_limited','rate_limited_ip','cooldown_active'], true) ? 429 : 400;
    http_response_code($code);
    echo json_encode([
      'ok'=>false,
      'error'=>$err,
      'cooldown_seconds'=>(int)($otp['cooldown_seconds'] ?? 0),
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }

  $ttlMin = (string)max(1, (int)ceil(((int)$otp['expires_seconds']) / 60));
  if ($purpose === 'password_reset') {
    $msg = sms_send_templated(
      $username,
      'SMS_PASSWORD_RESET_OTP_TEXT',
      'Your NISTER password reset code is {OTP}. It expires in {TTL_MIN} minutes.',
      [
        'OTP' => (string)$otp['code'],
        'TTL_MIN' => $ttlMin,
        'MSISDN' => sms_normalize_local($username),
      ]
    );
  } else {
    $msg = sms_send_templated(
      $username,
      'SMS_SIGNUP_OTP_TEXT',
      'Your NISTER signup code is {OTP}. It expires in {TTL_MIN} minutes.',
      [
        'OTP' => (string)$otp['code'],
        'TTL_MIN' => $ttlMin,
        'MSISDN' => sms_normalize_local($username),
      ]
    );
  }

  if (!($msg['sent'] ?? false)) {
    http_response_code(503);
    echo json_encode(['ok'=>false, 'error'=>'sms_send_failed'], JSON_UNESCAPED_SLASHES);
    exit;
  }

  echo json_encode([
    'ok'=>true,
    'cooldown_seconds'=>(int)($otp['cooldown_seconds'] ?? 0),
    'expires_seconds'=>(int)($otp['expires_seconds'] ?? 0),
  ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'server_error'], JSON_UNESCAPED_SLASHES);
}
