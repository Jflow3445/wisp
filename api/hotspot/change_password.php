<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ERROR | E_PARSE);

require_once __DIR__ . '/_db.php';

function portal_base_from_link(string $link, string $fallback): string {
  $u = parse_url($link);
  if (!$u || empty($u['scheme']) || empty($u['host'])) return $fallback;
  $host = strtolower((string)$u['host']);
  if (!in_array($host, ['wifi.nister.org', '192.168.88.1'], true)) return $fallback;
  $base = $u['scheme'] . '://' . $u['host'];
  if (!empty($u['port'])) $base .= ':' . $u['port'];
  return $base;
}

$defaultLogin = 'http://wifi.nister.org/login';
$linkLoginOnly = (string)($_REQUEST['link_login_only'] ?? $defaultLogin);
$PORTAL_BASE = portal_base_from_link($linkLoginOnly, 'http://wifi.nister.org');
$LOGIN_URL = $PORTAL_BASE . '/login.html';

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }
function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/', $d))   return [$d, '233' . substr($d, 1)];
  return [$d];
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

$input = $_POST;
if (!$input) $input = $_REQUEST;

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

header('Cache-Control: no-store');

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
  if (!$found) fail('Account not found. Please sign up first.', $user);
  if (!$match) fail('Current password is incorrect.', $user);

  $upsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  foreach ($targets as $u) {
    $upsert->execute([$u, $pass]);
  }

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
  fail('Database error: ' . $e->getMessage(), $user);
}
