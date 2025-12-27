<?php
declare(strict_types=1);
if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}
// -- Nister helper: username variants (canonical 233… and local 0…)
if (!function_exists('nister_username_variants')) {
  function nister_username_variants(string $u): array {
    $d = preg_replace('/\D+/', '', $u);
    if (preg_match('/^233\d{9}$/', $d)) return [$d, '0'.substr($d,3)];
    if (preg_match('/^0\d{9}$/',   $d)) return ['233'.substr($d,1), $d];
    return [$u];
  }
}

// -- Nister helper: resolve effective group across both variants; 'nopaid' is lowest priority
if (!function_exists('nister_resolve_group')) {
  function nister_resolve_group(PDO $pdo, string $username): ?string {
    $v = nister_username_variants($username);
    $u1 = $v[0];
    $u2 = $v[1] ?? $v[0];
    $st = $pdo->prepare(
      "SELECT groupname
         FROM radusergroup
        WHERE username IN (:a,:b)
     ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
        LIMIT 1"
    );
    $st->execute([':a'=>$u1, ':b'=>$u2]);
    $g = $st->fetchColumn();
    return $g !== false ? (string)$g : null;
  }
}

// -- Nister output filter: on final JSON, fix group/plan_name using variant-aware resolver
if (!defined('NISTER_JSON_FILTER')) {
  define('NISTER_JSON_FILTER', 1);
  $GLOBALS['__NISTER_USER'] = $_GET['username'] ?? '';
  ob_start(function (string $buf): string {
    $data = json_decode($buf, true);
    if (!is_array($data)) return $buf;
    $u = $GLOBALS['__NISTER_USER'] ?? '';
    if ($u === '') return $buf;
    try {
      // local PDO (don’t rely on outer scope)
      $pdo = new PDO('mysql:host=localhost;dbname=radius;charset=utf8mb4',
                     'radius','BishopFelix@50Dolla',
                     [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
                      PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
      $g = nister_resolve_group($pdo, $u);
      if ($g) {
        $data['group'] = $g;
        // If your plan_name is group-driven, mirror it; otherwise map as needed.
        if (isset($data['plan_name'])) $data['plan_name'] = $g;
      }
// ---- NISTER: unified can_browse gating ----
$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$expired = false;
$exhausted = false;

$expRaw = isset($data['expiry_str']) ? trim((string)$data['expiry_str']) : '';
if ($expRaw !== '') {
    $tz = new DateTimeZone('UTC');
    $formats = [
        DateTimeInterface::RFC1123,      // "Tue, 04 Nov 2025 23:59:59 GMT"
        'Y-m-d H:i:s \G\M\T',            // "2025-12-04 23:59:59 GMT"
        'M d Y H:i:s',                   // "Dec 04 2025 23:59:59"
        'Y-m-d H:i:s'                    // "2025-12-04 23:59:59"
    ];
    $exp = null;
    foreach ($formats as $fmt) {
        $dt = DateTimeImmutable::createFromFormat($fmt, $expRaw, $tz);
        if ($dt instanceof DateTimeImmutable) { $exp = $dt; break; }
    }
    if (!$exp) {
        try { $exp = new DateTimeImmutable($expRaw, $tz); } catch (\Throwable $e) { $exp = null; }
    }
    if ($exp instanceof DateTimeImmutable) $expired = ($now >= $exp);
}

$qb = $data['quota_bytes'] ?? null;
$ub = $data['used_bytes']  ?? null;
if (is_numeric($qb) && is_numeric($ub) && $qb > 0) {
    $exhausted = ($ub >= $qb);
}

$statePaid = (isset($data['state']) && $data['state'] === 'PAID');
$data['can_browse'] = ($statePaid && !$expired && !$exhausted);

// Keep plain=1 aligned with can_browse
if (!headers_sent() && isset($_GET['plain'])) {
    header('Content-Type: text/plain; charset=utf-8');
    echo $data['can_browse'] ? 'PAID' : 'NOPAID';
    exit;
}
// ---- /NISTER can_browse gating ----
// ---- NISTER: add authoritative display helpers ----
if (is_array($data)) {
    $GB = 1024*1024*1024;
    $qb = isset($data['quota_bytes']) && is_numeric($data['quota_bytes']) ? (int)$data['quota_bytes'] : null;
    $ub = isset($data['used_bytes'])  && is_numeric($data['used_bytes'])  ? (int)$data['used_bytes']  : 0;
    if ($qb !== null) {
        if ($ub < 0) $ub = 0;
        if ($qb < 0) $qb = 0;
        $rem = max(0, $qb - $ub);
        $data['quota_gb']        = round($qb / $GB, 2);
        $data['used_gb']         = round($ub / $GB, 2);
        $data['remaining_bytes'] = $rem;
        $data['remaining_gb']    = round($rem / $GB, 2);
    }
}
// ---- /NISTER helpers ----
return json_encode($data, JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
      return $buf; // never break output
    }
  });
}
// -- Nister helper: username variants (canonical 233… and local 0…)
if (!function_exists('nister_username_variants')) {
  function nister_username_variants(string $u): array {
    $d = preg_replace('/\D+/', '', $u);
    if (preg_match('/^233\d{9}$/', $d)) return [$d, '0'.substr($d,3)];
    if (preg_match('/^0\d{9}$/',   $d)) return ['233'.substr($d,1), $d];
    return [$u];
  }
}
/**
 * NISTER Hotspot Status API (robust + schema autodetect + priority-aware)
 * Path: /var/www/html/hotspot-api/status.php
 *
 * Returns JSON for the MikroTik status page to display:
 * - plan_name / group
 * - rate (Mikrotik-Rate-Limit)
 * - addrlist (Mikrotik-Address-List)
 * - quota_bytes, used_bytes
 * - period_start_str, expiry_str
 * - state (PAID/UNPAID), can_browse
 *
 * Input:
 *   GET username=...   (required)
 *   GET days=30        (optional; billing window length)
 *   GET realm=...      (optional; reserved)
 */// ------------------------ CONFIG ------------------------
$DB_NAME = 'radius';
$DB_USER = 'radius';
$DB_PASS = 'BishopFelix@50Dolla';
$DB_HOST = 'localhost';                 // reference only when using socket DSN
$BILLING_DAYS_DEFAULT = 30;             // calendar days
$TIMEZONE = 'Africa/Accra';             // output timezone

// --- Nister: final JSON corrector (group, plan_name, quota_bytes from group hi/lo) ---
if (!function_exists('nister_username_variants')) {
  function nister_username_variants(string $u): array {
    $d = preg_replace('/\D+/', '', $u);
    if (preg_match('/^233\d{9}$/', $d)) return [$d, '0'.substr($d,3)];
    if (preg_match('/^0\d{9}$/',   $d)) return ['233'.substr($d,1), $d];
    return [$u];
  }
}

if (!function_exists('nister_resolve_group')) {
  function nister_resolve_group(PDO $pdo, string $username): ?string {
    $v = nister_username_variants($username);
    $u1 = $v[0];
    $u2 = $v[1] ?? $v[0];
    $st = $pdo->prepare(
      "SELECT groupname
         FROM radusergroup
        WHERE username IN (:a,:b)
     ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
        LIMIT 1"
    );
    $st->execute([':a'=>$u1, ':b'=>$u2]);
    $g = $st->fetchColumn();
    return $g !== false ? (string)$g : null;
  }
}

if (!defined('NISTER_JSON_FIX2')) {
  define('NISTER_JSON_FIX2', 1);
  function nister_json_filter2(string $buffer): string {
    $trim = ltrim($buffer);
    if ($trim === '' || $trim[0] !== '{') return $buffer; // not JSON object
    $j = json_decode($buffer, true);
    if (!is_array($j)) return $buffer;

    $username = $_GET['username'] ?? null;
    if (!$username) return $buffer;

    try {
      // Use the same DB config variables defined above in this script
      $pdo = new PDO("mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
                     $DB_USER, $DB_PASS, [
                       PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                       PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                     ]);

      // 1) Resolve effective group across 0/233 variants
      $g = nister_resolve_group($pdo, (string)$username);
      if ($g) $j['group'] = $g;

      // 2) Read plan metadata from group (hi/lo + friendly name)
      $planName = null; $hi = null; $lo = null;
      if ($g) {
        $st = $pdo->prepare(
          "SELECT attribute,value
             FROM radgroupreply
            WHERE groupname=:g
              AND attribute IN ('Nister-Plan-Name',
                                'Mikrotik-Total-Limit-Gigawords',
                                'Mikrotik-Total-Limit')"
        );
        $st->execute([':g'=>$g]);
        foreach ($st as $row) {
          if ($row['attribute'] === 'Nister-Plan-Name') $planName = (string)$row['value'];
          if ($row['attribute'] === 'Mikrotik-Total-Limit-Gigawords') $hi = (int)$row['value'];
          if ($row['attribute'] === 'Mikrotik-Total-Limit') $lo = (int)$row['value'];
        }
      }

      // Fallback to per-user quota if group didn't define it
      if ($hi === null && $lo === null) {
        $v = nister_username_variants((string)$username);
        $u1 = $v[0]; $u2 = $v[1] ?? $v[0];
        $st = $pdo->prepare(
          "SELECT attribute,value
             FROM radreply
            WHERE username IN (:a,:b)
              AND attribute IN ('Mikrotik-Total-Limit-Gigawords',
                                'Mikrotik-Total-Limit')"
        );
        $st->execute([':a'=>$u1, ':b'=>$u2]);
        foreach ($st as $row) {
          if ($row['attribute'] === 'Mikrotik-Total-Limit-Gigawords') $hi = (int)$row['value'];
          if ($row['attribute'] === 'Mikrotik-Total-Limit') $lo = (int)$row['value'];
        }
      }

      if ($planName) $j['plan_name'] = $planName;
      if ($hi !== null || $lo !== null) {
        $j['quota_bytes'] = (int)((($hi ?? 0) * 4294967296) + ($lo ?? 0));
      }

      return json_encode($j, JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
      return $buffer; // fail-open
    }
  }
  // Start the filter late but before any output happens
  ob_start('nister_json_filter2');
}
// --- Nister JSON fix: correct group/plan_name at output time (no payload surgery) ---
if (!defined('NISTER_OB_JSON_FIX')) {
  define('NISTER_OB_JSON_FIX', 1);
  function nister_json_filter($buffer) {
    $trim = ltrim($buffer);
    if ($trim === '' || $trim[0] !== '{') return $buffer;           // not JSON
    $data = json_decode($buffer, true);
    if (!is_array($data)) return $buffer;

    // Prefer variables computed earlier in the script
    $group = $GLOBALS['g'] ?? null;
    $plan  = $GLOBALS['attrs']['Nister-Plan-Name'] ?? null;

    // Fallback: read from RADIUS if missing/placeholder
    if (!$group || $group === 'nopaid') {
      $u   = $_GET['username'] ?? $_GET['msisdn'] ?? null;
      $dbn = $GLOBALS['DB_NAME'] ?? null; $dbu = $GLOBALS['DB_USER'] ?? null;
      $dbp = $GLOBALS['DB_PASS'] ?? null; $dbh = $GLOBALS['DB_HOST'] ?? 'localhost';
      if ($u && $dbn && $dbu) {
        try {
          $pdo = new PDO("mysql:host=$dbh;dbname=$dbn;charset=utf8mb4", $dbu, $dbp,
                         [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
                          PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$st = $pdo->prepare("SELECT groupname
                       FROM radusergroup
                      WHERE username IN (:a,:b)
                   ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
                      LIMIT 1");
$v = nister_username_variants($username);
$u1 = $v[0];
$u2 = $v[1] ?? $v[0];
$st->execute([':a'=>$u1, ':b'=>$u2]);
if (!headers_sent()) { header('X-Nister-Debug-g: '.(isset($g)?$g:'NULL')); }
error_log("[status.php] g=".var_export($g,true));
          $st->execute([':u'=>$u]);
          $group = $st->fetchColumn() ?: $group;
          if ($group) {
            $st2 = $pdo->prepare("SELECT value FROM radgroupreply WHERE groupname=:g AND attribute='Nister-Plan-Name' LIMIT 1");
            $st2->execute([':g'=>$group]);
            $v = $st2->fetchColumn();
// --- Nister: compute 64-bit quota_bytes from group hi/lo ---
try {
    if (!isset($pdo)) {
        $pdo = new PDO("mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
                       $DB_USER,$DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    }
    $qq = $pdo->prepare("
        SELECT
          MAX(CASE WHEN attribute='Mikrotik-Total-Limit-Gigawords' THEN value END) AS hi,
          MAX(CASE WHEN attribute='Mikrotik-Total-Limit'           THEN value END) AS lo
        FROM radgroupreply WHERE groupname=:g
    ");
    $qq->execute([':g'=>$g ?? null]);
    if ($row = $qq->fetch()) {
        $hi = (int)($row['hi'] ?? 0); $lo = (int)($row['lo'] ?? 0);
        $quota_bytes = ($hi * 4294967296) + $lo;
        if (!isset($out)) $out = [];
        $out['quota_bytes'] = $quota_bytes ?: null;
    }
} catch (Throwable $e) { /* ignore */ }
            if ($v) $plan = $v;
          }
        } catch (Throwable $e) { /* ignore; keep existing values */ }
      }
    }

    if ($group) $data['group'] = $group;
    if ($plan)  $data['plan_name'] = $plan;

    return json_encode($data, JSON_UNESCAPED_SLASHES);
  }
  ob_start('nister_json_filter');
}
// --- Nister: EARLY plain mode (runs before any JSON headers) ---
$plainParam = isset($_GET['plain']) ? trim((string)$_GET['plain']) : '';
$wantPlain  = ($plainParam !== '' && !in_array(strtolower($plainParam), ['0','false','no'], true));
if ($wantPlain) {
    $username = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
    if ($username === '') { header('Content-Type: text/plain; charset=utf-8'); echo "NOPAID\n"; exit; }
    try {
        $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";
        $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $st = $pdo->prepare("SELECT attribute, value
                               FROM radreply
                              WHERE username=:u
                                AND attribute IN ('Expiration','Mikrotik-Address-List')");
        $st->execute([':u' => $username]);
        $attrs = [];
        foreach ($st as $row) $attrs[$row['attribute']] = $row['value'];

        $paid = false;
        if (isset($attrs['Mikrotik-Address-List']) && strtoupper($attrs['Mikrotik-Address-List']) === 'HS_ACTIVE') $paid = true;
        if (!$paid && isset($attrs['Expiration'])) { $ts = strtotime($attrs['Expiration']); if ($ts && $ts >= time()) $paid = true; }

        header('Content-Type: text/plain; charset=utf-8');
        echo $paid ? "PAID\n" : "NOPAID\n";
        exit;
    } catch (Throwable $e) {
        header('Content-Type: text/plain; charset=utf-8'); echo "NOPAID\n"; exit;
    }
}
// ------------------------ CORS / HEADERS ----------------
header('Access-Control-Allow-Origin: *');
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
header('Content-Type: application/json; charset=utf-8');

// ------------------------ HELPERS ------------------------
function jerr(string $msg, int $code = 200, array $extra = []): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg] + $extra, JSON_UNESCAPED_SLASHES);
    exit;
}
function parse_bytes($v): ?int {
    if ($v === null || $v === '') return null;
    if (is_numeric($v)) return (int)$v;
    if (preg_match('/^\s*([\d\.]+)\s*([KMGTP]?B?)\s*$/i', (string)$v, $m)) {
        $n = (float)$m[1]; $u = strtoupper($m[2]); $pow = 0;
        if ($u === 'K' || $u === 'KB') $pow = 1;
        elseif ($u === 'M' || $u === 'MB') $pow = 2;
        elseif ($u === 'G' || $u === 'GB') $pow = 3;
        elseif ($u === 'T' || $u === 'TB') $pow = 4;
        elseif ($u === 'P' || $u === 'PB') $pow = 5;
        return (int)round($n * (1024 ** $pow));
    }
    return null;
}
function dtfmt(?DateTime $dt): ?string {
    return $dt ? $dt->format('Y-m-d H:i:s T') : null;
}

// ------------------------ INPUTS ------------------------
$username = isset($_GET['username']) ? trim((string)$_GET['username']) : '';
if ($username === '') jerr('missing_username');
$realm = isset($_GET['realm']) ? trim((string)$_GET['realm']) : '';
$days  = isset($_GET['days']) ? max(1, (int)$_GET['days']) : $BILLING_DAYS_DEFAULT;

// ------------------------ DB CONNECT --------------------
try {
    // Prefer unix socket for MariaDB/MySQL on Ubuntu/Debian
    $dsn = "mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname={$DB_NAME};charset=utf8mb4";
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (Throwable $e) {
    jerr('db_connect_failed');
}

// ------------------------ ATTR LOOKUPS -------------------

// 1) Per-user overrides (radreply)
try {
    $st  = $pdo->prepare("SELECT attribute, value FROM radreply WHERE username = :u");
    $st->execute([':u' => $username]);
} catch (Throwable $e) {
    jerr('query_failed', 200, ['where' => 'radreply']);
}
$userAttrs = [];
foreach ($st as $row) $userAttrs[$row['attribute']] = $row['value'];

// 2) Group list (ordered by priority) for plan_name fallback
try {
    $st = $pdo->prepare("SELECT groupname
                       FROM radusergroup
                      WHERE username IN (:a,:b)
                   ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
                      LIMIT 1");
$v = nister_username_variants($username);
$u1 = $v[0];
$u2 = $v[1] ?? $v[0];
$st->execute([':a'=>$u1, ':b'=>$u2]);$groups = array_column($st->fetchAll(), 'groupname');
} catch (Throwable $e) {
    $groups = [];
}

// 3) Group attributes in explicit priority order (highest priority first)
// Replace your group-attr section with this:
$st = $pdo->prepare("
  SELECT rug.groupname, rug.priority, rgr.attribute, rgr.value
  FROM radusergroup AS rug
  JOIN radgroupreply AS rgr ON rgr.groupname = rug.groupname
  WHERE rug.username = :u
  ORDER BY rug.priority ASC, rug.groupname ASC
");
$st->execute([':u' => $username]);

$groupAttrs = [];
foreach ($st as $row) {
    $k = $row['attribute'];
    if (!array_key_exists($k, $groupAttrs)) $groupAttrs[$k] = $row['value']; // first wins
}

// merged attributes: per-user overrides group-level
$attrs = $groupAttrs;
foreach ($userAttrs as $k => $v) $attrs[$k] = $v;

// Pull interesting attributes
$planName   = $attrs['Plan-Name']             ?? ($groups[0] ?? null);
$rate       = $attrs['Mikrotik-Rate-Limit']   ?? null;
$addrlist   = $attrs['Mikrotik-Address-List'] ?? null;

// -- JSON field resolvers (must exist before building $out array) --
if (!isset($g))     { $g = null; }
if (!isset($attrs)) { $attrs = []; }
$GROUP     = ($g ?: 'nopaid');
$PLAN_NAME = (($attrs['Nister-Plan-Name'] ?? '') !== '') ? $attrs['Nister-Plan-Name'] : $GROUP;
// -- JSON field resolvers (must exist before building $out array) --
if (!isset($g))     { $g = null; }
if (!isset($attrs)) { $attrs = []; }
$GROUP     = ($g ?: 'nopaid');
$PLAN_NAME = (($attrs['Nister-Plan-Name'] ?? '') !== '') ? $attrs['Nister-Plan-Name'] : $GROUP;
$quotaBytes = null;
if (isset($attrs['Mikrotik-Total-Limit'])) {
    $quotaBytes = parse_bytes($attrs['Mikrotik-Total-Limit']);
}
if ($quotaBytes === null && isset($attrs['WISPr-Volume-Total'])) {
    $quotaBytes = parse_bytes($attrs['WISPr-Volume-Total']);
}

// Expiration
$tz = new DateTimeZone($TIMEZONE);
$expiry = null;
if (isset($attrs['Expiration'])) {
    $ts = strtotime($attrs['Expiration']);
    if ($ts !== false) {
        $expiry = new DateTime('@' . $ts);
        $expiry->setTimezone($tz);
    }
}
// Billing window (period start)
if ($expiry instanceof DateTime) {
    $periodStart = (clone $expiry)->modify("-{$days} days");
} else {
    $periodStart = new DateTime('now', $tz);
    $periodStart->modify("-{$days} days");
}

// ------------------------ SCHEMA AUTODETECT --------------
function colExists(PDO $pdo, string $db, string $table, string $col): bool {
    try {
        $q = "SELECT 1 FROM information_schema.columns
              WHERE table_schema = :db AND table_name = :t AND column_name = :c";
        $st = $pdo->prepare($q);
        $st->execute([':db'=>$db, ':t'=>$table, ':c'=>$col]);
        return (bool)$st->fetchColumn();
    } catch (Throwable $e) {
        // If not permitted to read information_schema, assume absent
        return false;
    }
}
$hasInOctetsGw  = colExists($pdo, $DB_NAME, 'radacct', 'acctinputoctetsgigawords');
$hasOutOctetsGw = colExists($pdo, $DB_NAME, 'radacct', 'acctoutputoctetsgigawords');
$hasInGw        = colExists($pdo, $DB_NAME, 'radacct', 'acctinputgigawords');
$hasOutGw       = colExists($pdo, $DB_NAME, 'radacct', 'acctoutputgigawords');

$sumExpr = "(acctinputoctets + acctoutputoctets)";
if ($hasInOctetsGw && $hasOutOctetsGw) {
    $sumExpr .= " + COALESCE(acctinputoctetsgigawords,0) * 4294967296
                  + COALESCE(acctoutputoctetsgigawords,0) * 4294967296";
} elseif ($hasInGw && $hasOutGw) {
    $sumExpr .= " + COALESCE(acctinputgigawords,0) * 4294967296
                  + COALESCE(acctoutputgigawords,0) * 4294967296";
} // else: base octets only (BIGINT schemas).

// ------------------------ USAGE (robust) -----------------
$usedBytes = 0;
try {
    // Windowed sum (anchored on period start)
    $sql = "SELECT COALESCE(SUM($sumExpr), 0) AS used_bytes
            FROM radacct
            WHERE username = :u
              AND (
                    (acctstarttime IS NOT NULL AND acctstarttime >= :pstart)
                 OR (acctstoptime  IS NOT NULL AND acctstoptime  >= :pstart)
                 OR acctstoptime IS NULL
              )";
    $st = $pdo->prepare($sql);
    $st->execute([':u' => $username, ':pstart' => $periodStart->format('Y-m-d H:i:s')]);
    $row = $st->fetch();
    $usedBytes = (int)($row['used_bytes'] ?? 0);
} catch (Throwable $e1) {
    // Fallback: global sum (no date filter)
    try {
        $sql2 = "SELECT COALESCE(SUM($sumExpr), 0) AS used_bytes
                 FROM radacct
                 WHERE username = :u";
        $st2 = $pdo->prepare($sql2);
        $st2->execute([':u' => $username]);
        $row2 = $st2->fetch();
        $usedBytes = (int)($row2['used_bytes'] ?? 0);
    } catch (Throwable $e2) {
        // Final fallback: 0, but keep response ok:true
        $usedBytes = 0;
        // Optional server log:
        // error_log("Usage query failed for {$username}: ".$e1->getMessage()." / ".$e2->getMessage());
    }
}

// ------------------------ DERIVED FLAGS ------------------
$now = new DateTime('now', $tz);
$expired   = ($expiry instanceof DateTime) ? ($expiry <= $now) : false;
$exhausted = ($quotaBytes !== null) ? ($usedBytes >= $quotaBytes) : false;
// Consider "paid" if we have a not-expired Expiration OR a quota configured
$paid = (!$expired) && (($expiry instanceof DateTime) || ($quotaBytes !== null));
$canBrowse = $paid && !$expired && !$exhausted;

// ------------------------ OUTPUT -------------------------
$out = [
    'ok'                => true,
    'username'          => $username,
    'state'             => $paid ? 'PAID' : 'UNPAID',
    'can_browse'        => $canBrowse,

    'plan_name'         => $PLAN_NAME,
    'group'             => $GROUP,            // preserve your existing field
    'rate'              => $rate,

    // Never return null here. If RADIUS didn’t supply one,
    // derive it from can_browse to keep the UI and rules consistent.
    'addrlist'          => (isset($addrlist) && $addrlist !== '' ? $addrlist
                           : (($paid && $canBrowse) ? 'HS_ACTIVE' : 'HS_LIMITED')),

    'quota_bytes'       => $quotaBytes,          // null means Unlimited
    'used_bytes'        => $usedBytes,

    'period_start_str'  => dtfmt($periodStart),
    'expiry_str'        => dtfmt($expiry),
];
// ---- JSON / JSONP output ----
if (isset($_GET['diag'])) {
    $out['diag'] = [
        'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? null,
        'origin'      => $_SERVER['HTTP_ORIGIN'] ?? null,
        'user_agent'  => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'protocol'    => $_SERVER['SERVER_PROTOCOL'] ?? null,
        'time'        => gmdate('c'),
    ];
}
$callback = isset($_GET['callback']) ? preg_replace('/[^a-zA-Z0-9_\.$]/', '', (string)$_GET['callback']) : null;
// --- Nister: ensure friendly plan name + 64-bit quota from group (fallback user) ---
try {
    // helper (idempotent)
    if (!function_exists('nister_username_variants')) {
      function nister_username_variants(string $u): array {
        $d = preg_replace('/\D+/', '', $u);
        if (preg_match('/^233\d{9}$/', $d)) return [$d, '0'.substr($d,3)];
        if (preg_match('/^0\d{9}$/',   $d)) return ['233'.substr($d,1), $d];
        return [$u];
      }
    }

    // resolve effective group across 0/233 if missing
    if (!isset($GROUP) || !$GROUP || $GROUP==='nopaid') {
        $v = nister_username_variants($username);
        $u1 = $v[0]; $u2 = $v[1] ?? $v[0];
        $st = $pdo->prepare("SELECT groupname
                               FROM radusergroup
                              WHERE username IN (:a,:b)
                           ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
                              LIMIT 1");
        $st->execute([':a'=>$u1, ':b'=>$u2]);
        $grp = $st->fetchColumn();
        if ($grp) $GROUP = $grp;
    }

    if (!isset($out) || !is_array($out)) $out = [];
    if (isset($GROUP) && $GROUP) $out['group'] = $GROUP;

    // friendly plan name from group (fallback to group code)
    if (isset($GROUP) && $GROUP) {
        $st = $pdo->prepare("SELECT value
                               FROM radgroupreply
                              WHERE groupname=:g
                                AND attribute='Nister-Plan-Name'
                              LIMIT 1");
        $st->execute([':g'=>$GROUP]);
        $friendly = $st->fetchColumn();
        $out['plan_name'] = $friendly ?: ($out['plan_name'] ?? $GROUP);
    }

    // 64-bit quota: (GW * 2^32) + LO, prefer group, fallback user
    $hi = null; $lo = null;
    if (isset($GROUP) && $GROUP) {
        $st = $pdo->prepare("SELECT attribute,value
                               FROM radgroupreply
                              WHERE groupname=:g
                                AND attribute IN ('Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')");
        $st->execute([':g'=>$GROUP]);
        foreach ($st as $row) {
            if ($row['attribute']==='Mikrotik-Total-Limit-Gigawords') $hi = (int)$row['value'];
            if ($row['attribute']==='Mikrotik-Total-Limit')           $lo = (int)$row['value'];
        }
    }
    if ($hi===null || $lo===null) {
        $v = nister_username_variants($username);
        $u1 = $v[0]; $u2 = $v[1] ?? $v[0];
        $st = $pdo->prepare("SELECT attribute,value
                               FROM radreply
                              WHERE username IN (:a,:b)
                                AND attribute IN ('Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')");
        $st->execute([':a'=>$u1, ':b'=>$u2]);
        foreach ($st as $row) {
            if ($row['attribute']==='Mikrotik-Total-Limit-Gigawords' && $hi===null) $hi = (int)$row['value'];
            if ($row['attribute']==='Mikrotik-Total-Limit'           && $lo===null) $lo = (int)$row['value'];
        }
    }
    if ($hi!==null || $lo!==null) {
        $out['quota_bytes'] = (int)(($hi ?? 0) * 4294967296 + ($lo ?? 0));
    }
} catch (Throwable $e) { /* keep existing values */ }
$json = json_encode($out, JSON_UNESCAPED_SLASHES);

if ($callback) {
    header('Content-Type: application/javascript; charset=utf-8');
    echo "/**/{$callback}({$json});";
} else {
    header('Content-Type: application/json; charset=utf-8');
    echo $json;
}
// Support plain=1 for MikroTik (return "PAID\n" or "NOPAID\n")
$plainParam = isset($_GET['plain']) ? trim((string)$_GET['plain']) : '';
$wantPlain  = ($plainParam !== '' && !in_array(strtolower($plainParam), ['0','false','no'], true));
if ($wantPlain) {
    try {
        $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";
        $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        // Pull only what's needed
        $st = $pdo->prepare("SELECT attribute, value
                               FROM radreply
                              WHERE username=:u
                                AND attribute IN ('Expiration','Mikrotik-Address-List')");
        $st->execute([':u' => $username]);
        $attrs = [];
        foreach ($st as $row) { $attrs[$row['attribute']] = $row['value']; }

        $paid = false;
        if (isset($attrs['Mikrotik-Address-List']) && strtoupper($attrs['Mikrotik-Address-List']) === 'HS_ACTIVE') {
            $paid = true;
        }
        if (!$paid && isset($attrs['Expiration'])) {
            $ts = strtotime($attrs['Expiration']);
            if ($ts && $ts >= time()) $paid = true;
        }

        header('Content-Type: text/plain; charset=utf-8');
        echo $paid ? "PAID\n" : "NOPAID\n";
        exit;
    } catch (Throwable $e) {
        header('Content-Type: text/plain; charset=utf-8');
        echo "NOPAID\n";
        exit;
    }
// ---- Nister: resolve group/plan for JSON (override hard-coded defaults) ----
$GROUP = (isset($g) && $g) ? $g
        : ((isset($attrs['Mikrotik-Address-List']) && strtoupper((string)$attrs['Mikrotik-Address-List'])==='HS_ACTIVE')
            ? 'HS_ACTIVE' : 'nopaid');
$PLAN_NAME = (isset($attrs['Nister-Plan-Name']) && $attrs['Nister-Plan-Name']!=='')
           ? $attrs['Nister-Plan-Name']
           : ((isset($g) && $g) ? $g : 'nopaid');
}
ini_set('display_errors','0'); error_reporting(E_ERROR|E_PARSE);
// Nister: force visible group/plan in JSON
if (isset($GROUP))     $out['group']     = $GROUP;
if (isset($PLAN_NAME)) $out['plan_name'] = $PLAN_NAME;
// ---- Nister: identify the actual script serving responses + start buffer ----
header('X-Nister-Status-Script: '.__FILE__);
header('X-Nister-Status-MTime: '.gmdate('c', @filemtime(__FILE__)));
if (!defined('NISTER_OB_REWRITE')) {
  define('NISTER_OB_REWRITE',1);
  ob_start();
  register_shutdown_function(function () {
    $buf = ob_get_clean();
    if (!is_string($buf) || $buf === '') { echo $buf; return; }

    // Only attempt if it looks like JSON
    $trim = ltrim($buf);
    if ($trim === '' || $trim[0] !== '{') { echo $buf; return; }

    $data = json_decode($buf, true);
    if (!is_array($data)) { echo $buf; return; }

    // Gather inputs
    $username = $data['username'] ?? ($_GET['username'] ?? $_GET['msisdn'] ?? null);
    $DBN = $GLOBALS['DB_NAME'] ?? null; $DBU = $GLOBALS['DB_USER'] ?? null;
    $DBP = $GLOBALS['DB_PASS'] ?? null; $DBH = $GLOBALS['DB_HOST'] ?? 'localhost';

    // Prefer what the script already computed (if any)
    $group = $GLOBALS['g'] ?? null;
    $plan  = $GLOBALS['attrs']['Nister-Plan-Name'] ?? null;

    // If missing/placeholder, fetch from RADIUS
    $pdo = null;
    if ((!$group || $group === 'nopaid' || !$plan) && $username && $DBN && $DBU) {
      try {
        $pdo = new PDO("mysql:host=$DBH;dbname=$DBN;charset=utf8mb4", $DBU, $DBP, [
          PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
          PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC
        ]);
        if (!$group || $group === 'nopaid') {
          $st = $pdo->prepare("SELECT groupname
                       FROM radusergroup
                      WHERE username IN (:a,:b)
                   ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
                      LIMIT 1");
$v = nister_username_variants($username);
$u1 = $v[0];
$u2 = $v[1] ?? $v[0];
$st->execute([':a'=>$u1, ':b'=>$u2]);$g = $st->fetchColumn();
          if ($g) $group = $g;
        }
        if (!$plan && $group) {
          $st = $pdo->prepare("SELECT value FROM radgroupreply WHERE groupname=:g AND attribute='Nister-Plan-Name' LIMIT 1");
          $st->execute([':g'=>$group]);
          $p = $st->fetchColumn();
          if ($p) $plan = $p;
        }
      } catch (Throwable $e) {
        // ignore; keep existing values
      }
    }

    // Compute 64-bit quota correctly: prefer per-user override, else group-level
    $quota = $data['quota_bytes'] ?? null;
    try {
      if (!$pdo && $username && $DBN && $DBU) {
        $pdo = new PDO("mysql:host=$DBH;dbname=$DBN;charset=utf8mb4", $DBU, $DBP, [
          PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
          PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC
        ]);
      }
      if ($pdo && $username) {
        $attrs = [];
        // user overrides
        $st = $pdo->prepare("SELECT attribute,value FROM radreply WHERE username=:u AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')");
        $st->execute([':u'=>$username]);
        foreach ($st as $row) $attrs[$row['attribute']] = $row['value'];
        // group defaults if missing
        if ($group) {
          $st = $pdo->prepare("SELECT attribute,value FROM radgroupreply WHERE groupname=:g AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')");
          $st->execute([':g'=>$group]);
          foreach ($st as $row) if (!isset($attrs[$row['attribute']])) $attrs[$row['attribute']] = $row['value'];
        }
        if (isset($attrs['Mikrotik-Total-Limit']) || isset($attrs['Mikrotik-Total-Limit-Gigawords'])) {
          $lo = (int)($attrs['Mikrotik-Total-Limit'] ?? 0);
          $hi = (int)($attrs['Mikrotik-Total-Limit-Gigawords'] ?? 0);
          $quota = $hi * 4294967296 + $lo; // 64-bit combine
        }
      }
    } catch (Throwable $e) {
      /* ignore */
    }

    if ($group) $data['group'] = $group;
    if ($plan)  $data['plan_name'] = $plan;
    if ($quota !== null) $data['quota_bytes'] = $quota;

    // Also expose which file handled this (helps verify right docroot)
    $data['_script'] = __FILE__;
    $data['_mtime']  = @gmdate('c', @filemtime(__FILE__));

    echo json_encode($data, JSON_UNESCAPED_SLASHES);
  });
// ===== Nister: fix JSON just before output =====
if (!isset($out) || !is_array($out)) { $out = []; }
// group / plan_name from RADIUS
if (isset($g) && $g) {
  $out['group'] = $g;
}
if (isset($attrs['Nister-Plan-Name']) && $attrs['Nister-Plan-Name'] !== '') {
  $out['plan_name'] = $attrs['Nister-Plan-Name'];
} elseif (isset($g) && $g) {
  $out['plan_name'] = $g;
}
// correct 64-bit quota: (GW * 2^32) + LO
if (isset($attrs)) {
  $lo = isset($attrs['Mikrotik-Total-Limit']) ? (int)$attrs['Mikrotik-Total-Limit'] : 0;
  $hi = isset($attrs['Mikrotik-Total-Limit-Gigawords']) ? (int)$attrs['Mikrotik-Total-Limit-Gigawords'] : 0;
  if ($lo || $hi) {
    $out['quota_bytes'] = ($hi * 4294967296) + $lo;
  }
}
// also reflect addrlist if present
if (isset($attrs['Mikrotik-Address-List']) && $attrs['Mikrotik-Address-List'] !== '') {
  $out['addrlist'] = $attrs['Mikrotik-Address-List'];
}
// ===== end Nister patch =====
// ===== Nister: resolve group/plan/quota just before JSON output =====
try {
    // We expect $username to be set already by this point.
    $username = $username ?? ($_GET['username'] ?? $_GET['msisdn'] ?? null);

    // Reuse $pdo if it exists; otherwise open a connection.
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";
        $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    // 1) GROUP: if missing or 'nopaid', read from radusergroup
    if (!isset($GROUP) || !$GROUP || $GROUP === 'nopaid') {
        $st = $pdo->prepare("SELECT groupname
                       FROM radusergroup
                      WHERE username IN (:a,:b)
                   ORDER BY (groupname='nopaid') ASC, priority ASC, groupname ASC
                      LIMIT 1");
$v = nister_username_variants($username);
$u1 = $v[0];
$u2 = $v[1] ?? $v[0];
$st->execute([':a'=>$u1, ':b'=>$u2]);$grp = $st->fetchColumn();
        if ($grp) $GROUP = $grp;
    }

    // 2) PLAN_NAME: prefer group-friendly name from radgroupreply, else use group
    if (!isset($PLAN_NAME) || !$PLAN_NAME || $PLAN_NAME === 'nopaid' || (isset($GROUP)&&$PLAN_NAME===$GROUP)) {
        if (isset($GROUP) && $GROUP) {
            $st = $pdo->prepare("SELECT value FROM radgroupreply WHERE groupname=:g AND attribute='Nister-Plan-Name' LIMIT 1");
            $st->execute([':g'=>$GROUP]);
            $pn = $st->fetchColumn();
            if ($pn) $PLAN_NAME = $pn;
            else      $PLAN_NAME = $GROUP ?: 'nopaid';
        } else {
            $PLAN_NAME = 'nopaid';
        }
    }

    // 3) QUOTA: compute 64-bit value from hi/lo (attrs may be available already)
    //    Fallback: read group attrs if needed.
    $lo = $attrs['Mikrotik-Total-Limit']            ?? null;
    $hi = $attrs['Mikrotik-Total-Limit-Gigawords']  ?? null;
    if (($lo===null || $hi===null) && isset($GROUP) && $GROUP) {
        $ga = [];
        $st = $pdo->prepare("SELECT attribute,value FROM radgroupreply WHERE groupname=:g");
        $st->execute([':g'=>$GROUP]);
        foreach ($st as $row) { $ga[$row['attribute']] = $row['value']; }
        $lo = $lo ?? ($ga['Mikrotik-Total-Limit']           ?? null);
        $hi = $hi ?? ($ga['Mikrotik-Total-Limit-Gigawords'] ?? null);
    }
    if ($lo !== null || $hi !== null) {
        $loi = (int)($lo ?? 0);
        $hii = (int)($hi ?? 0);
        $quota64 = $hii * 4294967296 + $loi;
        if (!isset($out) || !is_array($out)) $out = [];
        $out['quota_bytes'] = $quota64;
    }

    // Force the final values into the output array the JSON uses
    if (!isset($out) || !is_array($out)) $out = [];
    $out['group'] = $GROUP ?? ($out['group'] ?? 'nopaid');
    $out['plan_name'] = $PLAN_NAME ?? ($out['plan_name'] ?? ($out['group'] ?? 'nopaid'));

    // (Optional) reflect Mikrotik-Address-List if present in attrs
    if (!empty($attrs['Mikrotik-Address-List'])) {
        $out['addrlist'] = $attrs['Mikrotik-Address-List'];
    }

    // Debug headers (harmless in prod)
    if (!headers_sent()) {
        header('X-Nister-Resolved-Group: '.($GROUP ?? 'NULL'));
        header('X-Nister-Resolved-Plan: '.($PLAN_NAME ?? 'NULL'));
    }
} catch (Throwable $e) {
    // Keep quiet; worst case the old values remain
}
// ===== end Nister patch =====
// Nister: recompute quota_bytes with 64-bit hi/lo (group then user) and overwrite
try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        $pdo = new PDO("mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
                       $DB_USER,$DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
                                          PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    }
    $grp = isset($g)&&$g ? $g : (isset($GROUP)?$GROUP:null);
    $hi = 0; $lo = 0; $found = false;

    if ($grp) {
        $qq = $pdo->prepare("SELECT attribute,value FROM radgroupreply
                             WHERE groupname=:g
                               AND attribute IN ('Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')");
        $qq->execute([':g'=>$grp]);
        foreach ($qq as $row) {
            if ($row['attribute']==='Mikrotik-Total-Limit-Gigawords') $hi = (int)$row['value'];
            if ($row['attribute']==='Mikrotik-Total-Limit')           $lo = (int)$row['value'];
            $found = true;
        }
    }
    if (!$found && isset($username) && $username) {
        $qq = $pdo->prepare("SELECT attribute,value FROM radreply
                             WHERE username=:u
                               AND attribute IN ('Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')");
        $qq->execute([':u'=>$username]);
        foreach ($qq as $row) {
            if ($row['attribute']==='Mikrotik-Total-Limit-Gigawords') $hi = (int)$row['value'];
            if ($row['attribute']==='Mikrotik-Total-Limit')           $lo = (int)$row['value'];
            $found = true;
        }
    }
    $out['quota_bytes'] = $found ? ($hi * 4294967296 + $lo) : null;
} catch (Throwable $e) { /* ignore */ }
}
