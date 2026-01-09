<?php
declare(strict_types=1);

/*
  Flow:
  - Validate inputs
  - Create user in radcheck (Cleartext-Password + Expiration)
  - Set nopaid group + HS_NOPAID address list
  - Show registration success page
*/

require_once __DIR__ . '/_db.php';

// --- Input normalization ---
$name     = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
$username = preg_replace('/\s+/', '', (string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$dst      = (string)($_POST['dst'] ?? '');

$defaultLogin = "https://wifi.nister.org/login";
$linkLoginOnly = (string)($_POST["link_login_only"] ?? $defaultLogin);
$u = parse_url($linkLoginOnly);
if (!$u || !isset($u["scheme"], $u["host"]) || !in_array($u["host"], ["wifi.nister.org", "192.168.88.1"], true)) {
  $linkLoginOnly = $defaultLogin;
}

// ---- config ----
$LOGIN_URL       = 'https://wifi.nister.org/login.html';
$GROUP_ON_CREATE = 'nopaid';
$ADDR_LIST       = 'HS_NOPAID';
$ENFORCE_UNIQUE  = true;
$DEFAULT_EXP_DAYS = 3650; // keep nopaid accounts from auto-expiring
// --------------

function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/', $d))   return [$d, '233' . substr($d, 1)];
  return [$d];
}

function fail(string $code, string $username = '', string $dst = '', string $name = ''): void {
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

// Minimal safety
if ($name === '' || $username === '' || $password === '') {
  fail('missing_fields', $username, $dst, $name);
}
if (!preg_match('/^\d{9,15}$/', $username)) {
  fail('invalid_phone', $username, $dst, $name);
}
if (strlen($name) < 2) {
  fail('invalid_name', $username, $dst, $name);
}
if (strlen($name) > 80) {
  fail('name_too_long', $username, $dst, $name);
}
if (strlen($password) < 6) {
  fail('weak_password', $username, $dst, $name);
}

header('Cache-Control: no-store');

try {
  $pdo = hotspot_radius_pdo();
  $pdo->beginTransaction();

  $targets = array_values(array_unique(array_filter(array_merge([$username], username_variants($username)))));

  if ($ENFORCE_UNIQUE) {
    $check = $pdo->prepare("SELECT username FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
    foreach ($targets as $u) {
      $check->execute([$u]);
      if ($check->fetchColumn() !== false) {
        $pdo->rollBack();
        fail('account_exists', $username, $dst, $name);
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
    $passUpsert->execute([$u, $password]);
    $expUpsert->execute([$u, $expStr]);
    $addrUpsert->execute([$u, $ADDR_LIST]);
    if ($GROUP_ON_CREATE !== '') {
      $groupUpsert->execute([$u, $GROUP_ON_CREATE]);
    }
  }

  $pdo->commit();
} catch (PDOException $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('Signup error for '.$username.': '.$e->getMessage());
  if ($e->getCode() === '23000') {
    fail('account_exists', $username, $dst, $name);
  }
  fail('server_error', $username, $dst, $name);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('Signup error for '.$username.': '.$e->getMessage());
  fail('server_error', $username, $dst, $name);
}

// Return a registration success page (no auto-login).
header("Content-Type: text/html; charset=utf-8");
header("Cache-Control: no-store");
header("X-Robots-Tag: noindex");
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Registration successful</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h2>Registration successful</h2>
  <p>Your account has been created. Proceed to <a href="<?= htmlspecialchars($LOGIN_URL, ENT_QUOTES) ?>" target="_top">Wi-Fi login</a>.</p>
</body>
</html>
