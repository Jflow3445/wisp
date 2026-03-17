<?php
declare(strict_types=1);

// Legacy endpoint shim.
// Delegate to the shared implementation so all status endpoints stay identical.
$shared = realpath(__DIR__ . '/../../pay-portal/hotspot-api/status.php');
if ($shared === false || !is_file($shared)) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'ok' => false,
    'error' => 'shared_status_endpoint_missing',
    'detail' => 'pay-portal/hotspot-api/status.php not found',
  ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

require $shared;
