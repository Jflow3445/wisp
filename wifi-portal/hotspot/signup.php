<?php
ini_set('display_errors','1'); error_reporting(E_ALL);

/* ---------- config ---------- */
$DB_DSN  = 'mysql:host=127.0.0.1;dbname=radius;charset=utf8mb4';
$DB_USER = 'hotspot_api';
$DB_PASS = 'BishopFelix@50Dolla';

$LOGIN_URL       = 'https://wifi.nister.org/login.html'; // MikroTik local login page
$GROUP_ON_CREATE = 'nopaid';                              // matches your hotspot “nopaid” concept
$ADDR_LIST       = 'HS_NOPAID';                           // firewall address-list for unpaid
$ENFORCE_UNIQUE  = false;                                 // false=update password if exists
/* ---------------------------- */

function fail($msg, $username = '', $dst = '') {
  http_response_code(400);
  $back = 'https://wifi.nister.org/signup.html';
  if ($username !== '') { $back .= '?username='.rawurlencode($username); }
  if ($dst !== '')      { $back .= (strpos($back,'?')===false?'?':'&').'dst='.rawurlencode($dst); }
  echo "<!doctype html><meta charset='utf-8'><title>Signup error</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:2rem}
  .card{max-width:560px;margin:auto;border:1px solid #ddd;border-radius:12px;padding:24px}
  .err{background:#fee;border:1px solid #f88;padding:12px;border-radius:8px;margin-bottom:16px;color:#900}
  .btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #888;text-decoration:none}
  </style>
  <div class='card'><h2>Could not create account</h2>
  <div class='err'>".htmlspecialchars($msg,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8')."</div>
  <p><a class='btn' href='".htmlspecialchars($back,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8')."'>Go back</a></p></div>";
  @file_put_contents('/tmp/signup_debug.log', "success-branch ".date('c')."\n", FILE_APPEND);
  exit;
}

/* ----- read + validate form ----- */
$name = isset($_POST['name'])     ? trim($_POST['name'])     : '';
$user = isset($_POST['username']) ? trim($_POST['username']) : '';
$pass = isset($_POST['password']) ? (string)$_POST['password'] : '';
$mac  = isset($_POST['mac'])      ? trim($_POST['mac'])      : '';
$dst  = isset($_POST['dst'])      ? (string)$_POST['dst']    : '';

if ($name === '' || $user === '' || $pass === '') {
  fail('Please fill all required fields (name, phone, password).', $user, $dst);
}
$user = preg_replace('/\s+/', '', $user); // normalize (remove spaces)

header('Cache-Control: no-store');

/* ----- DB work ----- */
try {
  $pdo = new PDO($DB_DSN, $DB_USER, $DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);

  $pdo->beginTransaction();

  // Ensure/Update Cleartext-Password
  $stmt = $pdo->prepare("SELECT id FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1");
  $stmt->execute([$user]);
  if ($row = $stmt->fetch()) {
    if ($ENFORCE_UNIQUE) {
      throw new Exception('An account with this phone already exists.');
    }
    $upd = $pdo->prepare("UPDATE radcheck SET value = ? WHERE id = ?");
    $upd->execute([$pass, $row['id']]);
  } else {
    $ins = $pdo->prepare("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)");
    $ins->execute([$user, $pass]);
  }

  // Ensure Mikrotik-Address-List := HS_NOPAID
  $stmt = $pdo->prepare("SELECT id FROM radreply WHERE username = ? AND attribute = 'Mikrotik-Address-List' LIMIT 1");
  $stmt->execute([$user]);
  if ($rr = $stmt->fetch()) {
    $upd = $pdo->prepare("UPDATE radreply SET value = ? WHERE id = ?");
    $upd->execute([$ADDR_LIST, $rr['id']]);
  } else {
    $ins = $pdo->prepare("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Address-List', ':=', ?)");
    $ins->execute([$user, $ADDR_LIST]);
  }

  // Ensure user is in group 'nopaid' (optional but useful for policy)
  if ($GROUP_ON_CREATE !== '') {
    $stmt = $pdo->prepare("SELECT id FROM radusergroup WHERE username = ? AND groupname = ? LIMIT 1");
    $stmt->execute([$user, $GROUP_ON_CREATE]);
    if (!$stmt->fetch()) {
      $ins = $pdo->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)");
      $ins->execute([$user, $GROUP_ON_CREATE]);
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


} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
  fail('Database error: '.$e->getMessage(), $user, $dst);
}
