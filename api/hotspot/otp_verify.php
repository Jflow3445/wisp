<?php
declare(strict_types=1);

require_once __DIR__.'/_paylib.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
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
  echo json_encode(['ok'=>false, 'error'=>'server_error', 'detail'=>$e->getMessage()], JSON_UNESCAPED_SLASHES);
}
