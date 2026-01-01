<?php
declare(strict_types=1);

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

/** DSN PDO for pay app */
function db_pdo(array $env): PDO {
  $dsn  = $env['DB_DSN'] ?? getenv('DB_DSN') ?? ($_ENV['DB_DSN'] ?? '');
  $user = $env['DB_USER'] ?? getenv('DB_USER') ?? ($_ENV['DB_USER'] ?? '');
  $pass = $env['DB_PASS'] ?? getenv('DB_PASS') ?? ($_ENV['DB_PASS'] ?? '');
  if ($dsn === '') {
    $host = $env['DB_HOST'] ?? getenv('DB_HOST') ?? ($_ENV['DB_HOST'] ?? '');
    $name = $env['DB_NAME'] ?? getenv('DB_NAME') ?? ($_ENV['DB_NAME'] ?? '');
    if ($host === '') $host = '127.0.0.1';
    if ($name === '') $name = 'radius';
    $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";
  }
  if ($user === '') $user = 'radius';
  if ($pass === '') $pass = 'BishopFelix@50Dolla';
  if ($dsn === '' || $user === '') {
    throw new RuntimeException('DB not configured (DB_DSN/DB_USER)');
  }
  return new PDO(
    $dsn,
    $user,
    $pass,
    [
      PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
    ]
  );
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
function normalize_msisdn(string $s): string {
  $d=preg_replace('/\D+/', '', $s);
  if ($d==='') return '';
  if (str_starts_with($d,'0') && strlen($d)>=10) {
    $d='233'.substr($d,1);
  }
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
