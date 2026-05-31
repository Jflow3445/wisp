<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ERROR | E_PARSE);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_paylib.php';

function portal_base_from_link(string $link, string $fallback): string {
  $u = parse_url($link);
  if (!$u || empty($u['scheme']) || empty($u['host'])) return $fallback;
  $scheme = strtolower((string)$u['scheme']);
  $host = strtolower((string)$u['host']);
  $allowed = [
    'wifi.nister.org' => ['https'],
    '192.168.88.1' => ['http', 'https'],
    '192.168.80.1' => ['http', 'https'],
    '10.10.20.2' => ['http', 'https'],
  ];
  if (!isset($allowed[$host]) || !in_array($scheme, $allowed[$host], true)) return $fallback;
  $base = $scheme . '://' . $u['host'];
  if (!empty($u['port'])) $base .= ':' . $u['port'];
  return $base;
}

$defaultLogin = 'https://wifi.nister.org/login';
$linkLoginOnly = (string)($_POST['link_login_only'] ?? $defaultLogin);
$PORTAL_BASE = portal_base_from_link($linkLoginOnly, 'https://wifi.nister.org');
$LOGIN_URL = $PORTAL_BASE . '/login.html';
$RESET_URL = $PORTAL_BASE . '/reset-password.html';

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }

function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [];
  if (preg_match('/^233\d{9}$/', $d)) return array_values(array_unique([$d, '0' . substr($d, 3)]));
  if (preg_match('/^0\d{9}$/', $d))   return array_values(array_unique([$d, '233' . substr($d, 1)]));
  return [$d];
}

function pick(array $src, array $keys): string {
  foreach ($keys as $k) {
    if (isset($src[$k])) {
      $v = trim((string)$src[$k]);
      if ($v !== '') return $v;
    }
  }
  return '';
}

function fail(string $msg, string $user = ''): void {
  http_response_code(400);
  global $RESET_URL;
  $back = $RESET_URL;
  if ($user !== '') $back .= '?username=' . rawurlencode($user);
  echo "<!doctype html><meta charset='utf-8'><title>Password reset failed</title>
  <style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:2rem}
  .card{max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px}
  .err{background:#fee;border:1px solid #f88;padding:12px;border-radius:8px;margin-bottom:16px;color:#900}
  .btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #888;text-decoration:none}
  </style>
  <div class='card'><h2>Could not reset password</h2>
  <div class='err'>".h($msg)."</div>
  <p><a class='btn' href='".h($back)."'>Go back</a></p></div>";
  exit;
}

function reset_rate_limit_path(string $scope, string $key): string {
  $scope = preg_replace('/[^a-z0-9._-]+/i', '_', strtolower(trim($scope))) ?: 'default';
  $dir = rtrim(sys_get_temp_dir(), "/\\") . '/nister-rate-limit';
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  return $dir . '/' . $scope . '-' . hash('sha256', $key) . '.json';
}

function reset_rate_limit_allow(string $scope, string $key, int $maxAttempts, int $windowSec, int $lockoutSec): bool {
  $path = reset_rate_limit_path($scope, $key);
  $raw = @file_get_contents($path);
  $j = is_string($raw) ? json_decode($raw, true) : null;
  $now = time();
  $attempts = [];
  if (is_array($j) && isset($j['attempts']) && is_array($j['attempts'])) {
    foreach ($j['attempts'] as $ts) {
      if ((is_int($ts) || ctype_digit((string)$ts)) && (int)$ts > ($now - $windowSec)) $attempts[] = (int)$ts;
    }
  }
  $lockUntil = (is_array($j) && isset($j['lock_until']) && ctype_digit((string)$j['lock_until'])) ? (int)$j['lock_until'] : 0;
  if ($lockUntil > $now) return false;
  if (count($attempts) >= $maxAttempts) {
    @file_put_contents($path, json_encode(['attempts'=>$attempts, 'lock_until'=>$now + $lockoutSec], JSON_UNESCAPED_SLASHES), LOCK_EX);
    return false;
  }
  return true;
}

function reset_rate_limit_hit(string $scope, string $key, int $maxAttempts, int $windowSec, int $lockoutSec): void {
  $path = reset_rate_limit_path($scope, $key);
  $raw = @file_get_contents($path);
  $j = is_string($raw) ? json_decode($raw, true) : null;
  $now = time();
  $attempts = [];
  if (is_array($j) && isset($j['attempts']) && is_array($j['attempts'])) {
    foreach ($j['attempts'] as $ts) {
      if ((is_int($ts) || ctype_digit((string)$ts)) && (int)$ts > ($now - $windowSec)) $attempts[] = (int)$ts;
    }
  }
  $attempts[] = $now;
  $lockUntil = count($attempts) >= $maxAttempts ? $now + $lockoutSec : 0;
  @file_put_contents($path, json_encode(['attempts'=>$attempts, 'lock_until'=>$lockUntil], JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function reset_rate_limit_clear(string $scope, string $key): void {
  $path = reset_rate_limit_path($scope, $key);
  if (is_file($path)) @unlink($path);
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
  fail('Unsupported request method. Please submit the form again.');
}

$input = $_POST;
$user = pick($input, ['username', 'user', 'login', 'user_name', 'msisdn', 'phone', 'account']);
$pass = pick($input, ['password', 'new_password', 'newpassword', 'password1', 'newpass']);
$pass2 = pick($input, ['password2', 'password_confirm', 'confirm_password', 'new_password2', 'newpass2']);
$otpToken = pick($input, ['otp_token', 'signup_token', 'reset_token', 'token']);
$user = preg_replace('/\s+/', '', $user);

if ($user === '' || $pass === '' || $otpToken === '') {
  fail('Please provide your phone number, verified OTP, and new password.', $user);
}
if ($pass2 !== '' && $pass2 !== $pass) {
  fail('Passwords do not match. Please try again.', $user);
}
if (strlen($pass) < 6) {
  fail('New password must be at least 6 characters.', $user);
}
if (strlen($pass) > 128) {
  fail('New password is too long.', $user);
}

header('Cache-Control: no-store');

$clientIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
if (!filter_var($clientIp, FILTER_VALIDATE_IP)) $clientIp = 'unknown';
$userKey = strtolower($user);
if (!reset_rate_limit_allow('hotspot_reset_password_ip', $clientIp, 12, 600, 900) ||
    !reset_rate_limit_allow('hotspot_reset_password_user', $clientIp . '|' . $userKey, 6, 600, 900)) {
  fail('Too many attempts. Please wait before trying again.', $user);
}

try {
  hotspot_require_paylib('referrals.php');
  $pdo = hotspot_radius_pdo();

  $targets = username_variants($user);
  if (!$targets) fail('Enter a valid phone number.', $user);

  $attrs = [
    'Cleartext-Password','Password','Crypt-Password',
    'MD5-Password','SHA-Password','SSHA-Password','SMD5-Password',
    'NT-Password','LM-Password',
  ];
  $ph = implode(',', array_fill(0, count($targets), '?'));
  $aph = implode(',', array_fill(0, count($attrs), '?'));
  $found = $pdo->prepare("SELECT 1 FROM radcheck WHERE username IN ($ph) AND attribute IN ($aph) LIMIT 1");
  $found->execute(array_merge($targets, $attrs));
  if (!$found->fetchColumn()) {
    reset_rate_limit_hit('hotspot_reset_password_ip', $clientIp, 12, 600, 900);
    reset_rate_limit_hit('hotspot_reset_password_user', $clientIp . '|' . $userKey, 6, 600, 900);
    fail('Account not found for this phone number.', $user);
  }

  if (!referrals_consume_signup_token($user, $otpToken)) {
    reset_rate_limit_hit('hotspot_reset_password_ip', $clientIp, 12, 600, 900);
    reset_rate_limit_hit('hotspot_reset_password_user', $clientIp . '|' . $userKey, 6, 600, 900);
    fail('OTP verification expired. Send a new code and verify again.', $user);
  }

  $delAttrs = [
    'Password','Crypt-Password','MD5-Password','SHA-Password','SSHA-Password',
    'SMD5-Password','NT-Password','LM-Password',
  ];
  $del = $pdo->prepare(
    "DELETE FROM radcheck WHERE username = ? AND attribute IN (" . implode(',', array_fill(0, count($delAttrs), '?')) . ")"
  );
  $upsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  foreach ($targets as $u) {
    $del->execute(array_merge([$u], $delAttrs));
    $upsert->execute([$u, $pass]);
  }

  reset_rate_limit_clear('hotspot_reset_password_ip', $clientIp);
  reset_rate_limit_clear('hotspot_reset_password_user', $clientIp . '|' . $userKey);

  try {
    hotspot_require_paylib('sms.php');
    sms_send_templated(
      $user,
      'SMS_PASSWORD_RESET_TEXT',
      'Your NISTER Wi-Fi password has been reset. If this was not you, contact support.',
      ['MSISDN' => function_exists('sms_normalize_local') ? sms_normalize_local($user) : $user]
    );
  } catch (Throwable $ignored) {
    error_log('[api/hotspot/reset_password.php] reset confirmation SMS failed user=' . $user);
  }

  http_response_code(200);
  header("Content-Type: text/html; charset=utf-8");
  $safe = h($user);
  $login = $LOGIN_URL . '?username=' . rawurlencode($user) . '&msg=' . rawurlencode('Password reset. Please log in with your new password.');
  echo "<!doctype html><meta charset='utf-8'><title>Password reset</title>
  <style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:2rem}
  .card{max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px}
  .ok{background:#e7f8ee;border:1px solid #9ad9b3;padding:12px;border-radius:8px;margin-bottom:16px;color:#0f5132}
  .btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #888;text-decoration:none}
  </style>
  <div class='card'><h2>Password reset</h2>
  <div class='ok'>Your password for <b>".$safe."</b> has been reset.</div>
  <p><a class='btn' href='".h($login)."'>Go to Wi-Fi login</a></p></div>";
  exit;
} catch (Throwable $e) {
  error_log('[api/hotspot/reset_password.php] user=' . $user . ' err=' . $e->getMessage());
  fail('Could not reset password right now. Please try again shortly.', $user);
}
