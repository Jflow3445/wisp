<?php
declare(strict_types=1);

// Canonical implementation lives under api/hotspot/reset_password.php.
$shared = realpath(__DIR__ . '/../../api/hotspot/reset_password.php');
if ($shared === false || !is_file($shared)) {
  http_response_code(500);
  header('Content-Type: text/plain; charset=utf-8');
  header('Cache-Control: no-store');
  echo "Password reset handler unavailable\n";
  exit;
}

require $shared;
