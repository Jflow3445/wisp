<?php
declare(strict_types=1);

require_once __DIR__.'/../../pay-portal/lib/referrals.php';
require_once __DIR__.'/../../pay-portal/lib/sms.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
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
$ip = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
if (str_contains($ip, ',')) $ip = trim((string)explode(',', $ip)[0]);
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

try {
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

  $msg = sms_send_templated(
    $username,
    'SMS_SIGNUP_OTP_TEXT',
    'Your NISTER signup code is {OTP}. It expires in {TTL_MIN} minutes.',
    [
      'OTP' => (string)$otp['code'],
      'TTL_MIN' => (string)max(1, (int)ceil(((int)$otp['expires_seconds']) / 60)),
      'MSISDN' => sms_normalize_local($username),
    ]
  );

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
  echo json_encode(['ok'=>false, 'error'=>'server_error', 'detail'=>$e->getMessage()], JSON_UNESCAPED_SLASHES);
}
