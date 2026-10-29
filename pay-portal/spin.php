<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
require_once __DIR__.'/lib/spin/http.php';
spin_headers();
try {
  $env=user_boot(); $game=new SpinService(db_pdo($env),$env);
  if(!user_logged_in())$_SESSION['after_login_path']='/spin.php';
  user_require_login();
  $user=normalize_msisdn(user_msisdn()); $csrf=spin_csrf(); $accountHash=hash('sha256',$user);
  if(!$game->availability()['visible'] && !$game->activeFlight($user)) { http_response_code(404); echo 'Page unavailable. <a href="/">Manage internet access</a>'; exit; }
  require __DIR__.'/views/spin.php';
} catch(Throwable $e) { http_response_code(503); echo 'Temporarily unavailable. Your wallet and internet services remain available at <a href="/">Manage access</a>.'; }
