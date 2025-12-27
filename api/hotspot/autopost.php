<?php
declare(strict_types=1);

/*
 * Hard-stop auto-post to MikroTik login.
 * If upstream layers tried to set a Location header or buffered output,
 * we nuke them so the browser receives THIS HTML.
 */

$username = preg_replace('/\s+/', '', $_POST['username'] ?? '');
$password = (string)($_POST['password'] ?? '');
$dst      = (string)($_POST['dst'] ?? '');

// Only allow our router login endpoint
$defaultLogin = 'https://wifi.nister.org/login';
$linkLoginOnly = (string)($_POST['link_login_only'] ?? $defaultLogin);
$u = parse_url($linkLoginOnly);
if (!$u || !isset($u['scheme'], $u['host']) || !in_array($u['host'], ['wifi.nister.org','192.168.88.1'], true)) {
  $linkLoginOnly = $defaultLogin;
}

// Minimal safety
if ($username === '' || $password === '') {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Signup ok, but missing credentials for autologin. Please log in manually.';
  exit;
}

/* Anti-race: give DB/Radius a beat so first PAP doesn\'t fail */
usleep(800000); // 0.8s

// ---- Defuse any upstream output/headers ----
while (ob_get_level() > 0) { @ob_end_clean(); }
if (function_exists('header_remove')) { @header_remove(); }
http_response_code(200);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

// ---- Output the auto-post page ----
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logging you in…</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<form id="L" action="<?= htmlspecialchars($linkLoginOnly, ENT_QUOTES) ?>" method="post" target="_top">
  <input type="hidden" name="username" value="<?= htmlspecialchars($username, ENT_QUOTES) ?>">
  <input type="hidden" name="password" value="<?= htmlspecialchars($password, ENT_QUOTES) ?>">
  <input type="hidden" name="dst"      value="<?= htmlspecialchars($dst, ENT_QUOTES) ?>">
  <input type="hidden" name="popup"    value="false">
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>
  setTimeout(function(){ document.getElementById('L').submit(); }, 30);
</script>
</body>
</html>
