<?php
declare(strict_types=1);

function hotspot_radius_db_params(): array {
  $cfg = [];
  $cfgPath = '/etc/nister/radius_db.php';
  if (is_readable($cfgPath)) {
    $tmp = require $cfgPath;
    if (is_array($tmp)) $cfg = $tmp;
  }

  $dsn  = (string)(getenv('RADIUS_DSN') ?: ($cfg['dsn'] ?? ''));
  $host = (string)(getenv('RADIUS_HOST') ?: ($cfg['host'] ?? '127.0.0.1'));
  $db   = (string)(getenv('RADIUS_DB') ?: ($cfg['db'] ?? 'radius'));
  $user = (string)(getenv('RADIUS_USER') ?: ($cfg['user'] ?? ''));
  $pass = (string)(getenv('RADIUS_PASS') ?: ($cfg['pass'] ?? ''));

  if ($host === '') $host = (string)(getenv('DB_HOST') ?: '127.0.0.1');
  if ($db === '')   $db   = (string)(getenv('DB_NAME') ?: 'radius');
  if ($user === '') $user = (string)(getenv('DB_USER') ?: '');
  if ($pass === '') $pass = (string)(getenv('DB_PASS') ?: '');

  if ($dsn === '') $dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";
  return [$dsn, $user, $pass];
}

function hotspot_radius_pdo(): PDO {
  [$dsn, $user, $pass] = hotspot_radius_db_params();
  if ($dsn === '' || $user === '') {
    throw new RuntimeException('RADIUS DB not configured');
  }
  return new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
}
