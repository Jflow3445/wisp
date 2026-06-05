<?php
declare(strict_types=1);

ini_set('display_errors', '0');

require_once __DIR__.'/../lib/paystack.php';

$limit = (int)(getenv('PAYSTACK_RECONCILE_LIMIT') ?: 25);
$minAge = (int)(getenv('PAYSTACK_RECONCILE_MIN_AGE_SECONDS') ?: 60);

try {
  $result = paystack_reconcile_pending($limit, $minAge);
  echo gmdate('c') . ' ' . json_encode(['ok'=>true] + $result, JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
  error_log('[paystack_reconcile] fatal err=' . $e->getMessage());
  echo gmdate('c') . ' ' . json_encode(['ok'=>false,'error'=>$e->getMessage()], JSON_UNESCAPED_SLASHES) . PHP_EOL;
  exit(1);
}

