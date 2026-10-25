<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';
require_once __DIR__.'/radius.php';
require_once __DIR__.'/location.php';
require_once __DIR__.'/account_access.php';

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

  // Capture site hint from router/query/post as early as possible.
  try {
    location_capture_from_request();
    if (location_session_get_id() === null) {
      $d = location_default_id();
      $c = (string)(location_find_by_id($d)['code'] ?? location_default_code());
      location_session_set($d, $c);
    }
    if (user_logged_in()) {
      $loc = location_resolve_for_user((string)$_SESSION['user_msisdn'], null, false);
      $_SESSION['user_location_id'] = (int)($loc['id'] ?? 0);
      $_SESSION['user_location_code'] = (string)($loc['code'] ?? '');
    }
  } catch (Throwable $e) {
    // non-fatal
  }

  if (isset($_GET['logout'])) {
    user_logout();
    header('Location: /login.php?msg=logged_out');
    exit;
  }

  return $env;
}

function user_logged_in(): bool {
  if (empty($_SESSION['user_msisdn'])) return false;
  $pdo = rdb_pdo();
  $user = (string)$_SESSION['user_msisdn'];
  if (!account_access_session_valid($pdo, $user, (int)($_SESSION['user_access_revision'] ?? 0))) {
    user_logout();
    return false;
  }
  return true;
}

function user_msisdn(): string {
  return (string)($_SESSION['user_msisdn'] ?? '');
}

function user_msisdn_display(): string {
  $u = user_msisdn();
  return $u !== '' ? msisdn_display($u) : '';
}

function user_location_id(): ?int {
  $id = (int)($_SESSION['user_location_id'] ?? 0);
  if ($id > 0) return $id;
  $sid = location_session_get_id();
  if ($sid !== null && $sid > 0) return $sid;
  return null;
}

function user_location_code(): string {
  $code = location_normalize_code((string)($_SESSION['user_location_code'] ?? ''));
  if ($code !== '') return $code;
  $scode = location_session_get_code();
  if ($scode !== null) return $scode;
  return '';
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
  $locCode = location_session_get_code();
  $target = '/login.php';
  if ($locCode !== null && $locCode !== '') {
    $target .= '?location_code='.rawurlencode($locCode);
  }
  header('Location: '.$target);
  exit;
}

function user_sync_radius_auth_variants(string $msisdn, string $password): ?int {
  $msisdn = normalize_msisdn($msisdn);
  if ($msisdn === '' || $password === '') return null;

  try {
    $r = rdb_pdo();
    $targets = array_values(array_unique(array_filter(nister_username_variants($msisdn))));
    if (!$targets) return null;

    $passAttrs = [
      'Cleartext-Password','Password','Crypt-Password',
      'MD5-Password','SHA-Password','SSHA-Password','SMD5-Password',
      'NT-Password','LM-Password'
    ];

    $ph = implode(',', array_fill(0, count($targets), '?'));
    $ph2 = implode(',', array_fill(0, count($passAttrs), '?'));
    $started = false;
    if (!$r->inTransaction()) { $r->beginTransaction(); $started = true; }

    try {
      $revision = account_access_lock($r, $msisdn);
      $fresh = $r->prepare("SELECT attribute,value FROM radcheck WHERE username IN ($ph) AND attribute IN ($ph2)");
      $fresh->execute(array_merge($targets, $passAttrs));
      $valid = false;
      foreach ($fresh->fetchAll(PDO::FETCH_ASSOC) as $credential) {
        if (radius_password_match($password, (string)$credential['value'], (string)$credential['attribute'])) $valid = true;
      }
      if (!$valid) throw new RuntimeException('account_credentials_changed');
      $del = $r->prepare("DELETE FROM radcheck WHERE username IN ($ph) AND attribute IN ($ph2)");
      $del->execute(array_merge($targets, $passAttrs));

      $upPass = $r->prepare(
        "INSERT INTO radcheck (username, attribute, op, value)
         VALUES (?, 'Cleartext-Password', ':=', ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), op=':='"
      );
      foreach ($targets as $u) {
        $upPass->execute([$u, $password]);
      }

      // Keep Expiration aligned so both variants share the same auth window.
      $stExp = $r->prepare(
        "SELECT value, COALESCE(NULLIF(op,''),':=') AS op
         FROM radcheck
         WHERE username IN ($ph) AND attribute='Expiration'
         ORDER BY id DESC
         LIMIT 1"
      );
      $stExp->execute($targets);
      $exp = $stExp->fetch(PDO::FETCH_ASSOC) ?: null;
      if ($exp && (string)($exp['value'] ?? '') !== '') {
        $expOp = (string)($exp['op'] ?? ':=');
        if (!in_array($expOp, [':=','=','==','=~','!~','!=','<','<=','>','>='], true)) {
          $expOp = ':=';
        }
        $upExp = $r->prepare(
          "INSERT INTO radcheck (username, attribute, op, value)
           VALUES (?, 'Expiration', ?, ?)
           ON DUPLICATE KEY UPDATE value=VALUES(value), op=VALUES(op)"
        );
        foreach ($targets as $u) {
          $upExp->execute([$u, $expOp, (string)$exp['value']]);
        }
      }

      // Keep session cap canonical across username variants.
      $simOp = ':=';
      $simVal = radius_simultaneous_use_limit();
      $upSim = $r->prepare(
        "INSERT INTO radcheck (username, attribute, op, value)
         VALUES (?, 'Simultaneous-Use', ?, ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), op=VALUES(op)"
      );
      foreach ($targets as $u) {
        $upSim->execute([$u, $simOp, $simVal]);
      }

      if ($started && $r->inTransaction()) $r->commit();
      return $revision;
    } catch (Throwable $e) {
      if ($started && $r->inTransaction()) $r->rollBack();
      throw $e;
    }
  } catch (Throwable $e) {
    // A concurrent reset or purge must invalidate the earlier password check.
    return null;
  }
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
      $revision = user_sync_radius_auth_variants($msisdn, $password);
      if ($revision === null) return false;
      if (session_status() === PHP_SESSION_ACTIVE) {
        @session_regenerate_id(true);
      }
      $_SESSION['user_msisdn'] = $msisdn;
      $_SESSION['user_at'] = time();
      $_SESSION['user_access_revision'] = $revision;
      try {
        $hintCode = location_session_get_code();
        if ($hintCode === null || $hintCode === '') {
          $hintCode = location_normalize_code((string)($_POST['location_code'] ?? $_GET['location_code'] ?? ''));
        }
        $loc = location_resolve_for_user($msisdn, $hintCode !== '' ? $hintCode : null, true, 'login');
        $_SESSION['user_location_id'] = (int)($loc['id'] ?? 0);
        $_SESSION['user_location_code'] = (string)($loc['code'] ?? '');
      } catch (Throwable $e) { /* non-fatal */ }
      return true;
    }
  }
  return false;
}

function user_do_autologin(string $rawMsisdn, string $ip, string $mac=''): bool {
  // Legacy autologin is intentionally disabled.
  unset($rawMsisdn, $ip, $mac);
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
