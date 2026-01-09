<?php
declare(strict_types=1);

/*
  Flow:
  - Validate inputs
  - Create user in radcheck (Cleartext-Password)
  - Set nopaid group + HS_NOPAID address list
  - Return auto-post to MikroTik login
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
// --------------

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

  // Ensure/Update Cleartext-Password
  $stmt = $pdo->prepare("SELECT id FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
  $stmt->execute([$username]);
  if ($row = $stmt->fetch()) {
    if ($ENFORCE_UNIQUE) {
      $pdo->rollBack();
      fail('account_exists', $username, $dst, $name);
    }
    $upd = $pdo->prepare("UPDATE radcheck SET value = ? WHERE id = ?");
    $upd->execute([$password, $row['id']]);
  } else {
    $ins = $pdo->prepare("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)");
    $ins->execute([$username, $password]);
  }

  // Ensure Mikrotik-Address-List := HS_NOPAID
  $stmt = $pdo->prepare("SELECT id FROM radreply WHERE username = ? AND attribute = 'Mikrotik-Address-List' LIMIT 1");
  $stmt->execute([$username]);
  if ($rr = $stmt->fetch()) {
    $upd = $pdo->prepare("UPDATE radreply SET value = ? WHERE id = ?");
    $upd->execute([$ADDR_LIST, $rr['id']]);
  } else {
    $ins = $pdo->prepare("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Address-List', ':=', ?)");
    $ins->execute([$username, $ADDR_LIST]);
  }

  // Ensure user is in group 'nopaid'
  if ($GROUP_ON_CREATE !== '') {
    $stmt = $pdo->prepare("SELECT id FROM radusergroup WHERE username = ? AND groupname = ? LIMIT 1");
    $stmt->execute([$username, $GROUP_ON_CREATE]);
    if (!$stmt->fetch()) {
      $ins = $pdo->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)");
      $ins->execute([$username, $GROUP_ON_CREATE]);
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

/* Anti-race: give DB/Radius a beat so first PAP doesn't fail */
usleep(800000); // 0.8s

// Return tiny page that auto-posts credentials to MikroTik login.
header("Content-Type: text/html; charset=utf-8");
header("Cache-Control: no-store");
header("X-Robots-Tag: noindex");
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logging you in...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<form id="L" action="<?= htmlspecialchars($linkLoginOnly, ENT_QUOTES) ?>" method="post" target="_top">
  <input type="hidden" name="username" value="<?= htmlspecialchars($username, ENT_QUOTES) ?>">
  <input type="hidden" name="password" value="<?= htmlspecialchars($password, ENT_QUOTES) ?>">
  <input type="hidden" name="dst"      value="<?= htmlspecialchars($dst, ENT_QUOTES) ?>">
  <input type="hidden" name="popup"    value="false">
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>
  setTimeout(function(){ document.getElementById("L").submit(); }, 30);
</script>
</body>
</html>
