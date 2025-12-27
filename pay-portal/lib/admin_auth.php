<?php
declare(strict_types=1);
require_once __DIR__.'/common.php';

function admin_boot(): array {
  $env = app_boot();
  if (session_status() !== PHP_SESSION_ACTIVE) session_start();

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

function admin_do_login(string $u, string $p, array $env): bool {
  $U = $env['APP_ADMIN_USER'] ?? '';
  $H = $env['APP_ADMIN_PASS_HASH'] ?? '';
  if ($U !== '' && $H !== '' && hash_equals($U, $u) && password_verify($p, $H)) {
    $_SESSION['admin_user'] = $U;
    $_SESSION['admin_at']   = time();
    return true;
  }
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
