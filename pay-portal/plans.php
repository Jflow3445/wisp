<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/plans_radius.php';
try {
  user_boot();
  $locId = location_session_get_id();
  if (user_logged_in()) {
    $msisdn = normalize_msisdn(user_msisdn());
    if ($msisdn !== '') {
      $loc = location_resolve_for_user($msisdn, location_session_get_code());
      $locId = (int)($loc['id'] ?? 0);
    }
  }
  if ($locId === null || $locId <= 0) $locId = location_default_id();
  echo json_encode([
    'ok'=>true,
    'location_id'=>$locId,
    'plans'=>array_values(radius_fetch_plans(false, $locId, true))
  ], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  error_log('[plans.php] ' . $e->getMessage());
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'server_error']);
}
