<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
require_once __DIR__.'/../lib/spin/http.php';
spin_headers(); $env=admin_boot(); admin_require_login();
if(!spin_is_manager((string)$_SESSION['admin_user'],$env)) { http_response_code(403); echo 'Game manager permission required.'; exit; }
(new SpinService(db_pdo($env),$env))->recognizeAdminSession((string)$_SESSION['admin_user'],(int)($_SESSION['admin_at']??0));
$csrf=admin_csrf_token();
require __DIR__.'/../views/spin-admin.php';
