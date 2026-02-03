<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
require_once __DIR__.'/radius.php';

function user_boot(): array {
  $env = app_boot();

  if (session_status() !== PHP_SESSION_ACTIVE) {
    // separate cookie from admin session
    if (session_name() !== 'nister_user') {
      session_name('nister_user');
    }
    $secure = false;
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') $secure = true;
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') $secure = true;

    $params = session_get_cookie_params();
    session_set_cookie_params([
      'lifetime' => $params['lifetime'],
      'path'     => $params['path'] ?: '/',
      'domain'   => $params['domain'],
      'secure'   => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    session_start();
  }

  if (isset($_GET['logout'])) {
    user_logout();
    header('Location: /login.php?msg=logged_out');
    exit;
  }

  return $env;
}

function user_logged_in(): bool {
  return !empty($_SESSION['user_msisdn']);
}

function user_msisdn(): string {
  return (string)($_SESSION['user_msisdn'] ?? '');
}

function user_msisdn_display(): string {
  $u = user_msisdn();
  return $u !== '' ? msisdn_display($u) : '';
}

function user_logout(): void {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time()-42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
  }
  session_destroy();
}

function user_require_login(bool $json=false): void {
  if (user_logged_in()) return;

  if ($json) {
    json_out(['ok'=>false,'error'=>'unauthorized'], 401);
  }

  $uri  = $_SERVER['REQUEST_URI'] ?? '';
  $path = (string)(parse_url($uri, PHP_URL_PATH) ?? '');
  if ($path === '/login.php') return;
  header('Location: /login.php');
  exit;
}

function user_do_login(string $rawMsisdn, string $password): bool {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '' || $password === '') return false;

  $r = rdb_pdo();
  $targets = nister_username_variants($msisdn);
  $ph = implode(',', array_fill(0, count($targets), '?'));

  $attrs = [
    'Cleartext-Password','Password','Crypt-Password',
    'MD5-Password','SHA-Password','SSHA-Password','SMD5-Password',
    'NT-Password','LM-Password'
  ];
  $ph2 = implode(',', array_fill(0, count($attrs), '?'));

  $st = $r->prepare("SELECT username, attribute, value FROM radcheck WHERE username IN ($ph) AND attribute IN ($ph2)");
  $st->execute(array_merge($targets, $attrs));
  $rows = $st->fetchAll();

  foreach ($rows as $row) {
    $attr = (string)($row['attribute'] ?? '');
    $val  = (string)($row['value'] ?? '');
    if ($attr === '' || $val === '') continue;
    if (radius_password_match($password, $val, $attr)) {
      $_SESSION['user_msisdn'] = $msisdn;
      $_SESSION['user_at'] = time();
      return true;
    }
  }
  return false;
}

function user_do_autologin(string $rawMsisdn, string $ip, string $mac=''): bool {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') return false;
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return false;

  $mac = strtoupper(trim($mac));
  if ($mac !== '' && !preg_match('/^[0-9A-F:]{11,17}$/', $mac)) $mac = '';

  $r = rdb_pdo();
  $targets = nister_username_variants($msisdn);
  $ph = implode(',', array_fill(0, count($targets), '?'));

  $sql = "SELECT 1 FROM radacct
          WHERE acctstoptime IS NULL
            AND framedipaddress = ?
            AND username IN ($ph)";
  $args = array_merge([$ip], $targets);
  if ($mac !== '') {
    $sql .= " AND UPPER(callingstationid) = ?";
    $args[] = $mac;
  }
  $sql .= " ORDER BY acctstarttime DESC LIMIT 1";

  $st = $r->prepare($sql);
  $st->execute($args);
  if ($st->fetchColumn()) {
    $_SESSION['user_msisdn'] = $msisdn;
    $_SESSION['user_at'] = time();
    return true;
  }
  return false;
}

function radius_password_match(string $password, string $stored, string $attr): bool {
  $stored = trim($stored);
  if ($stored === '') return false;

  // Scheme prefix: {SHA}..., {SSHA}..., {MD5}..., {SMD5}..., {CRYPT}...
  if (preg_match('/^\{([A-Za-z0-9_-]+)\}(.*)$/', $stored, $m)) {
    $scheme = strtoupper($m[1]);
    $data = $m[2];
    if ($scheme === 'SHA') {
      return hash_equals(base64_encode(sha1($password, true)), $data);
    }
    if ($scheme === 'SSHA') {
      $raw = base64_decode($data, true);
      if ($raw === false || strlen($raw) < 21) return false;
      $hash = substr($raw, 0, 20);
      $salt = substr($raw, 20);
      return hash_equals($hash, sha1($password . $salt, true));
    }
    if ($scheme === 'MD5') {
      return hash_equals(base64_encode(md5($password, true)), $data);
    }
    if ($scheme === 'SMD5') {
      $raw = base64_decode($data, true);
      if ($raw === false || strlen($raw) < 17) return false;
      $hash = substr($raw, 0, 16);
      $salt = substr($raw, 16);
      return hash_equals($hash, md5($password . $salt, true));
    }
    if ($scheme === 'CRYPT') {
      return hash_equals(crypt($password, $data), $data);
    }
  }

  // bcrypt/argon
  if (preg_match('/^\$2[aby]\$|^\$argon2/i', $stored)) {
    return password_verify($password, $stored);
  }

  $attr = strtoupper($attr);
  if ($attr === 'CRYPT-PASSWORD') {
    return hash_equals(crypt($password, $stored), $stored);
  }

  if ($attr === 'MD5-PASSWORD') {
    $hex = md5($password);
    return hash_equals(strtolower($stored), strtolower($hex));
  }
  if ($attr === 'SHA-PASSWORD') {
    $hex = sha1($password);
    return hash_equals(strtolower($stored), strtolower($hex));
  }
  if ($attr === 'NT-PASSWORD') {
    $bin = hash('md4', iconv('UTF-8', 'UTF-16LE', $password));
    return hash_equals(strtolower($stored), strtolower($bin));
  }

  // cleartext fallback
  return hash_equals($stored, $password);
}
