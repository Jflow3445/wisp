<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
user_boot();
user_logout();
header('Location: /login.php?msg=logged_out');
