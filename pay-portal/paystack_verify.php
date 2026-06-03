<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ini_set('display_errors', '0');

require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/paystack.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET','POST'], true)) {
  json_out(['ok'=>false,'error'=>'method_not_allowed'], 405);
}
if ($method === 'POST' && !nister_is_same_origin_request()) {
  json_out(['ok'=>false,'error'=>'origin_not_allowed'], 403);
}

$in = array_merge($_GET, $_POST, body_json());
$reference = trim((string)($in['reference'] ?? $in['trxref'] ?? ''));
if ($reference === '') json_out(['ok'=>false,'error'=>'reference_required'], 422);

try {
  $result = paystack_verify_and_credit($reference);
  echo json_encode($result, JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  error_log('[paystack_verify] ref=' . $reference . ' err=' . $e->getMessage());
  json_out(['ok'=>false,'error'=>'paystack_verify_failed'], 400);
}
