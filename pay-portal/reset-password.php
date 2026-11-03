<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

// One recovery form and OTP implementation for the router and account portal.
$hotspot = __DIR__.'/../hotspot';
$page = @file_get_contents($hotspot.'/reset-password.html');
$css = @file_get_contents($hotspot.'/common.css');
$config = @file_get_contents($hotspot.'/config.js');
if ($page === false || $css === false || $config === false) {
    http_response_code(503);
    echo '<!doctype html><meta charset="utf-8"><title>Reset password</title><main><h1>Reset password</h1><p>Password reset is temporarily unavailable.</p><a href="/login.php">Return to sign in</a></main>';
    exit;
}

$page = preg_replace_callback('~<link rel="stylesheet" href="common\.css[^\"]*">~', static fn() => '<style>'.$css.'</style>', $page, 1);
$page = str_replace('id="reset_form"', 'id="reset_form" data-login-url="/login.php"', $page);
$page = preg_replace('~(<form id="reset_form"[^>]*>)~', '$1<input type="hidden" name="recovery_context" value="portal">', $page, 1);
$page = str_replace(['$(mac)', '$(link-login-only)', '<script src="config.js"></script>'], ['', '', '<script>'.$config.'</script>'], $page);
echo $page;
