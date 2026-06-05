<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ini_set('display_errors', '0');

require_once __DIR__.'/lib/paystack.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
  json_out(['ok'=>false,'error'=>'method_not_allowed'], 405);
}

$raw = file_get_contents('php://input') ?: '';
$signature = (string)($_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '');
if (!paystack_verify_webhook_signature($raw, $signature)) {
  error_log('[paystack_webhook] invalid_signature');
  json_out(['ok'=>false,'error'=>'invalid_signature'], 401);
}

$event = json_decode($raw, true);
if (!is_array($event)) {
  json_out(['ok'=>false,'error'=>'invalid_payload'], 400);
}

$eventName = strtolower(trim((string)($event['event'] ?? '')));
$data = isset($event['data']) && is_array($event['data']) ? $event['data'] : [];
$reference = trim((string)($data['reference'] ?? ''));

if ($reference === '') {
  json_out(['ok'=>true,'ignored'=>'missing_reference']);
}

try {
  if (in_array($eventName, ['charge.success', 'charge.failed'], true)) {
    $result = paystack_verify_and_credit($reference);
    echo json_encode(['ok'=>true,'event'=>$eventName,'result'=>$result], JSON_UNESCAPED_SLASHES);
    exit;
  }

  echo json_encode(['ok'=>true,'ignored'=>$eventName], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  error_log('[paystack_webhook] event=' . $eventName . ' ref=' . $reference . ' err=' . $e->getMessage());
  json_out(['ok'=>false,'error'=>'paystack_webhook_failed'], 500);
}

