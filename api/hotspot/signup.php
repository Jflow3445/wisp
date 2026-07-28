<?php
declare(strict_types=1);

/*
  Flow:
  - Validate inputs
  - Create user in radcheck (Cleartext-Password + Expiration)
  - Set HS_NOPAID group + HS_NOPAID address list
  - Show registration success page
*/

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_paylib.php';
try {
  hotspot_include_paylib('settings.php');
  hotspot_include_paylib('location.php');
  hotspot_require_paylib('referrals.php');
} catch (Throwable $e) {
  error_log('Signup bootstrap error: ' . $e->getMessage());
}
$APP_PDO = (isset($GLOBALS['PDO']) && $GLOBALS['PDO'] instanceof PDO) ? $GLOBALS['PDO'] : null;

function portal_base_from_link(string $link, string $fallback): string {
  $link = trim($link);
  if ($link === '') return $fallback;
  $u = parse_url($link);
  if (!$u || empty($u['scheme']) || empty($u['host'])) return $fallback;
  $scheme = strtolower((string)$u['scheme']);
  $host = strtolower((string)$u['host']);
  $allowed = [
    'wifi.nister.org' => ['https'],
    '192.168.88.1' => ['http', 'https'],
    '192.168.80.1' => ['http', 'https'],
    '10.10.20.2' => ['http', 'https'],
  ];
  if (!isset($allowed[$host]) || !in_array($scheme, $allowed[$host], true)) return $fallback;
  $base = $scheme . '://' . $u['host'];
  if (!empty($u['port'])) $base .= ':' . $u['port'];
  return $base;
}

// --- Input normalization ---
$name     = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
$username = preg_replace('/\s+/', '', (string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$dst      = (string)($_POST['dst'] ?? '');
$otpToken = trim((string)($_POST['otp_token'] ?? ''));
$referralCode = trim((string)($_POST['referral_code'] ?? ''));
$locationCodeRaw = trim((string)($_POST['location_code'] ?? $_POST['site_code'] ?? ''));

$linkLoginOnly = (string)($_POST['link_login_only'] ?? '');
$PORTAL_BASE = portal_base_from_link($linkLoginOnly, '');

if ($locationCodeRaw === '' && function_exists('location_resolve_from_router_context')) {
  try {
    $autoLoc = location_resolve_from_router_context([
      'link_login_only' => $linkLoginOnly,
      'link_login' => (string)($_POST['link_login'] ?? ''),
      'remote_addr' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
      'x_forwarded_for' => (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
      'router_ip' => (string)($_POST['router_ip'] ?? ''),
      'router_id' => (string)($_POST['router_id'] ?? $_POST['identity'] ?? $_POST['nas_id'] ?? ''),
    ]);
    if ($autoLoc && !empty($autoLoc['code'])) {
      $locationCodeRaw = (string)$autoLoc['code'];
    }
  } catch (Throwable $e) {
    // non-fatal: location fallback remains default
  }
}

// ---- config ----
$LOGIN_URL       = $PORTAL_BASE . '/login.html';
$GROUP_ON_CREATE = 'HS_NOPAID';
$ADDR_LIST       = 'HS_NOPAID';
$ENFORCE_UNIQUE  = true;
$DEFAULT_EXP_DAYS = 3650; // keep unpaid accounts from auto-expiring
$SIMULTANEOUS_USE = 2;
// --------------

function username_variants(string $u): array {
  $d = preg_replace('/\D+/', '', $u);
  if ($d === '') return [$u];
  if (preg_match('/^233\d{9}$/', $d)) return [$d, '0' . substr($d, 3)];
  if (preg_match('/^0\d{9}$/', $d))   return [$d, '233' . substr($d, 1)];
  return [$d];
}

function fail(string $code, string $username = '', string $dst = '', string $name = ''): void {
  global $PORTAL_BASE, $locationCodeRaw;
  $back = $PORTAL_BASE . '/signup.html';
  $params = ['err' => $code];
  if ($username !== '') { $params['username'] = $username; }
  if ($name !== '')     { $params['name'] = $name; }
  if ($dst !== '')      { $params['dst'] = $dst; }
  if (!empty($locationCodeRaw)) { $params['location_code'] = (string)$locationCodeRaw; }
  $url = $back . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

  header('Cache-Control: no-store');
  header('Location: ' . $url, true, 303);
  exit;
}

function sms_setting(string $k, ?string $default=null): ?string {
  if (function_exists('settings_get')) {
    return settings_get($k, $default);
  }
  return $default;
}

function sms_template(string $tpl, array $vars): string {
  foreach ($vars as $k=>$v) {
    $tpl = str_replace('{' . $k . '}', (string)$v, $tpl);
  }
  return $tpl;
}

function sms_normalize_local(string $raw): string {
  $d = preg_replace('/\D+/', '', $raw);
  if ($d === '') return '';
  if (preg_match('/^233\d{9}$/', $d)) return '0' . substr($d, 3);
  if (preg_match('/^0\d{9}$/', $d)) return $d;
  return $d;
}

function sms_normalize_e164(string $raw): string {
  $d = preg_replace('/\D+/', '', $raw);
  if ($d === '') return '';
  if (preg_match('/^233\d{9}$/', $d)) return $d;
  if (preg_match('/^0\d{9}$/', $d)) return '233' . substr($d, 1);
  if (preg_match('/^\d{9}$/', $d)) return '233' . $d;
  return $d;
}

function sms_send_gateway(string $to, string $message): void {
  $apiKey = trim((string)(sms_setting('MNOTIFY_API_KEY', '') ?? ''));
  $sender = trim((string)(sms_setting('MNOTIFY_SENDER', '') ?? ''));
  $base = trim((string)(sms_setting('MNOTIFY_BASE', '') ?? ''));
  if ($apiKey === '' || $sender === '' || $message === '') return;
  if ($base === '') $base = 'https://api.pilosms.com/v1';
  $base = rtrim($base, '/');
  $isPilo = stripos($base, 'pilosms') !== false;
  if ($isPilo) $base = preg_replace('~/send-message$~i', '', $base) ?? $base;
  if (!$isPilo) $base = preg_replace('~/sms/quick$~i', '', $base) ?? $base;

  if ($isPilo) {
    $toE164 = sms_normalize_e164($to);
    if ($toE164 === '') return;
    $payload = [
      'sender' => $sender,
      'message' => $message,
      'receipients' => $toE164,
    ];
    $url = $base . '/send-message?apikey=' . rawurlencode($apiKey);

    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
      curl_setopt($ch, CURLOPT_POST, true);
      curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
      curl_setopt($ch, CURLOPT_TIMEOUT, 8);
      curl_exec($ch);
      curl_close($ch);
      return;
    }

    $opts = [
      'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query($payload),
        'timeout' => 8,
      ],
    ];
    @file_get_contents($url, false, stream_context_create($opts));
    return;
  }

  $payload = [
    'recipient' => [$to],
    'sender' => $sender,
    'message' => $message,
    'is_schedule' => false,
    'schedule_date' => '',
  ];
  $url = $base . '/sms/quick?key=' . rawurlencode($apiKey);

  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    curl_exec($ch);
    curl_close($ch);
    return;
  }

  $opts = [
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => json_encode($payload),
      'timeout' => 8,
    ],
  ];
  @file_get_contents($url, false, stream_context_create($opts));
}

$reqMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($reqMethod !== 'POST') {
  fail('method_not_allowed', $username, $dst, $name);
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
if ($otpToken === '') {
  fail('otp_required', $username, $dst, $name);
}
if (!function_exists('referrals_consume_signup_token')) {
  fail('server_error', $username, $dst, $name);
}

$ignoreSelfReferral = false;
$resolvedReferrer = null;
if ($referralCode !== '') {
  if (!function_exists('referrals_resolve_referrer_msisdn')) {
    fail('server_error', $username, $dst, $name);
  }
  $resolvedReferrer = referrals_resolve_referrer_msisdn($referralCode);
  if ($resolvedReferrer === null) {
    fail('invalid_referral_code', $username, $dst, $name);
  }
  if (function_exists('referrals_canon_msisdn')) {
    $canonUser = referrals_canon_msisdn($username);
    if ($canonUser !== '' && $resolvedReferrer === $canonUser) {
      $ignoreSelfReferral = true;
    }
  }
}

header('Cache-Control: no-store');

try {
  $appPdo = (isset($APP_PDO) && $APP_PDO instanceof PDO) ? $APP_PDO : null;
  if (!$appPdo) {
    fail('server_error', $username, $dst, $name);
  }
  $pdo = hotspot_radius_pdo();
  $targets = array_values(array_unique(array_filter(array_merge([$username], username_variants($username)))));

  $pdo->beginTransaction();

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

  $GLOBALS['PDO'] = $appPdo;
  if (function_exists('referrals_bootstrap_tables')) {
    referrals_bootstrap_tables();
  }
  if (!referrals_consume_signup_token($username, $otpToken)) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    fail('otp_invalid_or_expired', $username, $dst, $name);
  }
  $GLOBALS['PDO'] = $pdo;

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
  $simUseUpsert = $pdo->prepare(
    "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', ?)
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
  $legacyNoPaidDelete = $pdo->prepare(
    "DELETE FROM radusergroup WHERE username = ? AND groupname = 'nopaid'"
  );

  foreach ($targets as $u) {
    $passUpsert->execute([$u, $password]);
    $expUpsert->execute([$u, $expStr]);
    $simUseUpsert->execute([$u, (string)$SIMULTANEOUS_USE]);
    $addrUpsert->execute([$u, $ADDR_LIST]);
    if ($GROUP_ON_CREATE !== '') {
      $groupUpsert->execute([$u, $GROUP_ON_CREATE]);
    }
    // Hard-stop legacy duplicate group assignment for new signups.
    $legacyNoPaidDelete->execute([$u]);
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

if (isset($APP_PDO) && $APP_PDO instanceof PDO) {
  $GLOBALS['PDO'] = $APP_PDO;
}

if (function_exists('referrals_ensure_profile')) {
  try {
    referrals_ensure_profile($username);
  } catch (Throwable $e) {
    error_log('Signup referral profile error for '.$username.': '.$e->getMessage());
  }
}

if (function_exists('location_resolve_for_user')) {
  try {
    $canonUser = function_exists('normalize_msisdn') ? normalize_msisdn($username) : $username;
    if ($canonUser !== '') {
      location_resolve_for_user($canonUser, $locationCodeRaw !== '' ? $locationCodeRaw : null, true, 'signup');
    }
  } catch (Throwable $e) {
    error_log('Signup location profile error for '.$username.': '.$e->getMessage());
  }
}

if ($referralCode !== '' && !$ignoreSelfReferral && function_exists('referrals_bind_referral')) {
  try {
    $bind = referrals_bind_referral($username, $referralCode);
    if (!($bind['ok'] ?? false)) {
      error_log('Signup referral bind failed for '.$username.': '.json_encode($bind, JSON_UNESCAPED_SLASHES));
    }
  } catch (Throwable $e) {
    error_log('Signup referral bind error for '.$username.': '.$e->getMessage());
  }
}

try {
  $tpl = trim((string)(sms_setting('SMS_WELCOME_TEXT', '') ?? ''));
  if ($tpl !== '') {
    $loginUrl = trim((string)(sms_setting('SMS_LOGIN_URL', '') ?? ''));
    if ($loginUrl === '') $loginUrl = $LOGIN_URL;
    $msg = sms_template($tpl, [
      'NAME' => $name,
      'MSISDN' => sms_normalize_local($username),
      'LOGIN_URL' => $loginUrl,
    ]);
    $to = sms_normalize_local($username);
    if ($to !== '' && $msg !== '') sms_send_gateway($to, $msg);
  }
} catch (Throwable $e) {
  // ignore SMS failures
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
