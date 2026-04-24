<?php
declare(strict_types=1);
require_once __DIR__.'/nister_pdo.php';
// ---- Nister DB config (single source of truth) ----
$__cfg = [];
$__cfg_path = '/etc/nister/radius_db.php';
if (is_readable($__cfg_path)) {
  $__cfg = require $__cfg_path;
  if (!is_array($__cfg)) $__cfg = [];
}

$db_host = $__cfg['host'] ?? '127.0.0.1';
$db_name = $__cfg['db']   ?? 'radius';
$db_user = $__cfg['user'] ?? 'radius';
$db_pass = $__cfg['pass'] ?? '';
/* env from /etc/pay.env */
$ENV=[
  'PAYSTACK_PUBLIC'=>'','PAYSTACK_SECRET'=>'',
  'DB_DSN'=>'','DB_USER'=>'','DB_PASS'=>'',
  'NOPAID_GROUP'=>'HS_NOPAID','UNPAID_ADDRLIST'=>'HS_NOPAID','PAID_ADDRLIST'=>'HS_ACTIVE',
  'DEFAULT_EMAIL_SUFFIX'=>'@wifi.nister.org','CURRENCY'=>'GHS','PLANS_JSON'=>'[]'
];
$envFile='/etc/pay.env';
if (is_readable($envFile)){
  foreach (file($envFile, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){
    if ($line===''||$line[0]==='#'||strpos($line,'=')===false) continue;
    [$k,$v]=array_map('trim', explode('=',$line,2)); $v=trim($v,"\"'");
    if($k!=='') $ENV[$k]=$v;
  }
}

/* db */
function pdo_conn(array $ENV): PDO {
  return new NisterPDO($ENV['DB_DSN'],$ENV['DB_USER'],$ENV['DB_PASS'],[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES=>false,
  ]);
}

/* plans from env only (simple, reliable) */
function plans_from_env(array $ENV): array {
  $raw=$ENV['PLANS_JSON'] ?? '[]';
  $arr=json_decode($raw,true);
  if(!is_array($arr)) return [];
  $out=[];
  foreach($arr as $p){
    if(!is_array($p)) continue;
    $out[]=[
      'id'        => (string)($p['id']??''),
      'name'      => (string)($p['name']??''),
      'cost'      => (float) ($p['cost']??0),
      'group'     => isset($p['group'])?(string)$p['group']:null,
      'time'      => isset($p['time'])?(string)$p['time']:null,
      'time_unit' => isset($p['time_unit'])?(string)$p['time_unit']:null,
    ];
  }
  return array_values(array_filter($out,fn($x)=>$x['id']!=='' && $x['name']!=='' && $x['cost']>0));
}

/* ===== BEGIN PDO BOOTSTRAP (idempotent) ===== */
if (!isset($PDO) || !($PDO instanceof PDO)) {
  // Load .env (simple parser)
  $ENV = $ENV ?? [];
  $envFile = __DIR__ . '/.env';
  if (is_file($envFile) && is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $ln) {
      if ($ln === '' || $ln[0] === '#') continue;
      $eq = strpos($ln, '=');
      if ($eq === false) continue;
      $k = trim(substr($ln, 0, $eq));
      $v = trim(substr($ln, $eq+1));
      $v = trim($v, "'\""); // strip quotes
      if ($k !== '') $ENV[$k] = $v;
    }
  }

  $pick = static function (...$values): string {
    foreach ($values as $value) {
      if ($value === null || $value === false) continue;
      $s = trim((string)$value);
      if ($s !== '') return $s;
    }
    return '';
  };

  // Resolve DB params with broad compatibility:
  // PAY_DB_* -> DB_* -> MYSQL_* -> RADIUS_* -> /etc/nister/radius_db.php
  $db_host = $pick(
    $ENV['PAY_DB_HOST'] ?? null,
    $ENV['DB_HOST'] ?? null,
    $ENV['RADIUS_HOST'] ?? null,
    getenv('PAY_DB_HOST'),
    getenv('DB_HOST'),
    getenv('RADIUS_HOST'),
    $__cfg['host'] ?? null,
    '127.0.0.1'
  );
  $db_name = $pick(
    $ENV['PAY_DB_NAME'] ?? null,
    $ENV['DB_NAME'] ?? null,
    $ENV['RADIUS_DB'] ?? null,
    getenv('PAY_DB_NAME'),
    getenv('DB_NAME'),
    getenv('RADIUS_DB'),
    $__cfg['db'] ?? null,
    'radius'
  );
  $db_user = $pick(
    $ENV['PAY_DB_USER'] ?? null,
    $ENV['DB_USER'] ?? null,
    $ENV['MYSQL_USER'] ?? null,
    $ENV['RADIUS_USER'] ?? null,
    getenv('PAY_DB_USER'),
    getenv('DB_USER'),
    getenv('MYSQL_USER'),
    getenv('RADIUS_USER'),
    $__cfg['user'] ?? null
  );
  $db_pass = $pick(
    $ENV['PAY_DB_PASS'] ?? null,
    $ENV['DB_PASS'] ?? null,
    $ENV['MYSQL_PASSWORD'] ?? null,
    $ENV['RADIUS_PASS'] ?? null,
    getenv('PAY_DB_PASS'),
    getenv('DB_PASS'),
    getenv('MYSQL_PASSWORD'),
    getenv('RADIUS_PASS'),
    $__cfg['pass'] ?? null
  );
  $db_dsn  = $pick(
    $ENV['PAY_DB_DSN'] ?? null,
    $ENV['DB_DSN'] ?? null,
    $ENV['MYSQL_DSN'] ?? null,
    $ENV['RADIUS_DSN'] ?? null,
    getenv('PAY_DB_DSN'),
    getenv('DB_DSN'),
    getenv('MYSQL_DSN'),
    getenv('RADIUS_DSN'),
    $__cfg['dsn'] ?? null
  );
  if (!$db_dsn) $db_dsn = "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4";
  // Keep resolved credentials available to downstream includes that read $ENV.
  $ENV['DB_DSN'] = $db_dsn;
  $ENV['DB_USER'] = $db_user;
  $ENV['DB_PASS'] = $db_pass;

  if ($db_user === '') {
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>'db_config_missing']);
    exit;
  }

  try {
    $PDO = new NisterPDO(
      $db_dsn, $db_user, $db_pass,
      [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
      ]
    );
  } catch (Throwable $e) {
    // Surface a clear error, but don't fatal the entire app
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>'db_connect_failed']);
    exit;
  }
}
/* ===== END PDO BOOTSTRAP ===== */
