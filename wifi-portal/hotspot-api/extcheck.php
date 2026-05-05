<?php
declare(strict_types=1);

$allow = filter_var((string)(getenv('ALLOW_EXTCHECK') ?: ''), FILTER_VALIDATE_BOOLEAN);
$remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
$local = in_array($remote, ['127.0.0.1', '::1'], true);
if (!$allow && !$local) {
  http_response_code(404);
  header('Content-Type:text/plain; charset=utf-8');
  echo "Not Found\n";
  exit;
}

header('Content-Type:text/plain; charset=utf-8');
echo "SAPI=" . php_sapi_name() . "\n";
echo "pdo_mysql=" . (extension_loaded('pdo_mysql') ? 'yes' : 'no') . "\n";
