<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
$ENV = admin_boot();

if (admin_logged_in()) { header('Location: /admin/index.php'); exit; }

$err = '';
$msg = isset($_GET['msg']) ? (string)$_GET['msg'] : '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $u = trim((string)($_POST['u'] ?? ''));
  $p = (string)($_POST['p'] ?? '');
  if ($u === '' || $p === '') {
    $err = 'Enter username and password.';
  } elseif (admin_do_login($u, $p, $ENV)) {
    header('Location: /admin/index.php'); exit;
  } else {
    $err = 'Invalid credentials.';
  }
}
?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nister Admin · Login</title>
  <style>
    :root{color-scheme:light dark}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:0;background:#f8fafc;display:grid;place-items:center;min-height:100dvh}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;max-width:420px;width:92%}
    h1{margin:.2rem 0 1rem;font-size:1.25rem}
    .muted{color:#64748b}
    label{display:block;margin:.6rem 0 .25rem}
    input[type=text],input[type=password]{width:100%;padding:.6rem;border:1px solid #cbd5e1;border-radius:8px}
    .btn{margin-top:.8rem;display:inline-block;padding:.5rem .8rem;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer}
    .err{color:#dc2626;margin:.5rem 0}
    .ok{color:#16a34a;margin:.5rem 0}
  </style>
</head>
<body>
  <div class="card">
    <h1>Nister Admin</h1>
    <div class="muted">Sign in to continue.</div>

    <?php if ($msg==='logged_out'): ?>
      <div class="ok">You have been logged out.</div>
    <?php endif; ?>

    <?php if ($err!==''): ?>
      <div class="err"><?=htmlspecialchars($err, ENT_QUOTES) ?></div>
    <?php endif; ?>

    <form method="post" action="/admin/login.php" autocomplete="off">
      <label for="u">Username</label>
      <input id="u" name="u" type="text" required autofocus>

      <label for="p">Password</label>
      <input id="p" name="p" type="password" required>

      <button class="btn" type="submit">Login</button>
    </form>
  </div>
</body>
</html>
