<?php declare(strict_types=1);

/**
 * NISTER Hotspot Status API (clean + deterministic)
 *
 * - DB creds from /etc/nister/radius_db.php (optional env overrides)
 * - Resolves group across 0/233 username variants
 * - plan_name from Nister-Plan-Name else resolved group
 * - quota_bytes from Nister-Quota-Bytes or Mikrotik hi/lo (Gigawords + Total-Limit)
 * - used_bytes from radacct (schema-tolerant)
 * - can_browse = paid && !expired && !exhausted && !policy_limited
 *
 * Params:
 *   username=... (required)
 *   days=30      (optional)
 *   plain=1      (optional: returns PAID/NOPAID based on can_browse)
 *   diag=1       (optional)
 *   callback=... (optional: JSONP)
 */

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$API_VERSION = '2026-01-07b';

function truthy(string $v): bool {
  $v = strtolower(trim($v));
  return ($v !== '' && !in_array($v, ['0','false','no','off'], true));
}

function jexit(array $payload): void {
  if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Access-Control-Allow-Origin: *');
    header('Vary: Origin');
    header('Content-Type: application/json; charset=utf-8');
  }
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

function pexit(string $s): void {
  if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Content-Type: text/plain; charset=utf-8');
  }
  echo $s, "\n";
  exit;
}

function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '' || $d === null) return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/',   $d)) return ['233' . substr($d, 1), $d];
  return [$d];
}

function load_db_cfg(): array {
  $cfg = [
    'host' => '127.0.0.1',
    'db'   => 'radius',
    'user' => 'radius',
    'pass' => '',
  ];

  $path = '/etc/nister/radius_db.php';
  if (is_readable($path)) {
    $tmp = require $path;
    if (is_array($tmp)) $cfg = array_merge($cfg, $tmp);
  }

  // Optional overrides (Apache SetEnv / system env)
  foreach (['DB_HOST'=>'host','DB_NAME'=>'db','DB_USER'=>'user','DB_PASS'=>'pass'] as $env => $k) {
    $v = getenv($env);
    if ($v !== false && $v !== '') $cfg[$k] = $v;
  }

  return $cfg;
}

function pdo_connect(array $cfg): PDO {
  $opts = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ];

  // Prefer unix socket on Debian/Ubuntu; fallback to TCP
  $sockDsn = "mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname={$cfg['db']};charset=utf8mb4";
  try {
    return new PDO($sockDsn, (string)$cfg['user'], (string)$cfg['pass'], $opts);
  } catch (Throwable $e) {
    $tcpDsn  = "mysql:host={$cfg['host']};dbname={$cfg['db']};charset=utf8mb4";
    return new PDO($tcpDsn, (string)$cfg['user'], (string)$cfg['pass'], $opts);
  }
}

function resolve_group(PDO $pdo, string $u1, string $u2): ?string {
  // Prefer an actual plan group over HS_* helper groups.
  $st = $pdo->prepare("
    SELECT groupname, priority
      FROM radusergroup
     WHERE username IN (:a,:b)
  ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
  ");
  $st->execute([':a'=>$u1, ':b'=>$u2]);

  $groups = [];
  foreach ($st as $row) {
    $g = (string)($row['groupname'] ?? '');
    if ($g !== '') $groups[] = $g;
  }
  if (!$groups) return null;

  foreach ($groups as $g) {
    if (strtolower($g) !== 'nopaid' && !preg_match('/^hs_/i', $g)) return $g;
  }
  foreach ($groups as $g) {
    if (strtolower($g) !== 'nopaid') return $g;
  }
  return $groups[0] ?? null;
}

function fetch_user_attrs(PDO $pdo, string $u1, string $u2): array {
  $st = $pdo->prepare("SELECT attribute, value FROM radreply WHERE username IN (:a,:b)");
  $st->execute([':a'=>$u1, ':b'=>$u2]);
  $out = [];
  foreach ($st as $row) $out[(string)$row['attribute']] = (string)$row['value'];
  return $out;
}

function fetch_group_attrs(PDO $pdo, string $u1, string $u2): array {
  // First attribute by priority wins (closest to priority=0 wins)
  $out = [];
  $st = $pdo->prepare("
    SELECT rug.groupname, rug.priority, rgr.attribute, rgr.value
      FROM radusergroup AS rug
      JOIN radgroupreply AS rgr ON rgr.groupname = rug.groupname
     WHERE rug.username IN (:a,:b)
  ORDER BY (rug.groupname='nopaid') ASC, rug.priority ASC, rug.groupname ASC
  ");
  $st->execute([':a'=>$u1, ':b'=>$u2]);
  foreach ($st as $row) {
    $k = (string)$row['attribute'];
    if (!array_key_exists($k, $out)) $out[$k] = (string)$row['value'];
  }

  $st = $pdo->prepare("
    SELECT rug.groupname, rug.priority, rgc.attribute, rgc.value
      FROM radusergroup AS rug
      JOIN radgroupcheck AS rgc ON rgc.groupname = rug.groupname
     WHERE rug.username IN (:a,:b)
  ORDER BY (rug.groupname='nopaid') ASC, rug.priority ASC, rug.groupname ASC
  ");
  $st->execute([':a'=>$u1, ':b'=>$u2]);
  foreach ($st as $row) {
    $k = (string)$row['attribute'];
    if (!array_key_exists($k, $out)) $out[$k] = (string)$row['value'];
  }
  return $out;
}

function fetch_expiration(PDO $pdo, string $u1, string $u2): ?string {
  // Expiration is typically stored in radcheck
  $st = $pdo->prepare("SELECT value FROM radcheck WHERE username=? AND attribute='Expiration' LIMIT 1");
  foreach (array_unique([$u1, $u2]) as $u) {
    if ($u === '') continue;
    $st->execute([$u]);
    $v = $st->fetchColumn();
    if ($v !== false && $v !== null && (string)$v !== '') return (string)$v;
  }
  return null;
}

function quota_bytes_from_attrs(array $attrs): ?int {
  if (isset($attrs['Nister-Quota-Bytes']) && trim((string)$attrs['Nister-Quota-Bytes']) !== '') {
    return (int)$attrs['Nister-Quota-Bytes'];
  }

  $hi = null; $lo = null;
  if (isset($attrs['Mikrotik-Total-Limit-Gigawords']) && trim((string)$attrs['Mikrotik-Total-Limit-Gigawords']) !== '') {
    $hi = (int)$attrs['Mikrotik-Total-Limit-Gigawords'];
  }
  if (isset($attrs['Mikrotik-Total-Limit']) && trim((string)$attrs['Mikrotik-Total-Limit']) !== '') {
    $lo = (int)$attrs['Mikrotik-Total-Limit'];
  }

  if ($hi !== null || $lo !== null) {
    $hi = $hi ?? 0;
    $lo = $lo ?? 0;
    return (int)(($hi * 4294967296) + $lo);
  }

  return null;
}

function compute_used_bytes(PDO $pdo, string $u1, string $u2, string $pstart): int {
  $base = "(COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0))";

  $candidates = [
    $base . " + COALESCE(acctinputoctetsgigawords,0) * 4294967296 + COALESCE(acctoutputoctetsgigawords,0) * 4294967296",
    $base . " + COALESCE(acctinputgigawords,0) * 4294967296 + COALESCE(acctoutputgigawords,0) * 4294967296",
    $base,
  ];

  foreach ($candidates as $sumExpr) {
    try {
      // Important: we DO NOT include open sessions started before periodStart (prevents huge overcount across renewals)
      $sql = "SELECT COALESCE(SUM($sumExpr), 0) AS used_bytes
                FROM radacct
               WHERE username IN (:a,:b)
                 AND (
                       (acctstarttime IS NOT NULL AND acctstarttime >= :pstart)
                    OR (acctstoptime  IS NOT NULL AND acctstoptime  >= :pstart)
                 )";
      $st = $pdo->prepare($sql);
      $st->execute([':a'=>$u1, ':b'=>$u2, ':pstart'=>$pstart]);
      return (int)($st->fetchColumn() ?: 0);
    } catch (Throwable $e) {
      // try next candidate
    }
  }

  // Final fallback: no window
  try {
    $sql2 = "SELECT COALESCE(SUM($base), 0) AS used_bytes
               FROM radacct
              WHERE username IN (:a,:b)";
    $st2 = $pdo->prepare($sql2);
    $st2->execute([':a'=>$u1, ':b'=>$u2]);
    return (int)($st2->fetchColumn() ?: 0);
  } catch (Throwable $e) {
    return 0;
  }
}

/* ------------------------- INPUTS ------------------------- */

$username = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
if ($username === '') jexit(['ok'=>false,'error'=>'missing_username']);

$days      = isset($_GET['days']) ? max(1, (int)$_GET['days']) : 30;
$wantPlain = isset($_GET['plain']) && truthy((string)$_GET['plain']);
$wantDiag  = isset($_GET['diag'])  && truthy((string)$_GET['diag']);

$vars = username_variants($username);
$u1 = $vars[0];
$u2 = $vars[1] ?? $vars[0];

$cfg = load_db_cfg();

try {
  $pdo = pdo_connect($cfg);
} catch (Throwable $e) {
  if ($wantPlain) pexit("NOPAID");
  jexit(['ok'=>false,'error'=>'db_connect_failed']);
}

$group = null;
try { $group = resolve_group($pdo, $u1, $u2); } catch (Throwable $e) { $group = null; }

$userAttrs  = [];
$groupAttrs = [];
try { $userAttrs  = fetch_user_attrs($pdo, $u1, $u2); } catch (Throwable $e) { $userAttrs = []; }
try { $groupAttrs = fetch_group_attrs($pdo, $u1, $u2); } catch (Throwable $e) { $groupAttrs = []; }

// merged: user overrides group
$attrs = $groupAttrs;
foreach ($userAttrs as $k => $v) $attrs[$k] = $v;

// Expiration (prefer radcheck)
$expRaw = null;
try { $expRaw = fetch_expiration($pdo, $u1, $u2); } catch (Throwable $e) { $expRaw = null; }
if ($expRaw === null && isset($attrs['Expiration']) && trim((string)$attrs['Expiration']) !== '') {
  $expRaw = (string)$attrs['Expiration'];
}

$tz = new DateTimeZone('Africa/Accra');
$expiry = null;
if ($expRaw !== null && trim($expRaw) !== '') {
  $ts = strtotime($expRaw);
  if ($ts !== false) {
    $expiry = new DateTime('@' . $ts);
    $expiry->setTimezone($tz);
  }
}

$now = new DateTime('now', $tz);
$durationDays = $days;
if (isset($attrs['Nister-Duration-Days']) && trim((string)$attrs['Nister-Duration-Days']) !== '') {
  $cand = (int)$attrs['Nister-Duration-Days'];
  if ($cand > 0) $durationDays = $cand;
}
$periodStart = ($expiry instanceof DateTime)
  ? (clone $expiry)->modify("-{$durationDays} days")
  : (clone $now)->modify("-{$durationDays} days");

$quotaBytes = quota_bytes_from_attrs($attrs);
$usedBytes  = compute_used_bytes($pdo, $u1, $u2, $periodStart->format('Y-m-d H:i:s'));

$expired   = ($expiry instanceof DateTime) ? ($expiry <= $now) : false;
$exhausted = ($quotaBytes !== null) ? ($usedBytes >= $quotaBytes) : false;

$addrListAttr = null;
if (isset($attrs['Mikrotik-Address-List']) && trim((string)$attrs['Mikrotik-Address-List']) !== '') {
  $addrListAttr = (string)$attrs['Mikrotik-Address-List'];
} elseif (isset($attrs['MT-Address-List']) && trim((string)$attrs['MT-Address-List']) !== '') {
  $addrListAttr = (string)$attrs['MT-Address-List'];
}
$policyLimited = false;
if ($addrListAttr !== null) {
  $al = strtoupper($addrListAttr);
  if (in_array($al, ['HS_LIMITED','HS_NOPAID'], true)) $policyLimited = true;
}
if ($group !== null && in_array(strtoupper((string)$group), ['HS_LIMITED','HS_NOPAID'], true)) {
  $policyLimited = true;
}

// Paid heuristic:
// - If group exists and not nopaid => paid
// - Or if expiry/quota exists => paid (covers no-group setups)
$paid = false;
if ($group !== null && $group !== '' && strtolower($group) !== 'nopaid') $paid = true;
if (!$paid && ($expiry instanceof DateTime || $quotaBytes !== null)) $paid = true;

$canBrowse = $paid && !$expired && !$exhausted && !$policyLimited;

if ($wantPlain) {
  pexit($canBrowse ? "PAID" : "NOPAID");
}

$GROUP = ($group !== null && $group !== '') ? $group : 'nopaid';
$PLAN  = (isset($attrs['Nister-Plan-Name']) && trim((string)$attrs['Nister-Plan-Name']) !== '')
  ? (string)$attrs['Nister-Plan-Name']
  : $GROUP;

$rate = $attrs['Mikrotik-Rate-Limit'] ?? null;

$out = [
  'ok'               => true,
  'version'          => $API_VERSION,
  'username'         => $username,
  'state'            => $paid ? 'PAID' : 'UNPAID',
  'can_browse'       => $canBrowse,

  'plan_name'        => $PLAN,
  'group'            => $GROUP,
  'rate'             => $rate,

  // Always aligned with can_browse
  'addrlist'         => $addrListAttr ?? ($canBrowse ? 'HS_ACTIVE' : 'HS_LIMITED'),

  'quota_bytes'      => $quotaBytes, // null => Unlimited
  'used_bytes'       => $usedBytes,

  'period_start_str' => $periodStart->format('Y-m-d H:i:s T'),
  'expiry_str'       => $expiry ? $expiry->format('Y-m-d H:i:s T') : null,
];

if ($wantDiag) {
  $out['diag'] = [
    'u1' => $u1,
    'u2' => $u2,
    'group_resolved' => $group,
    'expiry_raw' => $expRaw,
    'expired' => $expired,
    'exhausted' => $exhausted,
    'db_cfg_loaded' => is_readable('/etc/nister/radius_db.php'),
    'db_host' => $cfg['host'] ?? null,
    'db_name' => $cfg['db'] ?? null,
    'db_user' => $cfg['user'] ?? null,
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? null,
    'time_utc' => gmdate('c'),
  ];
}

// Optional JSONP (sanitized)
$cb = isset($_GET['callback']) ? preg_replace('/[^a-zA-Z0-9_\.$]/', '', (string)$_GET['callback']) : '';
if ($cb !== '') {
  if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Content-Type: application/javascript; charset=utf-8');
  }
  echo $cb, '(', json_encode($out, JSON_UNESCAPED_SLASHES), ');';
  exit;
}

jexit($out);
