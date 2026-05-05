<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ERROR | E_PARSE);

require_once __DIR__ . '/_db.php';

function portal_base_from_link(string $link, string $fallback): string {
  $u = parse_url($link);
  if (!$u || empty($u['scheme']) || empty($u['host'])) return $fallback;
  $scheme = strtolower((string)$u['scheme']);
  $host = strtolower((string)$u['host']);
  $allowed = [
    'wifi.nister.org' => ['https'],
    '192.168.88.1' => ['http', 'https'],
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

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }
function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/', $d))   return [$d, '233' . substr($d, 1)];
  return [$d];
}

function hs_cp_rate_limit_path(string $scope, string $key): string {
  $scope = preg_replace('/[^a-z0-9._-]+/i', '_', strtolower(trim($scope))) ?: 'default';
  $dir = rtrim(sys_get_temp_dir(), "/\\") . '/nister-rate-limit';
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  return $dir . '/' . $scope . '-' . hash('sha256', $key) . '.json';
}

function hs_cp_rate_limit_read(string $scope, string $key): array {
  $path = hs_cp_rate_limit_path($scope, $key);
  $raw = @file_get_contents($path);
  $j = is_string($raw) ? json_decode($raw, true) : null;
  $attempts = [];
  if (is_array($j) && isset($j['attempts']) && is_array($j['attempts'])) {
    foreach ($j['attempts'] as $ts) {
      if (is_int($ts) || ctype_digit((string)$ts)) $attempts[] = (int)$ts;
    }
  }
  $lockUntil = 0;
  if (is_array($j) && isset($j['lock_until']) && (is_int($j['lock_until']) || ctype_digit((string)$j['lock_until']))) {
    $lockUntil = (int)$j['lock_until'];
  }
  return ['path'=>$path, 'attempts'=>$attempts, 'lock_until'=>max(0, $lockUntil)];
}

function hs_cp_rate_limit_write(array $state): void {
  if (!isset($state['path'])) return;
  $path = (string)$state['path'];
  $payload = [
    'attempts' => array_values(array_map('intval', (array)($state['attempts'] ?? []))),
    'lock_until' => (int)($state['lock_until'] ?? 0),
  ];
  @file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function hs_cp_rate_limit_allow(string $scope, string $key, int $maxAttempts = 5, int $windowSec = 600, int $lockoutSec = 900): array {
  $maxAttempts = max(1, $maxAttempts);
  $windowSec = max(1, $windowSec);
  $lockoutSec = max(1, $lockoutSec);
  $state = hs_cp_rate_limit_read($scope, $key);
  $now = time();
  $cutoff = $now - $windowSec;
  $attempts = array_values(array_filter((array)$state['attempts'], static fn($ts): bool => (int)$ts > $cutoff));
  $lockUntil = (int)($state['lock_until'] ?? 0);
  if ($lockUntil <= $now && count($attempts) >= $maxAttempts) {
    $lockUntil = $now + $lockoutSec;
  }
  $state['attempts'] = $attempts;
  $state['lock_until'] = $lockUntil;
  hs_cp_rate_limit_write($state);
  return [
    'allowed' => $lockUntil <= $now,
    'retry_after' => ($lockUntil > $now) ? max(1, $lockUntil - $now) : 0,
  ];
}

function hs_cp_rate_limit_hit(string $scope, string $key, int $maxAttempts = 5, int $windowSec = 600, int $lockoutSec = 900): array {
  $maxAttempts = max(1, $maxAttempts);
  $windowSec = max(1, $windowSec);
  $lockoutSec = max(1, $lockoutSec);
  $state = hs_cp_rate_limit_read($scope, $key);
  $now = time();
  $cutoff = $now - $windowSec;
  $attempts = array_values(array_filter((array)$state['attempts'], static fn($ts): bool => (int)$ts > $cutoff));
  $attempts[] = $now;
  $lockUntil = (int)($state['lock_until'] ?? 0);
  if (count($attempts) >= $maxAttempts) {
    $lockUntil = $now + $lockoutSec;
  }
  $state['attempts'] = $attempts;
  $state['lock_until'] = $lockUntil;
  hs_cp_rate_limit_write($state);
  return [
    'allowed' => $lockUntil <= $now,
    'retry_after' => ($lockUntil > $now) ? max(1, $lockUntil - $now) : 0,
  ];
}

function hs_cp_rate_limit_clear(string $scope, string $key): void {
  $path = hs_cp_rate_limit_path($scope, $key);
  if (is_file($path)) @unlink($path);
}

function fail(string $msg, string $user = ''): void {
  http_response_code(400);
  global $PORTAL_BASE;
  $back = $PORTAL_BASE . '/change-password.html';
  if ($user !== '') { $back .= '?username=' . rawurlencode($user); }
  echo "<!doctype html><meta charset='utf-8'><title>Password update failed</title>
  <style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:2rem}
  .card{max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px}
  .err{background:#fee;border:1px solid #f88;padding:12px;border-radius:8px;margin-bottom:16px;color:#900}
  .btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #888;text-decoration:none}
  </style>
  <div class='card'><h2>Could not update password</h2>
  <div class='err'>".h($msg)."</div>
  <p><a class='btn' href='".h($back)."'>Go back</a></p></div>";
  exit;
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

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
  fail('Unsupported request method. Please submit the form again.');
}

$input = $_POST;

$user = pick($input, ['username', 'user', 'login', 'user_name', 'msisdn', 'phone', 'account']);
$current = pick($input, [
  'current_password', 'currentPassword', 'currentpassword', 'current',
  'old_password', 'oldpassword', 'oldpass', 'password_old', 'password_current',
  'current-password', 'old-password', 'old'
]);
$pass = pick($input, [
  'new_password', 'newpassword', 'password_new', 'new_password1', 'newpass', 'newpass1',
  'password1', 'pass', 'password'
]);
$pass2 = pick($input, [
  'password2', 'password_confirm', 'new_password2', 'newpassword2', 'newpass2',
  'confirm_password', 'new_password_confirm'
]);

if ($current === '') {
  $maybeCurrent = pick($input, ['password', 'currentpassword', 'oldpassword']);
  $maybeNew = pick($input, ['new_password', 'newpassword', 'password_new', 'new_password1', 'newpass', 'password1']);
  if ($maybeCurrent !== '' && $maybeNew !== '' && $maybeNew !== $maybeCurrent) {
    $current = $maybeCurrent;
    if ($pass === '') $pass = $maybeNew;
  }
}

if ($user === '' || $pass === '' || $current === '') {
  fail('Please provide your account, current password, and a new password.', $user);
}
$user = preg_replace('/\s+/', '', $user);

if ($pass2 !== '' && $pass2 !== $pass) {
  fail('Passwords do not match. Please try again.', $user);
}
if (strlen($pass) < 6) {
  fail('New password must be at least 6 characters.', $user);
}
if (strlen($pass) > 128) {
  fail('New password is too long.', $user);
}
if ($pass === $current) {
  fail('New password must be different from current password.', $user);
}

header('Cache-Control: no-store');

$clientIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
if (!filter_var($clientIp, FILTER_VALIDATE_IP)) $clientIp = 'unknown';
$userKey = strtolower($user);
$ipGate = hs_cp_rate_limit_allow('hotspot_change_password_ip', $clientIp, 10, 600, 900);
$userGate = hs_cp_rate_limit_allow('hotspot_change_password_user', $clientIp . '|' . $userKey, 6, 600, 900);
if (!($ipGate['allowed'] ?? false) || !($userGate['allowed'] ?? false)) {
  fail('Too many attempts. Please wait before trying again.', $user);
}

try {
  $pdo = hotspot_radius_pdo();

  $targets = array_values(array_unique(array_filter(array_merge([$user], username_variants($user)))));
  $found = false;
  $match = false;
  $st = $pdo->prepare("SELECT value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
  foreach ($targets as $u) {
    $st->execute([$u]);
    $val = $st->fetchColumn();
    if ($val === false || $val === null) continue;
    $found = true;
    if ((string)$val === $current) { $match = true; break; }
  }
  if (!$found || !$match) {
    hs_cp_rate_limit_hit('hotspot_change_password_ip', $clientIp, 10, 600, 900);
    hs_cp_rate_limit_hit('hotspot_change_password_user', $clientIp . '|' . $userKey, 6, 600, 900);
    fail('Invalid account or current password.', $user);
  }

  $upsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  foreach ($targets as $u) {
    $upsert->execute([$u, $pass]);
  }
  hs_cp_rate_limit_clear('hotspot_change_password_ip', $clientIp);
  hs_cp_rate_limit_clear('hotspot_change_password_user', $clientIp . '|' . $userKey);

  http_response_code(200);
  header("Content-Type: text/html; charset=utf-8");
  $safe = h($user);
  $login = $LOGIN_URL;
  echo "<!doctype html><meta charset='utf-8'><title>Password updated</title>
  <style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:2rem}
  .card{max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px}
  .ok{background:#e7f8ee;border:1px solid #9ad9b3;padding:12px;border-radius:8px;margin-bottom:16px;color:#0f5132}
  .btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #888;text-decoration:none}
  </style>
  <div class='card'><h2>Password updated</h2>
  <div class='ok'>Your password for <b>".$safe."</b> has been updated.</div>
  <p><a class='btn' href='".h($login)."'>Go to Wi-Fi login</a></p></div>";
  exit;
} catch (Throwable $e) {
  error_log('[api/hotspot/change_password.php] user=' . $user . ' err=' . $e->getMessage());
  fail('Could not update password right now. Please try again shortly.', $user);
}
