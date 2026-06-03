<?php
declare(strict_types=1);

require_once __DIR__.'/common.php';
require_once __DIR__.'/settings.php';
require_once __DIR__.'/payment_records.php';
require_once __DIR__.'/wallet.php';
require_once __DIR__.'/sms.php';

function nister_env_value(array $keys, string $default = ''): string {
  $env = app_boot();
  foreach ($keys as $key) {
    if (isset($env[$key]) && trim((string)$env[$key]) !== '') return trim((string)$env[$key]);
    if (isset($_ENV[$key]) && trim((string)$_ENV[$key]) !== '') return trim((string)$_ENV[$key]);
    $v = getenv($key);
    if ($v !== false && trim((string)$v) !== '') return trim((string)$v);
  }
  return $default;
}

function nister_setting_value(string $key, array $envKeys = [], string $default = ''): string {
  $v = settings_get($key, null);
  if ($v !== null && trim((string)$v) !== '') return trim((string)$v);
  $keys = $envKeys ?: [$key];
  return nister_env_value($keys, $default);
}

function nister_truthy($value, bool $default = false): bool {
  if ($value === null || $value === '') return $default;
  if (is_bool($value)) return $value;
  $s = strtolower(trim((string)$value));
  if ($s === '') return $default;
  return in_array($s, ['1','true','yes','y','on','enabled'], true);
}

function topup_manual_enabled(): bool {
  $raw = settings_get('TOPUP_MANUAL_ENABLED', null);
  if ($raw === null || trim((string)$raw) === '') {
    $raw = nister_env_value(['TOPUP_MANUAL_ENABLED'], '1');
  }
  return nister_truthy($raw, true);
}

function paystack_admin_enabled(): bool {
  $raw = settings_get('PAYSTACK_ENABLED', null);
  if ($raw === null || trim((string)$raw) === '') {
    $raw = nister_env_value(['PAYSTACK_ENABLED'], '0');
  }
  return nister_truthy($raw, false);
}

function paystack_public_key(): string {
  return nister_setting_value('PAYSTACK_PUBLIC_KEY', ['PAYSTACK_PUBLIC_KEY','PAYSTACK_PUBLIC'], '');
}

function paystack_secret_key(): string {
  return nister_setting_value('PAYSTACK_SECRET_KEY', ['PAYSTACK_SECRET_KEY','PAYSTACK_SECRET'], '');
}

function paystack_currency(): string {
  $currency = strtoupper(nister_setting_value('PAYSTACK_CURRENCY', ['PAYSTACK_CURRENCY','CURRENCY'], 'GHS'));
  $currency = preg_replace('/[^A-Z]/', '', $currency);
  return $currency !== '' ? substr($currency, 0, 3) : 'GHS';
}

function paystack_callback_url(): string {
  $configured = nister_setting_value('PAYSTACK_CALLBACK_URL', ['PAYSTACK_CALLBACK_URL'], '');
  if ($configured !== '') return $configured;

  $base = nister_setting_value('PAY_BASE', ['PAY_BASE','PAY_PORTAL_BASE'], '');
  if ($base === '') {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'pay.nister.org');
    $base = ($https ? 'https://' : 'http://') . $host;
  }
  return rtrim($base, '/') . '/paystack_callback.php';
}

function paystack_checkout_enabled(): bool {
  return paystack_admin_enabled() && paystack_secret_key() !== '';
}

function topup_min_cents(): int {
  $min = (int)(settings_get('TOPUP_MIN_CENTS', '3000') ?? 3000);
  return $min > 0 ? $min : 3000;
}

function topup_amount_cents_from_input(array $in): int {
  if (isset($in['amount_cents']) && is_numeric($in['amount_cents'])) {
    return max(0, (int)$in['amount_cents']);
  }
  if (isset($in['amount']) && trim((string)$in['amount']) !== '') {
    $raw = preg_replace('/[^\d.]/', '', (string)$in['amount']);
    if ($raw !== '') return max(0, (int)round(((float)$raw) * 100));
  }
  return 0;
}

function paystack_reference(): string {
  try {
    $rand = strtoupper(bin2hex(random_bytes(5)));
  } catch (Throwable $e) {
    $rand = strtoupper(substr(hash('sha256', uniqid('', true)), 0, 10));
  }
  return 'NISTER-PSK-' . gmdate('YmdHis') . '-' . $rand;
}

function paystack_customer_email(string $msisdn): string {
  $suffix = nister_env_value(['DEFAULT_EMAIL_SUFFIX'], '@wifi.nister.org');
  if ($suffix === '') $suffix = '@wifi.nister.org';
  if ($suffix[0] !== '@') $suffix = '@' . $suffix;
  $local = preg_replace('/\D+/', '', $msisdn);
  if ($local === '') $local = 'customer';
  return $local . $suffix;
}

function paystack_api_request(string $method, string $path, ?array $payload = null): array {
  $secret = paystack_secret_key();
  if ($secret === '') throw new RuntimeException('paystack_secret_missing');
  if (!function_exists('curl_init')) throw new RuntimeException('curl_missing');

  $url = 'https://api.paystack.co' . $path;
  $ch = curl_init($url);
  $headers = [
    'Authorization: Bearer ' . $secret,
    'Accept: application/json',
  ];
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
  curl_setopt($ch, CURLOPT_TIMEOUT, 30);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
  if ($payload !== null) {
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $headers[] = 'Content-Type: application/json';
  }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

  $raw = curl_exec($ch);
  $err = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($raw === false || $raw === '') {
    throw new RuntimeException('paystack_network_error' . ($err !== '' ? (': '.$err) : ''));
  }
  $json = json_decode((string)$raw, true);
  if (!is_array($json)) throw new RuntimeException('paystack_invalid_response');
  if ($code < 200 || $code >= 300 || !($json['status'] ?? false)) {
    $message = trim((string)($json['message'] ?? 'paystack_api_error'));
    throw new RuntimeException($message !== '' ? $message : 'paystack_api_error');
  }
  return $json;
}

function paystack_initialize_checkout(string $msisdn, int $amountCents, string $reference): array {
  if (!paystack_checkout_enabled()) throw new RuntimeException('paystack_disabled');
  if ($amountCents < topup_min_cents()) throw new RuntimeException('min_amount');

  $payload = [
    'email' => paystack_customer_email($msisdn),
    'amount' => (string)$amountCents,
    'currency' => paystack_currency(),
    'reference' => $reference,
    'callback_url' => paystack_callback_url(),
    'metadata' => [
      'source' => 'nister_pay_portal',
      'msisdn' => $msisdn,
      'amount_cents' => $amountCents,
    ],
  ];

  $res = paystack_api_request('POST', '/transaction/initialize', $payload);
  $data = $res['data'] ?? [];
  if (!is_array($data) || empty($data['authorization_url'])) {
    throw new RuntimeException('paystack_authorization_missing');
  }
  return $data;
}

function paystack_metadata_array($metadata): array {
  if (is_array($metadata)) return $metadata;
  if (is_string($metadata) && trim($metadata) !== '') {
    $j = json_decode($metadata, true);
    if (is_array($j)) return $j;
  }
  return [];
}

function paystack_ledger_ref(string $reference): string {
  $reference = trim($reference);
  $candidate = 'PAYSTACK-' . $reference;
  if (strlen($candidate) <= 64) return $candidate;
  return 'PAYSTACK-' . substr(hash('sha256', $reference), 0, 40);
}

function paystack_ledger_ref_exists(string $ledgerRef): bool {
  global $PDO;
  try {
    $st = $PDO->prepare("SELECT 1 FROM ledger WHERE ref=:r LIMIT 1");
    $st->execute([':r'=>$ledgerRef]);
    return (bool)$st->fetchColumn();
  } catch (Throwable $e) {
    return false;
  }
}

function paystack_send_topup_sms(string $msisdn, int $amountCents, string $reference): void {
  try {
    $balanceCents = null;
    try { $balanceCents = wallet_balance($msisdn); } catch (Throwable $e) { $balanceCents = null; }
    sms_send_templated(
      $msisdn,
      'SMS_TOPUP_CONFIRM_TEXT',
      'Top up confirmed: GHS {AMOUNT_GHS}. Balance: GHS {BALANCE_GHS}. Ref: {REF}.',
      [
        'NAME' => '',
        'MSISDN' => sms_normalize_local($msisdn),
        'AMOUNT_GHS' => number_format($amountCents / 100, 2),
        'BALANCE_GHS' => $balanceCents !== null ? number_format($balanceCents / 100, 2) : '',
        'REF' => $reference,
      ]
    );
  } catch (Throwable $e) {
    error_log('[paystack] sms_error ref=' . $reference . ' err=' . $e->getMessage());
  }
}

function paystack_verify_transaction(string $reference): array {
  $reference = trim($reference);
  if ($reference === '' || !preg_match('/^[A-Za-z0-9.=\-]{3,80}$/', $reference)) {
    throw new RuntimeException('invalid_reference');
  }
  return paystack_api_request('GET', '/transaction/verify/' . rawurlencode($reference));
}

function paystack_verify_and_credit(string $reference): array {
  if (!paystack_checkout_enabled()) throw new RuntimeException('paystack_disabled');

  $res = paystack_verify_transaction($reference);
  $data = $res['data'] ?? [];
  if (!is_array($data)) throw new RuntimeException('paystack_invalid_transaction');

  $gatewayRef = trim((string)($data['reference'] ?? $reference));
  $gatewayStatus = strtolower(trim((string)($data['status'] ?? '')));
  $gatewayAmount = isset($data['amount']) && is_numeric($data['amount']) ? (int)$data['amount'] : 0;
  $gatewayCurrency = strtoupper(trim((string)($data['currency'] ?? '')));
  $metadata = paystack_metadata_array($data['metadata'] ?? []);
  $row = nister_payment_find($gatewayRef);
  $trustedReference = is_array($row) || (string)($metadata['source'] ?? '') === 'nister_pay_portal';
  if (!$trustedReference) throw new RuntimeException('untrusted_paystack_reference');

  $msisdn = '';
  if (is_array($row) && !empty($row['msisdn'])) $msisdn = normalize_msisdn((string)$row['msisdn']);
  if ($msisdn === '' && !empty($metadata['msisdn'])) $msisdn = normalize_msisdn((string)$metadata['msisdn']);
  if ($msisdn === '' && isset($data['customer']) && is_array($data['customer'])) {
    $email = (string)($data['customer']['email'] ?? '');
    if (preg_match('/^(\d{9,15})@/', $email, $m)) $msisdn = normalize_msisdn($m[1]);
  }

  $expectedAmount = 0;
  if (is_array($row)) $expectedAmount = nister_payment_amount_cents($row);
  if ($expectedAmount <= 0 && isset($metadata['amount_cents']) && is_numeric($metadata['amount_cents'])) {
    $expectedAmount = (int)$metadata['amount_cents'];
  }

  $notes = 'Paystack status: ' . ($gatewayStatus !== '' ? $gatewayStatus : 'unknown');
  if (!empty($data['channel'])) $notes .= '; channel: ' . (string)$data['channel'];
  if (!empty($data['gateway_response'])) $notes .= '; gateway: ' . (string)$data['gateway_response'];

  if ($gatewayStatus !== 'success') {
    if (in_array($gatewayStatus, ['failed','reversed'], true) && is_array($row) && (string)($row['status'] ?? '') !== 'approved') {
      nister_payment_mark_declined($gatewayRef, $notes, 'paystack');
    }
    return [
      'ok' => true,
      'credited' => false,
      'reference' => $gatewayRef,
      'gateway_status' => $gatewayStatus,
      'message' => (string)($data['gateway_response'] ?? $res['message'] ?? 'Payment is not complete.'),
    ];
  }

  if ($gatewayAmount <= 0) throw new RuntimeException('invalid_paystack_amount');
  if ($expectedAmount > 0 && $gatewayAmount !== $expectedAmount) {
    nister_payment_mark_declined($gatewayRef, 'Paystack amount mismatch', 'paystack');
    throw new RuntimeException('amount_mismatch');
  }
  $currency = paystack_currency();
  if ($currency !== '' && $gatewayCurrency !== '' && $gatewayCurrency !== $currency) {
    nister_payment_mark_declined($gatewayRef, 'Paystack currency mismatch', 'paystack');
    throw new RuntimeException('currency_mismatch');
  }
  if ($msisdn === '') throw new RuntimeException('missing_msisdn');

  $ledgerRef = paystack_ledger_ref($gatewayRef);
  $alreadyCredited = paystack_ledger_ref_exists($ledgerRef);
  wallet_credit($msisdn, $gatewayAmount, $ledgerRef, 'Paystack top-up ' . $gatewayRef);
  $creditedNow = !$alreadyCredited && paystack_ledger_ref_exists($ledgerRef);
  $transitioned = nister_payment_mark_approved(
    $gatewayRef,
    $msisdn,
    $gatewayAmount,
    'paystack',
    $msisdn,
    $notes,
    'paystack'
  );

  if ($creditedNow && $transitioned) {
    paystack_send_topup_sms($msisdn, $gatewayAmount, $gatewayRef);
  }

  return [
    'ok' => true,
    'credited' => true,
    'credited_now' => $creditedNow,
    'reference' => $gatewayRef,
    'ledger_ref' => $ledgerRef,
    'msisdn' => $msisdn,
    'amount_cents' => $gatewayAmount,
    'currency' => $gatewayCurrency ?: $currency,
    'gateway_status' => $gatewayStatus,
  ];
}
