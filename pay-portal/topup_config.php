<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require_once __DIR__.'/lib/paystack.php';

$min = topup_min_cents();
$paystackEnabled = paystack_checkout_enabled();

echo json_encode([
  'ok' => true,
  'manual_enabled' => topup_manual_enabled(),
  'paystack_enabled' => $paystackEnabled,
  'paystack_configured' => paystack_secret_key() !== '',
  'paystack_public_key' => paystack_public_key(),
  'currency' => paystack_currency(),
  'min_topup_cents' => $min,
  'min_topup_ghs' => number_format($min / 100, 2, '.', ''),
], JSON_UNESCAPED_SLASHES);
