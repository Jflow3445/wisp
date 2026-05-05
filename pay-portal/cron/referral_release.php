<?php
declare(strict_types=1);

require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/referrals.php';

$ENV = app_boot();
nister_require_cli_or_token($ENV);

$limitReferrers = isset($argv[1]) && is_numeric($argv[1]) ? (int)$argv[1] : 300;
$limitPerReferrer = isset($argv[2]) && is_numeric($argv[2]) ? (int)$argv[2] : 150;

try {
  $result = referrals_release_pending_global($limitReferrers, $limitPerReferrer);
  $out = [
    'ok' => true,
    'ts' => (new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get())))->format('Y-m-d H:i:s'),
    'result' => $result,
  ];
  echo json_encode($out, JSON_UNESCAPED_SLASHES), PHP_EOL;
} catch (Throwable $e) {
  $out = [
    'ok' => false,
    'error' => $e->getMessage(),
  ];
  echo json_encode($out, JSON_UNESCAPED_SLASHES), PHP_EOL;
  exit(1);
}
