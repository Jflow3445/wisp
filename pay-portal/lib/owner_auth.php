<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/owner_schema.php';

function owner_request_is_secure(): bool {
  if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return true;
  $xfp = strtolower(trim((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')));
  if ($xfp !== '') {
    $first = trim((string)(explode(',', $xfp)[0] ?? ''));
    if ($first === 'https') return true;
  }
  return false;
}

function owner_boot(): array {
  $env = app_boot();

  if (session_status() === PHP_SESSION_ACTIVE) {
    if (session_name() !== 'nister_owner') {
      throw new RuntimeException('owner session cannot share an active non-owner session');
    }
  } else {
    if (session_name() !== 'nister_owner') {
      session_name('nister_owner');
    }
    $secure = owner_request_is_secure();
    $params = session_get_cookie_params();
    session_set_cookie_params([
      'lifetime' => $params['lifetime'],
      'path' => $params['path'] ?: '/',
      'domain' => $params['domain'],
      'secure' => $secure,
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.cookie_httponly', '1');
    @ini_set('session.cookie_samesite', 'Lax');
    if ($secure) @ini_set('session.cookie_secure', '1');
    session_start();
  }

  owner_csrf_token();
  return $env;
}

function owner_noindex_headers(): void {
  if (!headers_sent()) {
    header('X-Robots-Tag: noindex, nofollow', false);
  }
}

function owner_csrf_token(bool $rotate = false): string {
  if (session_status() !== PHP_SESSION_ACTIVE) return '';
  $cur = (string)($_SESSION['owner_csrf'] ?? '');
  if ($rotate || $cur === '') {
    try {
      $cur = bin2hex(random_bytes(32));
    } catch (Throwable $e) {
      $cur = hash('sha256', uniqid('owner_csrf_', true) . microtime(true));
    }
    $_SESSION['owner_csrf'] = $cur;
  }
  return $cur;
}

function owner_verify_csrf(?string $provided): bool {
  if (session_status() !== PHP_SESSION_ACTIVE) return false;
  $expected = (string)($_SESSION['owner_csrf'] ?? '');
  $token = trim((string)$provided);
  if ($expected === '' || $token === '') return false;
  return hash_equals($expected, $token);
}

function owner_require_csrf_post(): void {
  $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return;
  $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? ($_POST['csrf'] ?? '')));
  if (owner_verify_csrf($provided)) return;

  http_response_code(419);
  if (!headers_sent()) {
    header('Content-Type: text/plain; charset=utf-8');
  }
  echo 'Security check failed. Refresh the page and try again.';
  exit;
}

function owner_require_same_origin_post(): void {
  $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if ($method !== 'POST') return;
  if (nister_is_same_origin_request()) return;

  http_response_code(403);
  if (!headers_sent()) {
    header('Content-Type: text/plain; charset=utf-8');
  }
  echo 'This form can only be submitted from the owner portal.';
  exit;
}

function owner_logged_in(): bool {
  return !empty($_SESSION['owner_id']) && (int)$_SESSION['owner_id'] > 0;
}

function owner_pdo(): PDO {
  if (isset($GLOBALS['PDO']) && $GLOBALS['PDO'] instanceof PDO) {
    return $GLOBALS['PDO'];
  }
  require_once __DIR__ . '/db.php';
  if (isset($PDO) && $PDO instanceof PDO) {
    return $PDO;
  }
  if (isset($GLOBALS['PDO']) && $GLOBALS['PDO'] instanceof PDO) {
    return $GLOBALS['PDO'];
  }
  throw new RuntimeException('owner database is not available');
}

function owner_find_by_id(PDO $pdo, int $ownerId): ?array {
  if ($ownerId <= 0) return null;
  $st = $pdo->prepare("SELECT * FROM property_owners WHERE id = :id LIMIT 1");
  $st->execute([':id' => $ownerId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function owner_find_by_msisdn(PDO $pdo, string $rawMsisdn): ?array {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') return null;
  $st = $pdo->prepare("SELECT * FROM property_owners WHERE msisdn = :m LIMIT 1");
  $st->execute([':m' => $msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function owner_session_snapshot(array $owner): array {
  return [
    'id' => (int)($owner['id'] ?? 0),
    'msisdn' => (string)($owner['msisdn'] ?? ''),
    'display_name' => (string)($owner['display_name'] ?? ''),
    'status' => (string)($owner['status'] ?? ''),
  ];
}

function owner_start_session_for_owner(array $owner): void {
  if (session_status() !== PHP_SESSION_ACTIVE) {
    owner_boot();
  }
  if (session_status() === PHP_SESSION_ACTIVE) {
    session_regenerate_id(true);
  }
  $snapshot = owner_session_snapshot($owner);
  $_SESSION['owner_id'] = $snapshot['id'];
  $_SESSION['owner_msisdn'] = $snapshot['msisdn'];
  $_SESSION['owner_display_name'] = $snapshot['display_name'];
  $_SESSION['owner_status'] = $snapshot['status'];
  $_SESSION['owner_at'] = time();
  owner_csrf_token(true);
}

function owner_current(): ?array {
  if (!owner_logged_in()) return null;
  $ownerId = (int)($_SESSION['owner_id'] ?? 0);
  try {
    $pdo = owner_pdo();
    owner_schema_bootstrap($pdo);
    $owner = owner_find_by_id($pdo, $ownerId);
  } catch (Throwable $e) {
    return [
      'id' => $ownerId,
      'msisdn' => (string)($_SESSION['owner_msisdn'] ?? ''),
      'display_name' => (string)($_SESSION['owner_display_name'] ?? ''),
      'status' => (string)($_SESSION['owner_status'] ?? ''),
    ];
  }
  if ($owner === null) {
    owner_logout();
    return null;
  }
  $snapshot = owner_session_snapshot($owner);
  $_SESSION['owner_msisdn'] = $snapshot['msisdn'];
  $_SESSION['owner_display_name'] = $snapshot['display_name'];
  $_SESSION['owner_status'] = $snapshot['status'];
  return $owner;
}

function owner_require_login(bool $json = false): void {
  if (owner_logged_in()) return;

  if ($json) {
    json_out(['ok' => false, 'error' => 'unauthorized'], 401);
  }

  $uri = $_SERVER['REQUEST_URI'] ?? '';
  $path = (string)(parse_url($uri, PHP_URL_PATH) ?? '');
  if ($path === '/owner/login.php') return;
  header('Location: /owner/login.php');
  exit;
}

function owner_require_approved(bool $json = false): void {
  owner_require_login($json);
  $owner = owner_current();
  if (is_array($owner) && (string)($owner['status'] ?? '') === 'approved') return;

  if ($json) {
    $status = is_array($owner) ? (string)($owner['status'] ?? 'pending') : 'pending';
    json_out(['ok' => false, 'error' => 'owner_not_approved', 'status' => $status], 403);
  }

  header('Location: /owner/dashboard.php');
  exit;
}

function owner_login_rate_limit_key(string $rawMsisdn): string {
  $clientIp = nister_client_ip();
  if ($clientIp === '') $clientIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
  $msisdn = normalize_msisdn($rawMsisdn);
  $userKey = $msisdn !== '' ? $msisdn : strtolower(trim($rawMsisdn));
  return $clientIp . '|' . $userKey;
}

function owner_do_login(string $rawMsisdn, string $password): bool {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '' || $password === '') return false;

  $rateKey = owner_login_rate_limit_key($msisdn);
  $gate = nister_rate_limit_allow('owner_login', $rateKey, 6, 600, 900);
  if (!($gate['allowed'] ?? false)) return false;

  $pdo = owner_pdo();
  owner_schema_bootstrap($pdo);
  $owner = owner_find_by_msisdn($pdo, $msisdn);
  $hash = is_array($owner) ? trim((string)($owner['password_hash'] ?? '')) : '';
  $status = is_array($owner) ? (string)($owner['status'] ?? '') : '';
  if (
    is_array($owner)
    && $hash !== ''
    && $status !== 'suspended'
    && password_verify($password, $hash)
  ) {
    owner_start_session_for_owner($owner);
    nister_rate_limit_clear('owner_login', $rateKey);
    return true;
  }

  nister_rate_limit_hit('owner_login', $rateKey, 6, 600, 900);
  return false;
}

function owner_logout(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) return;
  if (session_name() !== 'nister_owner') return;

  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
      'expires' => time() - 42000,
      'path' => $params['path'] ?: '/',
      'domain' => $params['domain'],
      'secure' => (bool)$params['secure'],
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
  }
  session_destroy();
}
