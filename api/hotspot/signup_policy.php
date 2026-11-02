<?php
declare(strict_types=1);
require_once __DIR__.'/_paylib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: *');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='GET') {
  http_response_code(405); echo json_encode(['ok'=>false,'error'=>'method_not_allowed']); exit;
}
try {
  hotspot_require_paylib('settings.php');
  hotspot_require_paylib('registration.php');
  echo json_encode(['ok'=>true]+registration_policy());
} catch (Throwable $e) {
  http_response_code(503); echo json_encode(['ok'=>false,'error'=>'registration_unavailable']);
}
