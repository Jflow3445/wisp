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
if (is_readable(__DIR__ . '/../../pay-portal/lib/settings.php')) {
  require_once __DIR__ . '/../../pay-portal/lib/settings.php';
}
if (is_readable(__DIR__ . '/../../pay-portal/lib/referrals.php')) {
  require_once __DIR__ . '/../../pay-portal/lib/referrals.php';
}

// --- Input normalization ---
$name     = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
$username = preg_replace('/\s+/', '', (string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$dst      = (string)($_POST['dst'] ?? '');
$otpToken = trim((string)($_POST['otp_token'] ?? ''));
$referralCode = trim((string)($_POST['referral_code'] ?? ''));

$defaultLogin = "https://wifi.nister.org/login";
$linkLoginOnly = (string)($_POST["link_login_only"] ?? $defaultLogin);
$u = parse_url($linkLoginOnly);
if (!$u || !isset($u["scheme"], $u["host"]) || !in_array($u["host"], ["wifi.nister.org", "192.168.88.1"], true)) {
  $linkLoginOnly = $defaultLogin;
}

// ---- config ----
$LOGIN_URL       = 'https://wifi.nister.org/login.html';
$GROUP_ON_CREATE = 'HS_NOPAID';
$ADDR_LIST       = 'HS_NOPAID';
$ENFORCE_UNIQUE  = true;
$DEFAULT_EXP_DAYS = 3650; // keep unpaid accounts from auto-expiring
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
if (!function_exists('referrals_signup_token_valid') || !referrals_signup_token_valid($username, $otpToken)) {
  fail('otp_invalid_or_expired', $username, $dst, $name);
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

if (function_exists('referrals_ensure_profile')) {
  try {
    referrals_ensure_profile($username);
  } catch (Throwable $e) {
    error_log('Signup referral profile error for '.$username.': '.$e->getMessage());
  }
}

if (!function_exists('referrals_consume_signup_token') || !referrals_consume_signup_token($username, $otpToken)) {
  error_log('Signup OTP consume failed for '.$username);
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
