<?php
declare(strict_types=1);

/* env from /etc/pay.env */
$ENV=[
  'PAYSTACK_PUBLIC'=>'','PAYSTACK_SECRET'=>'',
  'DB_DSN'=>'','DB_USER'=>'','DB_PASS'=>'',
  'NOPAID_GROUP'=>'nopaid','UNPAID_ADDRLIST'=>'HS_NOPAID','PAID_ADDRLIST'=>'HS_PAID',
  'DEFAULT_EMAIL_SUFFIX'=>'@wifi.nister.org','CURRENCY'=>'GHS','PLANS_JSON'=>'[]'
];
$envFile='/etc/pay.env';
if (is_readable($envFile)){
  foreach (file($envFile, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){
    if ($line===''||$line[0]==='#'||strpos($line,'=')===false) continue;
    [$k,$v]=array_map('trim', explode('=',$line,2)); $v=trim($v,"\"'");
    if(array_key_exists($k,$ENV)) $ENV[$k]=$v;
  }
}

/* db */
function pdo_conn(array $ENV): PDO {
  return new PDO($ENV['DB_DSN'],$ENV['DB_USER'],$ENV['DB_PASS'],[
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

  // Resolve DB params (ENV first, then process env, then safe fallbacks)
  $db_host = $ENV['DB_HOST'] ?? getenv('DB_HOST') ?: '127.0.0.1';
  $db_name = $ENV['DB_NAME'] ?? getenv('DB_NAME') ?: 'radius';
  $db_user = $ENV['DB_USER'] ?? getenv('DB_USER') ?: 'radius';
  $db_pass = $ENV['DB_PASS'] ?? getenv('DB_PASS') ?: 'BishopFelix@50Dolla'; // from your prior MySQL usage
  $db_dsn  = $ENV['DB_DSN']  ?? getenv('DB_DSN');
  if (!$db_dsn) $db_dsn = "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4";

  try {
    $PDO = new PDO(
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
    echo json_encode(['ok'=>false,'error'=>'db_connect_failed','detail'=>$e->getMessage()]);
    exit;
  }
}
/* ===== END PDO BOOTSTRAP ===== */
