<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';

function admin_request_is_secure(): bool {
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
  $xfp = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
  if ($xfp === 'https') return true;
  return false;
}

function admin_boot(): array {
  $env = app_boot();
  if (session_status() !== PHP_SESSION_ACTIVE) {
    if (session_name() !== 'nister_admin') {
      session_name('nister_admin');
    }
    $secure = admin_request_is_secure();
    $params = session_get_cookie_params();
    session_set_cookie_params([
      'lifetime' => $params['lifetime'],
      'path'     => $params['path'] ?: '/',
      'domain'   => $params['domain'],
      'secure'   => $secure,
      'httponly' => true,
      'samesite' => 'Strict',
    ]);
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.cookie_httponly', '1');
    if ($secure) @ini_set('session.cookie_secure', '1');
    session_start();
  }
  admin_csrf_token();

  // Handle logout anywhere (index has ?logout=1 link)
  if (isset($_GET['logout'])) {
    admin_logout();
    header('Location: /admin/login.php?msg=logged_out');
    exit;
  }
  return $env;
}

function admin_logged_in(): bool {
  return !empty($_SESSION['admin_user']);
}

function admin_login_rate_limit_key(string $username): string {
  $ip = '';
  if (function_exists('nister_client_ip')) {
    $env = (isset($GLOBALS['ENV']) && is_array($GLOBALS['ENV'])) ? $GLOBALS['ENV'] : [];
    $ip = trim((string)nister_client_ip($env));
  }
  if ($ip === '') $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
  return strtolower(trim($username)) . '|' . $ip;
}

function admin_login_rate_limit_allow(string $username): array {
  return nister_rate_limit_allow('admin_login', admin_login_rate_limit_key($username), 8, 900, 900);
}

function admin_login_rate_limit_hit(string $username): array {
  return nister_rate_limit_hit('admin_login', admin_login_rate_limit_key($username), 8, 900, 900);
}

function admin_login_rate_limit_clear(string $username): void {
  nister_rate_limit_clear('admin_login', admin_login_rate_limit_key($username));
}

function admin_do_login(string $u, string $p, array $env): bool {
  $gate = admin_login_rate_limit_allow($u);
  if (!($gate['allowed'] ?? false)) return false;

  $U = $env['APP_ADMIN_USER'] ?? '';
  $H = $env['APP_ADMIN_PASS_HASH'] ?? '';
  if ($U !== '' && $H !== '' && hash_equals($U, $u) && password_verify($p, $H)) {
    if (session_status() === PHP_SESSION_ACTIVE) {
      session_regenerate_id(true);
    }
    $_SESSION['admin_user'] = $U;
    $_SESSION['admin_at']   = time();
    admin_csrf_token(true);
    admin_login_rate_limit_clear($u);
    return true;
  }
  admin_login_rate_limit_hit($u);
  return false;
}

function admin_logout(): void {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time()-42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
  }
  session_destroy();
}

function admin_require_login(): void {
  if (admin_logged_in()) return;

  $uri  = $_SERVER['REQUEST_URI'] ?? '';
  $path = (string)(parse_url($uri, PHP_URL_PATH) ?? '');
  // Allow the login page to render without redirect looping
  if ($path === '/admin/login.php') return;

  header('Location: /admin/login.php');
  exit;
}

function admin_csrf_token(bool $rotate=false): string {
  if (session_status() !== PHP_SESSION_ACTIVE) return '';
  $cur = (string)($_SESSION['admin_csrf'] ?? '');
  if ($rotate || $cur === '') {
    try {
      $cur = bin2hex(random_bytes(32));
    } catch (Throwable $e) {
      $cur = hash('sha256', uniqid('admin_csrf_', true).microtime(true));
    }
    $_SESSION['admin_csrf'] = $cur;
  }
  return $cur;
}

function admin_verify_csrf(?string $provided): bool {
  if (session_status() !== PHP_SESSION_ACTIVE) return false;
  $expected = (string)($_SESSION['admin_csrf'] ?? '');
  $token = trim((string)$provided);
  if ($expected === '' || $token === '') return false;
  return hash_equals($expected, $token);
}

function admin_require_csrf_post(): void {
  $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return;
  $provided = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? ''));
  if (!admin_verify_csrf($provided)) {
    http_response_code(419);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>'csrf_invalid']);
    exit;
  }
}
