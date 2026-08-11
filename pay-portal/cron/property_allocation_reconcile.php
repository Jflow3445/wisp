<?php
declare(strict_types=1);

ini_set('display_errors', '0');

require_once __DIR__ . '/../lib/common.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/owner_schema.php';
require_once __DIR__ . '/../lib/property_revenue.php';

$ENV = app_boot();
nister_require_cli_or_token($ENV);

$limit = isset($argv[1]) && is_numeric($argv[1])
  ? (int)$argv[1]
  : (int)($_GET['limit'] ?? getenv('PROPERTY_ALLOCATION_RECONCILE_LIMIT') ?: 100);
$limit = max(1, min(1000, $limit));

try {
  owner_schema_bootstrap($PDO);
} catch (Throwable $e) {
  error_log('[property_allocation_reconcile] setup err=' . $e->getMessage());
  echo json_encode([
    'ts' => gmdate('c'),
    'ok' => false,
    'error' => 'setup_error',
    'detail' => $e->getMessage(),
  ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
  exit(2);
}

try {
  $result = property_allocation_reconcile($PDO, $limit);
  $payload = ['ts' => gmdate('c')] + $result;
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
  if (($result['ok'] ?? false) !== true && (string)($result['error'] ?? '') === 'setup_error') {
    exit(2);
  }
} catch (Throwable $e) {
  error_log('[property_allocation_reconcile] fatal err=' . $e->getMessage());
  echo json_encode([
    'ts' => gmdate('c'),
    'ok' => false,
    'error' => 'unexpected_error',
    'detail' => $e->getMessage(),
  ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
  exit(1);
}
