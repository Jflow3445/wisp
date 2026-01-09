<?php
declare(strict_types=1);
ini_set('display_errors', '0');
error_reporting(E_ERROR | E_PARSE);

require_once __DIR__ . '/_db.php';

$LOGIN_URL = 'https://wifi.nister.org/login.html';

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }

function fail(string $msg, string $user = ''): void {
  http_response_code(400);
  $back = 'https://wifi.nister.org/change-password.html';
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

$user = pick($input, ['username', 'user', 'msisdn', 'phone', 'account']);
$current = pick($input, ['current_password', 'current', 'old_password', 'oldpass', 'password_old', 'old']);
$pass = pick($input, ['password', 'new_password', 'new_password1', 'newpass', 'pass', 'password_new', 'newpass1']);
$pass2 = pick($input, ['password2', 'password_confirm', 'new_password2', 'newpass2', 'confirm_password', 'new_password_confirm']);

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

  $stmt = $pdo->prepare("SELECT id, value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
  $stmt->execute([$user]);
  $row = $stmt->fetch();
  if (!$row) {
    fail('Account not found. Please sign up first.', $user);
  }
  if ((string)$row['value'] !== $current) {
    fail('Current password is incorrect.', $user);
  }

  $upd = $pdo->prepare("UPDATE radcheck SET value = ? WHERE id = ?");
  $upd->execute([$pass, $row['id']]);

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
