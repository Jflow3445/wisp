<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/db.php';
require_once __DIR__.'/lib/auto_renew.php';
require_once __DIR__.'/lib/plans_radius.php';
require_once __DIR__.'/lib/radius.php';

user_boot();
user_require_login(true);
$msisdn = normalize_msisdn(user_msisdn());
if ($msisdn === '') { http_response_code(401); echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit; }

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Merge JSON into $_POST for convenience
if ($method === 'POST') {
  $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
  if (strpos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
      $j = json_decode($raw, true);
      if (is_array($j)) {
        foreach ($j as $k=>$v) { if (!array_key_exists($k, $_POST)) $_POST[$k] = $v; }
      }
    }
  }
}

if ($method !== 'POST') {
  $auto = auto_renew_get($msisdn);
  $plan = null;
  if (!empty($auto['plan_code'])) {
    $plan = radius_find_plan((string)$auto['plan_code']);
  }
  echo json_encode(['ok'=>true,'auto_renew'=>$auto,'plan'=>$plan], JSON_UNESCAPED_SLASHES);
  exit;
}

$enabledRaw = $_POST['enabled'] ?? $_POST['auto_renew'] ?? null;
$enabled = false;
if (is_bool($enabledRaw)) $enabled = $enabledRaw;
else {
  $sv = strtolower(trim((string)$enabledRaw));
  if ($sv !== '' && !in_array($sv, ['0','false','no','off'], true)) $enabled = true;
}

$planCode = trim((string)($_POST['plan_code'] ?? ''));
if ($enabled && $planCode === '') {
  try {
    $active = radius_get_active_plan($msisdn);
    $planCode = (string)($active['plan_code'] ?? '');
  } catch (Throwable $e) {
    $planCode = '';
  }
}

if ($enabled) {
  if ($planCode === '') {
    http_response_code(422);
    echo json_encode(['ok'=>false,'error'=>'plan_required'], JSON_UNESCAPED_SLASHES);
    exit;
  }
  $plan = radius_find_plan($planCode);
  if (!$plan) {
    http_response_code(422);
    echo json_encode(['ok'=>false,'error'=>'invalid_plan'], JSON_UNESCAPED_SLASHES);
    exit;
  }
}

$auto = auto_renew_set($msisdn, $enabled, $planCode !== '' ? $planCode : null);
$plan = (!empty($auto['plan_code'])) ? radius_find_plan((string)$auto['plan_code']) : null;

echo json_encode(['ok'=>true,'auto_renew'=>$auto,'plan'=>$plan], JSON_UNESCAPED_SLASHES);
