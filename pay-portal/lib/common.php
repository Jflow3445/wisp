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
  if ($dsn === '' || $user === '' || $pass === '') {
    throw new RuntimeException('DB not configured (DB_DSN/DB_USER/DB_PASS)');
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

if (!function_exists('nister_trusted_proxy_cidrs')) {
  function nister_trusted_proxy_cidrs(array $env = []): array {
    $raw = (string)($env['TRUSTED_PROXY_CIDRS'] ?? $env['TRUSTED_PROXIES'] ?? '');
    if ($raw === '') {
      $raw = (string)(getenv('TRUSTED_PROXY_CIDRS') ?: getenv('TRUSTED_PROXIES') ?: '');
    }
    $out = [
      '127.0.0.1/32' => true,
      '::1/128' => true,
    ];
    if ($raw !== '') {
      $parts = preg_split('/[\s,]+/', $raw) ?: [];
      foreach ($parts as $p) {
        $p = trim((string)$p);
        if ($p === '') continue;
        $out[$p] = true;
      }
    }
    return array_keys($out);
  }
}

if (!function_exists('nister_ip_in_cidr')) {
  function nister_ip_in_cidr(string $ip, string $cidr): bool {
    $ip = trim($ip);
    $cidr = trim($cidr);
    if ($ip === '' || $cidr === '') return false;
    if (strpos($cidr, '/') === false) {
      return strcasecmp($ip, $cidr) === 0;
    }
    [$subnet, $bitsRaw] = explode('/', $cidr, 2);
    $subnet = trim($subnet);
    $bits = (int)$bitsRaw;
    $ipBin = @inet_pton($ip);
    $subBin = @inet_pton($subnet);
    if ($ipBin === false || $subBin === false) return false;
    if (strlen($ipBin) !== strlen($subBin)) return false;
    $maxBits = strlen($ipBin) * 8;
    if ($bits < 0 || $bits > $maxBits) return false;
    $bytes = intdiv($bits, 8);
    $remain = $bits % 8;
    if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subBin, 0, $bytes)) {
      return false;
    }
    if ($remain === 0) return true;
    $mask = (~((1 << (8 - $remain)) - 1)) & 0xFF;
    return ((ord($ipBin[$bytes]) & $mask) === (ord($subBin[$bytes]) & $mask));
  }
}

if (!function_exists('nister_ip_in_cidrs')) {
  function nister_ip_in_cidrs(string $ip, array $cidrs): bool {
    foreach ($cidrs as $cidr) {
      if (nister_ip_in_cidr($ip, (string)$cidr)) return true;
    }
    return false;
  }
}

if (!function_exists('nister_client_ip')) {
  function nister_client_ip(array $env = []): string {
    $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (!filter_var($remote, FILTER_VALIDATE_IP)) return '';
    $trusted = nister_trusted_proxy_cidrs($env);
    if (!nister_ip_in_cidrs($remote, $trusted)) return $remote;

    $xff = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xff !== '') {
      foreach (explode(',', $xff) as $part) {
        $part = trim((string)$part);
        if (filter_var($part, FILTER_VALIDATE_IP)) return $part;
      }
    }
    $xri = trim((string)($_SERVER['HTTP_X_REAL_IP'] ?? ''));
    if (filter_var($xri, FILTER_VALIDATE_IP)) return $xri;
    return $remote;
  }
}

if (!function_exists('nister_rate_limit_dir')) {
  function nister_rate_limit_dir(): string {
    $dir = rtrim(sys_get_temp_dir(), "/\\") . '/nister-rate-limit';
    if (!is_dir($dir)) {
      @mkdir($dir, 0700, true);
    }
    return $dir;
  }
}

if (!function_exists('nister_rate_limit_path')) {
  function nister_rate_limit_path(string $scope, string $key): string {
    $scope = strtolower(trim($scope));
    $scope = preg_replace('/[^a-z0-9._-]+/', '_', $scope) ?: 'default';
    $hash = hash('sha256', $key);
    return nister_rate_limit_dir() . '/' . $scope . '-' . $hash . '.json';
  }
}

if (!function_exists('nister_rate_limit_read_state')) {
  function nister_rate_limit_read_state(string $path): array {
    $raw = @file_get_contents($path);
    $j = is_string($raw) ? json_decode($raw, true) : null;
    $attempts = [];
    if (is_array($j) && isset($j['attempts']) && is_array($j['attempts'])) {
      foreach ($j['attempts'] as $ts) {
        if (is_int($ts) || ctype_digit((string)$ts)) $attempts[] = (int)$ts;
      }
    }
    $lockUntil = 0;
    if (is_array($j) && isset($j['lock_until']) && (is_int($j['lock_until']) || ctype_digit((string)$j['lock_until']))) {
      $lockUntil = (int)$j['lock_until'];
    }
    return ['attempts' => $attempts, 'lock_until' => max(0, $lockUntil)];
  }
}

if (!function_exists('nister_rate_limit_write_state')) {
  function nister_rate_limit_write_state(string $path, array $state): void {
    $payload = [
      'attempts' => array_values(array_map('intval', (array)($state['attempts'] ?? []))),
      'lock_until' => (int)($state['lock_until'] ?? 0),
    ];
    @file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES), LOCK_EX);
  }
}

if (!function_exists('nister_rate_limit_allow')) {
  function nister_rate_limit_allow(
    string $scope,
    string $key,
    int $maxAttempts = 5,
    int $windowSec = 300,
    int $lockoutSec = 900
  ): array {
    $maxAttempts = max(1, $maxAttempts);
    $windowSec = max(1, $windowSec);
    $lockoutSec = max(1, $lockoutSec);
    $path = nister_rate_limit_path($scope, $key);
    $state = nister_rate_limit_read_state($path);
    $now = time();
    $cutoff = $now - $windowSec;
    $attempts = array_values(array_filter((array)$state['attempts'], static fn($ts): bool => (int)$ts > $cutoff));
    $lockUntil = (int)($state['lock_until'] ?? 0);

    if ($lockUntil <= $now && count($attempts) >= $maxAttempts) {
      $lockUntil = $now + $lockoutSec;
    }

    $state['attempts'] = $attempts;
    $state['lock_until'] = $lockUntil;
    nister_rate_limit_write_state($path, $state);

    if ($lockUntil > $now) {
      return [
        'allowed' => false,
        'retry_after' => max(1, $lockUntil - $now),
        'remaining' => 0,
      ];
    }

    $remaining = max(0, $maxAttempts - count($attempts));
    return [
      'allowed' => true,
      'retry_after' => 0,
      'remaining' => $remaining,
    ];
  }
}

if (!function_exists('nister_rate_limit_hit')) {
  function nister_rate_limit_hit(
    string $scope,
    string $key,
    int $maxAttempts = 5,
    int $windowSec = 300,
    int $lockoutSec = 900
  ): array {
    $maxAttempts = max(1, $maxAttempts);
    $windowSec = max(1, $windowSec);
    $lockoutSec = max(1, $lockoutSec);
    $path = nister_rate_limit_path($scope, $key);
    $state = nister_rate_limit_read_state($path);
    $now = time();
    $cutoff = $now - $windowSec;
    $attempts = array_values(array_filter((array)$state['attempts'], static fn($ts): bool => (int)$ts > $cutoff));
    $attempts[] = $now;
    $lockUntil = (int)($state['lock_until'] ?? 0);
    if (count($attempts) >= $maxAttempts) {
      $lockUntil = $now + $lockoutSec;
    }
    $state['attempts'] = $attempts;
    $state['lock_until'] = $lockUntil;
    nister_rate_limit_write_state($path, $state);
    return [
      'allowed' => $lockUntil <= $now,
      'retry_after' => ($lockUntil > $now) ? max(1, $lockUntil - $now) : 0,
      'remaining' => max(0, $maxAttempts - count($attempts)),
    ];
  }
}

if (!function_exists('nister_rate_limit_clear')) {
  function nister_rate_limit_clear(string $scope, string $key): void {
    $path = nister_rate_limit_path($scope, $key);
    if (is_file($path)) {
      @unlink($path);
    }
  }
}

if (!function_exists('nister_same_host')) {
  function nister_same_host(string $a, string $b): bool {
    $a = strtolower(trim($a));
    $b = strtolower(trim($b));
    if ($a === '' || $b === '') return false;
    return hash_equals($a, $b);
  }
}

if (!function_exists('nister_request_matches_host')) {
  function nister_request_matches_host(string $url, string $expectedHost): bool {
    if ($url === '' || $expectedHost === '') return false;
    $parts = parse_url($url);
    if (!is_array($parts)) return false;
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($host === '') return false;
    return nister_same_host($host, strtolower($expectedHost));
  }
}

if (!function_exists('nister_is_same_origin_request')) {
  function nister_is_same_origin_request(): bool {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) return true;

    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return false;
    if (strpos($host, ':') !== false) {
      $host = strtolower((string)parse_url('http://' . $host, PHP_URL_HOST));
    }
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '') return nister_request_matches_host($origin, $host);
    $referer = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
    if ($referer !== '') return nister_request_matches_host($referer, $host);
    return false;
  }
}

if (!function_exists('nister_require_cli_or_token')) {
  function nister_require_cli_or_token(array $env, string $tokenKey = 'CRON_HTTP_TOKEN'): void {
    if (PHP_SAPI === 'cli') return;
    $expected = trim((string)($env[$tokenKey] ?? ''));
    if ($expected === '') {
      $tmp = getenv($tokenKey);
      if ($tmp !== false) $expected = trim((string)$tmp);
    }
    if ($expected === '') {
      $expected = trim((string)($_ENV[$tokenKey] ?? ''));
    }
    $provided = trim((string)($_SERVER['HTTP_X_CRON_TOKEN'] ?? ($_POST['token'] ?? $_GET['token'] ?? '')));
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
      json_out(['ok' => false, 'error' => 'forbidden'], 403);
    }
  }
}
