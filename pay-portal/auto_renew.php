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
$loc = location_resolve_for_user($msisdn, location_session_get_code());
$locId = (int)($loc['id'] ?? 0);
if ($locId <= 0) $locId = location_default_id();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST' && !nister_is_same_origin_request()) {
  http_response_code(403);
  echo json_encode(['ok'=>false,'error'=>'origin_not_allowed'], JSON_UNESCAPED_SLASHES);
  exit;
}

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
  $auto = auto_renew_get($msisdn, $locId);
  $plan = null;
  $planSource = null;
  if (!empty($auto['plan_code'])) {
    $plan = radius_find_plan((string)$auto['plan_code'], $locId, true);
    if ($plan) {
      $planSource = 'location';
    } else {
      $plan = radius_find_plan((string)$auto['plan_code'], $locId, false);
      if ($plan) $planSource = 'global_fallback';
    }
  }
  echo json_encode([
    'ok'=>true,
    'location_id'=>$locId,
    'location_code'=>(string)($loc['code'] ?? ''),
    'auto_renew'=>$auto,
    'plan'=>$plan,
    'plan_source'=>$planSource,
  ], JSON_UNESCAPED_SLASHES);
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
  $plan = radius_find_plan($planCode, $locId, true);
  $planSource = 'location';
  if (!$plan) {
    $plan = radius_find_plan($planCode, $locId, false);
    if ($plan) $planSource = 'global_fallback';
  }
  if (!$plan) {
    http_response_code(422);
    echo json_encode(['ok'=>false,'error'=>'invalid_plan'], JSON_UNESCAPED_SLASHES);
    exit;
  }
  if (!radius_plan_is_active($plan)) {
    http_response_code(409);
    echo json_encode([
      'ok'=>false,
      'error'=>'plan_inactive',
      'message'=>'This plan is no longer available. Please choose one of the current plans.'
    ], JSON_UNESCAPED_SLASHES);
    exit;
  }
}

$auto = auto_renew_set($msisdn, $enabled, $planCode !== '' ? $planCode : null, $locId);
$plan = null;
$planSource = null;
if (!empty($auto['plan_code'])) {
  $plan = radius_find_plan((string)$auto['plan_code'], $locId, true);
  if ($plan) {
    $planSource = 'location';
  } else {
    $plan = radius_find_plan((string)$auto['plan_code'], $locId, false);
    if ($plan) $planSource = 'global_fallback';
  }
}

echo json_encode([
  'ok'=>true,
  'location_id'=>$locId,
  'location_code'=>(string)($loc['code'] ?? ''),
  'auto_renew'=>$auto,
  'plan'=>$plan,
  'plan_source'=>$planSource,
], JSON_UNESCAPED_SLASHES);
