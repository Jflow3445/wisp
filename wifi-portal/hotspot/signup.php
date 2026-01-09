<?php
ini_set('display_errors','0'); error_reporting(E_ERROR|E_PARSE);

/* ---------- config ---------- */
function radius_db_params(): array {
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

[$DB_DSN, $DB_USER, $DB_PASS] = radius_db_params();

$LOGIN_URL       = 'https://wifi.nister.org/login.html'; // MikroTik local login page
$GROUP_ON_CREATE = 'nopaid';                              // matches your hotspot "nopaid" concept
$ADDR_LIST       = 'HS_NOPAID';                           // firewall address-list for unpaid
$ENFORCE_UNIQUE  = true;                                  // do not overwrite existing passwords
$DEFAULT_EXP_DAYS = 3650;                                 // keep nopaid accounts from auto-expiring
/* ---------------------------- */

function fail($code, $username = '', $dst = '', $name = '') {
  $back = 'https://wifi.nister.org/signup.html';
  $params = ['err' => $code];
  if ($username !== '') { $params['username'] = $username; }
  if ($name !== '')     { $params['name'] = $name; }
  if ($dst !== '')      { $params['dst'] = $dst; }
  $url = $back . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

  header('Cache-Control: no-store');
  header('Location: ' . $url, true, 303);
  exit;
}

function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/', $d))   return [$d, '233' . substr($d, 1)];
  return [$d];
}

/* ----- read + validate form ----- */
$name = isset($_POST['name'])     ? trim($_POST['name'])     : '';
$user = isset($_POST['username']) ? trim($_POST['username']) : '';
$pass = isset($_POST['password']) ? (string)$_POST['password'] : '';
$mac  = isset($_POST['mac'])      ? trim($_POST['mac'])      : '';
$dst  = isset($_POST['dst'])      ? (string)$_POST['dst']    : '';

if ($name === '' || $user === '' || $pass === '') {
  fail('missing_fields', $user, $dst, $name);
}
$user = preg_replace('/\s+/', '', $user); // normalize (remove spaces)
if (!preg_match('/^\d{9,15}$/', $user)) {
  fail('invalid_phone', $user, $dst, $name);
}
if (strlen($name) < 2) {
  fail('invalid_name', $user, $dst, $name);
}
if (strlen($name) > 80) {
  fail('name_too_long', $user, $dst, $name);
}
if (strlen($pass) < 6) {
  fail('weak_password', $user, $dst, $name);
}

header('Cache-Control: no-store');

/* ----- DB work ----- */
try {
  $pdo = new PDO($DB_DSN, $DB_USER, $DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);

  $pdo->beginTransaction();

  $targets = array_values(array_unique(array_filter(array_merge([$user], username_variants($user)))));

  if ($ENFORCE_UNIQUE) {
    $check = $pdo->prepare("SELECT username FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
    foreach ($targets as $u) {
      $check->execute([$u]);
      if ($check->fetchColumn() !== false) {
        $pdo->rollBack();
        fail('account_exists', $user, $dst, $name);
      }
    }
  }

  $expAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
    ->modify('+' . (int)$DEFAULT_EXP_DAYS . ' days')
    ->setTime(23, 59, 59);
  $expStr = $expAt->format('d M Y H:i:s');

  $passUpsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  $expUpsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Expiration', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  $addrUpsert = $pdo->prepare(
    "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Address-List', ':=', ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), op = ':='"
  );
  $groupUpsert = $pdo->prepare(
    "INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE priority = VALUES(priority)"
  );

  foreach ($targets as $u) {
    $passUpsert->execute([$u, $pass]);
    $expUpsert->execute([$u, $expStr]);
    $addrUpsert->execute([$u, $ADDR_LIST]);
    if ($GROUP_ON_CREATE !== '') {
      $groupUpsert->execute([$u, $GROUP_ON_CREATE]);
    }
  }

  $pdo->commit();

  
  http_response_code(200);
  header("Content-Type: text/html; charset=utf-8");
  header_remove("Content-Length");
    $safe  = htmlspecialchars($user, ENT_QUOTES, 'UTF-8');
    $login = 'https://wifi.nister.org/login.html?username=' . $safe;
    $tplf  = __DIR__ . '/registration-success.tmpl.html';
    if (is_readable($tplf) && ($tpl = @file_get_contents($tplf)) !== false) {
    // force plain login URL (no prefill; avoids confusion on the MikroTik page)
    $login = 'https://wifi.nister.org/login.html';
      echo str_replace('__LOGIN_URL__', $login, $tpl);
    } else {
      echo '<!doctype html><meta charset="utf-8"><h2>Registration successful</h2><p>Your account has been created. Proceed to <a href="' . $login . '">Wi-Fi login</a>.</p>';
    }
  flush();
  exit;


} catch (PDOException $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('Signup error for '.$user.': '.$e->getMessage());
  if ($e->getCode() === '23000') {
    fail('account_exists', $user, $dst, $name);
  }
  fail('server_error', $user, $dst, $name);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('Signup error for '.$user.': '.$e->getMessage());
  fail('server_error', $user, $dst, $name);
}
