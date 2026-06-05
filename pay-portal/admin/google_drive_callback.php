<?php
declare(strict_types=1);

require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/google_drive_archive.php';

$ok = false;
$title = 'Google Drive connection';
$message = '';
$detail = '';

try {
  $error = trim((string)($_GET['error'] ?? ''));
  if ($error !== '') throw new RuntimeException($error);

  $state = trim((string)($_GET['state'] ?? ''));
  $cookieState = trim((string)($_COOKIE['nister_drive_oauth_state'] ?? ''));
  $code = trim((string)($_GET['code'] ?? ''));
  if ($state === '' || $cookieState === '' || !hash_equals($state, $cookieState) || !gdrive_verify_state($state)) {
    throw new RuntimeException('Invalid or expired Google Drive connection request.');
  }
  if ($code === '') throw new RuntimeException('Google did not return an authorization code.');

  gdrive_exchange_code($code);
  $rootId = gdrive_ensure_archive_root();
  setcookie('nister_drive_oauth_state', '', [
    'expires' => time() - 3600,
    'path' => '/admin',
    'domain' => '',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https',
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  $ok = true;
  $title = 'Google Drive connected';
  $message = 'NISTER can now archive verified NetFlow forensic logs to Google Drive.';
  $detail = $rootId !== '' ? 'Archive folder ID: '.$rootId : '';
} catch (Throwable $e) {
  http_response_code(400);
  $title = 'Google Drive connection failed';
  $message = 'The Drive connection could not be completed.';
  $detail = $e->getMessage();
}

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?=h($title)?></title>
<link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
<style>
  :root{--bg:#f4f1ea;--surface:#172025;--ink:#1c2329;--muted:#5f6a76;--accent:#0f766e;--line:#e2d6c8;--card:#fffdfa}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,var(--bg),#efe8de);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
  main{width:min(560px,calc(100vw - 32px));background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(27,35,42,.12)}
  .mark{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:<?= $ok ? '#0f766e' : '#9f1239' ?>;color:#fff;font-weight:800;margin-bottom:18px}
  h1{margin:0 0 10px;font-size:1.8rem;letter-spacing:0}
  p{margin:0 0 14px;color:var(--muted);line-height:1.55}
  .detail{font-size:.88rem;background:#f7f2ea;border:1px solid var(--line);border-radius:12px;padding:12px;word-break:break-word}
  a{display:inline-flex;margin-top:18px;padding:12px 16px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<main>
  <div class="mark"><?= $ok ? 'OK' : '!' ?></div>
  <h1><?=h($title)?></h1>
  <p><?=h($message)?></p>
  <?php if ($detail !== ''): ?><div class="detail"><?=h($detail)?></div><?php endif; ?>
  <a href="/admin/">Return to admin</a>
</main>
</body>
</html>
