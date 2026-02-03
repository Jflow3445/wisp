<?php
declare(strict_types=1);

require_once __DIR__.'/nister_pdo.php';
if (!function_exists('str_contains')) {
  function str_contains(string $haystack, string $needle): bool {
    return $needle === '' || strpos($haystack, $needle) !== false;
  }
}

if (!function_exists('str_starts_with')) {
  function str_starts_with(string $haystack, string $needle): bool {
    return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
  }
}

/** Load simple KEY=VALUE .env */
function env_load(string $path): array {
  if (!is_file($path) || !is_readable($path)) return [];
  $out=[];
  foreach (file($path, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line) {
    if (preg_match('~^\s*#~',$line)) continue;
    if (!str_contains($line,'=')) continue;
    [$k,$v]=array_map('trim',explode('=', $line, 2));
    $v=trim($v, " \t\n\r\0\x0B\"'");
    $out[$k]=$v;
  }
  return $out;
}

/** Boot app timezone/env */
function app_boot(): array {
  $paths = [
    '/etc/pay.env',
    __DIR__.'/../.env',
  ];
  $docroot = $_SERVER['DOCUMENT_ROOT'] ?? '';
  if ($docroot !== '') $paths[] = rtrim($docroot, "/\\") . '/.env';
  $paths[] = '/var/www/pay/.env';
  $env = [];
  foreach ($paths as $p) {
    $env = array_merge($env, env_load($p));
  }
  $tz = $env['APP_TIMEZONE'] ?? getenv('APP_TIMEZONE') ?? ($_ENV['APP_TIMEZONE'] ?? null);
  date_default_timezone_set($tz ?: 'Africa/Accra');
  return $env;
}

/** RADIUS DB params (dsn,user,pass) with /etc/nister/radius_db.php fallback */
function nister_radius_db_params(array $env): array {
  $cfg = [];
  $cfgPath = '/etc/nister/radius_db.php';
  if (is_readable($cfgPath)) {
    $tmp = require $cfgPath;
    if (is_array($tmp)) $cfg = $tmp;
  }

  $dsn = (string)($env['RADIUS_DSN'] ?? ($cfg['dsn'] ?? ''));
  $host = (string)($env['RADIUS_HOST'] ?? ($cfg['host'] ?? '127.0.0.1'));
  $db = (string)($env['RADIUS_DB'] ?? ($cfg['db'] ?? 'radius'));
  $user = (string)($env['RADIUS_USER'] ?? ($cfg['user'] ?? ''));
  $pass = (string)($env['RADIUS_PASS'] ?? ($cfg['pass'] ?? ''));

  // Allow generic DB_* overrides when RADIUS_* is missing
  if ($host === '') $host = (string)($env['DB_HOST'] ?? (getenv('DB_HOST') ?: '127.0.0.1'));
  if ($db === '')   $db   = (string)($env['DB_NAME'] ?? (getenv('DB_NAME') ?: 'radius'));
  if ($user === '') $user = (string)($env['DB_USER'] ?? (getenv('DB_USER') ?: ''));
  if ($pass === '') $pass = (string)($env['DB_PASS'] ?? (getenv('DB_PASS') ?: ''));

  if ($dsn === '') $dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";
  return [$dsn, $user, $pass];
}

/** DSN PDO for pay app */
function db_pdo(array $env): PDO {
  $get = static function(string $k) use ($env) {
    if (isset($env[$k]) && $env[$k] !== false && $env[$k] !== null) return $env[$k];
    if (isset($_ENV[$k]) && $_ENV[$k] !== false && $_ENV[$k] !== null) return $_ENV[$k];
    $v = getenv($k);
    return ($v === false) ? null : $v;
  };

  // Prefer PAY_DB_*, then DB_*, then MYSQL_*, else fall back to RADIUS_*
  $dsn  = (string)($get('PAY_DB_DSN') ?? $get('DB_DSN') ?? $get('MYSQL_DSN') ?? $get('RADIUS_DSN') ?? '');
  $user = (string)($get('PAY_DB_USER') ?? $get('DB_USER') ?? $get('MYSQL_USER') ?? $get('RADIUS_USER') ?? '');
  $pass = (string)($get('PAY_DB_PASS') ?? $get('DB_PASS') ?? $get('MYSQL_PASSWORD') ?? $get('RADIUS_PASS') ?? '');
  if ($dsn === '') {
    $host = $env['PAY_DB_HOST'] ?? getenv('PAY_DB_HOST') ?? ($_ENV['PAY_DB_HOST'] ?? '') ?? '';
    $name = $env['PAY_DB_NAME'] ?? getenv('PAY_DB_NAME') ?? ($_ENV['PAY_DB_NAME'] ?? '') ?? '';
    if ($host === '' || $name === '') {
      $host = $env['DB_HOST'] ?? getenv('DB_HOST') ?? ($_ENV['DB_HOST'] ?? '');
      $name = $env['DB_NAME'] ?? getenv('DB_NAME') ?? ($_ENV['DB_NAME'] ?? '');
    }
    if ($host === '') $host = '127.0.0.1';
    if ($name === '') $name = 'radius';
    $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";
  }
  if ($user === '') $user = 'radius';
  if ($pass === '') $pass = 'BishopFelix@50Dolla';
  if ($dsn === '' || $user === '') {
    throw new RuntimeException('DB not configured (DB_DSN/DB_USER)');
  }
    $opts = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_STRINGIFY_FETCHES  => false,
  ];
  if (defined('PDO::MYSQL_ATTR_MULTI_STATEMENTS')) {
    $opts[PDO::MYSQL_ATTR_MULTI_STATEMENTS] = false;
  }

  return new NisterPDO($dsn, $user, $pass, $opts);
}

/** JSON out + exit */
function json_out($data,int $code=200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  exit;
}

/** Read JSON body */
function body_json(): array {
  $raw=file_get_contents('php://input') ?: '';
  $j=json_decode($raw, true);
  return is_array($j)?$j:[];
}

/** Pull key from any array list, with default */
function from_any(array $srcs,string $k,$def=null){
  foreach($srcs as $s){ if(isset($s[$k]) && $s[$k] !== '') return $s[$k]; }
  return $def;
}

/** Ghana-friendly MSISDN normalizer -> digits only, 0xxxxxxxxx -> 233xxxxxxxxx */
function normalize_msisdn($raw) {
  $d = preg_replace('/\D+/', '', (string)$raw);
  if ($d === '') return '';

  // Strip leading international prefix "00"
  if (strpos($d, '00') === 0) $d = substr($d, 2);

  // Ghana canonical: 233 + 9 digits
  if (preg_match('/^2330(\d{9})$/', $d, $m)) return '233'.$m[1];     // 2330xxxxxxxxx -> 233xxxxxxxxx
  if (preg_match('/^0(\d{9})$/',    $d, $m)) return '233'.$m[1];     // 0xxxxxxxxx    -> 233xxxxxxxxx
  if (preg_match('/^233(\d{9})$/',  $d, $m)) return '233'.$m[1];     // already canonical

  // Salvage: if it contains ...233 + last 9 digits, use that
  if (preg_match('/233(\d{9})$/', $d, $m)) return '233'.$m[1];

  return $d;
}


/** Read truthy GET/POST flag */
function bool_param(string $k): bool {
  $v=$_GET[$k] ?? $_POST[$k] ?? null;
  if ($v===null) return false;
  if (is_string($v)) $v=strtolower($v);
  return in_array($v, [1,'1',true,'true','yes','y'], true);
}

/** Parse Bearer token */
function bearer_token(): ?string {
  $h=$_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? '';
  if (stripos($h,'bearer ')===0) return trim(substr($h,7));
  return null;
}

/** Enforce Bearer token match */
function require_bearer(string $expected): void {
  $tok=bearer_token();
  if (!$expected || !$tok || !hash_equals($expected,$tok)) {
    json_out(['ok'=>false,'error'=>'forbidden'], 403);
  }
}

// --- Local/E164 helpers (Ghana) ---
// Keep DB canonical as 233xxxxxxxxx, but display and RADIUS use local 0xxxxxxxxx.
if (!function_exists('msisdn_local')) {
  function msisdn_local(string $s): string {
    $d = preg_replace('/\D+/', '', $s);
    if ($d === '') return '';
    // 233xxxxxxxxx -> 0xxxxxxxxx (Ghana)
    if (str_starts_with($d, '233') && strlen($d) >= 12) {
      return '0' . substr($d, 3, 9); // keep 10-digit local
    }
    // Already local or something else; return digits unchanged
    return $d;
  }
}
if (!function_exists('msisdn_display')) {
  function msisdn_display(string $s): string {
    // For UI only – show 0-leading local for Ghana
    return msisdn_local($s);
  }
}
