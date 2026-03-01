<?php
declare(strict_types=1);

/**
 * Resolve pay-portal library paths across common deployments:
 * - repo/dev:        .../api/hotspot -> .../pay-portal/lib
 * - prod variant A:  /var/www/html/hotspot -> /var/www/pay/lib
 * - prod variant B:  /var/www/html/hotspot -> /var/www/pay-portal/lib
 */
function hotspot_paylib_dirs(): array {
  $dirs = [
    __DIR__ . '/../../pay-portal/lib',
    __DIR__ . '/../../pay/lib',
    dirname(__DIR__, 3) . '/pay-portal/lib',
    dirname(__DIR__, 3) . '/pay/lib',
  ];

  $out = [];
  foreach ($dirs as $d) {
    $real = realpath($d);
    if ($real === false || !is_dir($real)) continue;
    $out[$real] = true;
  }
  return array_keys($out);
}

function hotspot_require_paylib(string $file): void {
  $file = ltrim($file, '/');
  foreach (hotspot_paylib_dirs() as $dir) {
    $path = $dir . '/' . $file;
    if (is_readable($path)) {
      require_once $path;
      return;
    }
  }
  throw new RuntimeException('pay lib not found: ' . $file);
}

function hotspot_include_paylib(string $file): bool {
  $file = ltrim($file, '/');
  foreach (hotspot_paylib_dirs() as $dir) {
    $path = $dir . '/' . $file;
    if (is_readable($path)) {
      require_once $path;
      return true;
    }
  }
  return false;
}
