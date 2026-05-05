<?php
declare(strict_types=1);

// Compatibility shim: the real implementation lives in lib/location.php.
require_once __DIR__.'/lib/location.php';

// This file should never be used as a public HTTP endpoint.
$script = (string)($_SERVER['SCRIPT_FILENAME'] ?? '');
if ($script !== '' && realpath($script) === __FILE__) {
  http_response_code(404);
  header('Content-Type: text/plain; charset=utf-8');
  echo "Not Found\n";
  exit;
}
