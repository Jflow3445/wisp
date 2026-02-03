<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/alerts.php';

$env = app_boot();
$secret = (string)($env['ADMIN_ALERT_SECRET'] ?? getenv('ADMIN_ALERT_SECRET') ?? ($_ENV['ADMIN_ALERT_SECRET'] ?? ''));
$provided = $_SERVER['HTTP_X_ALERT_SECRET'] ?? $_GET['secret'] ?? ($_POST['secret'] ?? '');
if ($secret !== '' && !hash_equals($secret, (string)$provided)) {
  json_out(['ok'=>false,'error'=>'forbidden'], 403);
}

$in = body_json();
$ts  = isset($in['ts']) ? trim((string)$in['ts']) : null;
$msg = isset($in['msg']) ? trim((string)$in['msg']) : '';
if ($msg === '') {
  json_out(['ok'=>false,'error'=>'bad_request'], 400);
}

$type = null;
$user = null;
if (preg_match('/^(LIMIT|COA_FAIL)\b/', $msg, $m)) {
  $type = strtolower($m[1]);
}
if (preg_match('/\buser=([0-9]+)/', $msg, $m)) {
  $user = $m[1];
}

$remote = $_SERVER['REMOTE_ADDR'] ?? null;

try {
  $PDO = db_pdo($env);
  alerts_insert($PDO, $ts, $type, $user, $msg, $remote);
  json_out(['ok'=>true]);
} catch (Throwable $e) {
  json_out(['ok'=>false,'error'=>'server_error'], 500);
}
