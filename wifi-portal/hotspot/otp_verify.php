<?php
declare(strict_types=1);

// Canonical implementation lives under api/hotspot/otp_verify.php.
$shared = realpath(__DIR__ . '/../../api/hotspot/otp_verify.php');
if ($shared === false || !is_file($shared)) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode(['ok'=>false, 'error'=>'otp_verify_handler_unavailable'], JSON_UNESCAPED_SLASHES);
  exit;
}

require $shared;
