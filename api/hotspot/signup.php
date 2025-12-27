<?php
declare(strict_types=1);

/*
  EXPECTED FLOW (already working on your side):
  - Validate inputs
  - Create user in your DB / radcheck (Cleartext-Password or equivalent)
  - Then return a tiny HTML that auto-POSTs to MikroTik /login (PAP over HTTPS)
*/

// --- Input normalization ---
$username = preg_replace("/\s+/", "", $_POST["username"] ?? "");
$password = (string)($_POST["password"] ?? "");
$dst      = (string)($_POST["dst"] ?? "");
$linkLoginOnly = (string)($_POST["link_login_only"] ?? "https://wifi.nister.org/login");

// Minimal safety
if ($username === "" || $password === "") {
  http_response_code(400);
  header("Content-Type: text/plain; charset=utf-8");
  echo "Signup ok, but missing credentials for autologin. Please log in manually.";
  exit;
}

/* -------------------------------------------------------------------------
 * IMPORTANT: anti-race guard
 * Some stacks (SQL -> FreeRADIUS, or your API layer) need a beat before the
 * NAS can authenticate the *brand new* user. A short sleep saves you from
 * the first-try \"invalid username/password\" even though the account exists.
 * Tune between 300–1500 ms as needed (start with 800 ms).
 * -----------------------------------------------------------------------*/
usleep(800000); // 0.8 seconds

// Return tiny page that auto-posts credentials to MikroTik login.
header("Content-Type: text/html; charset=utf-8");
header("Cache-Control: no-store");
header("X-Robots-Tag: noindex");
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
  // Give the browser a single paint before submit (very defensive)
  setTimeout(function(){ document.getElementById("L").submit(); }, 30);
</script>
</body>
</html>
