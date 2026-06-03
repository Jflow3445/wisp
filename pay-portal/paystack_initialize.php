<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ini_set('display_errors', '0');

require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/paystack.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'POST') {
  json_out(['ok'=>false,'error'=>'method_not_allowed'], 405);
}
if (!nister_is_same_origin_request()) {
  json_out(['ok'=>false,'error'=>'origin_not_allowed'], 403);
}

user_boot();
user_require_login(true);
$msisdn = normalize_msisdn(user_msisdn());
if ($msisdn === '') json_out(['ok'=>false,'error'=>'unauthorized'], 401);

$in = array_merge($_POST, body_json());
$amountCents = topup_amount_cents_from_input($in);
$min = topup_min_cents();
if ($amountCents < $min) {
  json_out([
    'ok'=>false,
    'error'=>'min_amount',
    'min_cents'=>$min,
    'min_ghs'=>number_format($min / 100, 2, '.', ''),
  ], 422);
}
if (!paystack_admin_enabled()) {
  json_out(['ok'=>false,'error'=>'paystack_disabled'], 403);
}
if (paystack_secret_key() === '') {
  json_out(['ok'=>false,'error'=>'paystack_not_configured'], 503);
}

$reference = paystack_reference();
try {
  nister_payment_save_pending(
    $reference,
    $msisdn,
    $amountCents,
    'paystack',
    $msisdn,
    'Paystack checkout initialized'
  );

  $data = paystack_initialize_checkout($msisdn, $amountCents, $reference);
  echo json_encode([
    'ok' => true,
    'reference' => (string)($data['reference'] ?? $reference),
    'authorization_url' => (string)$data['authorization_url'],
    'access_code' => (string)($data['access_code'] ?? ''),
  ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  try {
    nister_payment_mark_declined($reference, 'Paystack initialize failed', 'paystack');
  } catch (Throwable $ignored) {
    // keep the API error focused on checkout.
  }
  error_log('[paystack_initialize] ref=' . $reference . ' msisdn=' . $msisdn . ' err=' . $e->getMessage());
  $err = $e->getMessage();
  $public = in_array($err, ['paystack_disabled','paystack_secret_missing','curl_missing','min_amount'], true) ? $err : 'paystack_initialize_failed';
  json_out(['ok'=>false,'error'=>$public], 502);
}
