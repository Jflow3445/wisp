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
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nister Admin - Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#f4f1ea;
      --ink:#1c2329;
      --muted:#5f6a76;
      --accent:#0f766e;
      --card:#fffdfa;
      --line:#e2d6c8;
      --shadow-soft:0 12px 30px rgba(27,35,42,.08);
      --font-display:"Fraunces",serif;
      --font-body:"Sora",sans-serif;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:var(--font-body);
      color:var(--ink);
      background:linear-gradient(180deg,var(--bg) 0%,#efe8de 100%);
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:24px;
    }
    .card{
      background:var(--card);
      border:1px solid var(--line);
      border-radius:18px;
      padding:24px;
      max-width:420px;
      width:100%;
      box-shadow:var(--shadow-soft);
    }
    h1{
      font-family:var(--font-display);
      margin:.2rem 0 .6rem;
      font-size:1.6rem;
    }
    .muted{color:var(--muted);margin-bottom:14px}
    label{display:block;margin:.8rem 0 .3rem;font-weight:600}
    input[type=text],input[type=password]{
      width:100%;
      padding:.7rem .8rem;
      border:1px solid var(--line);
      border-radius:12px;
      font-size:1rem;
    }
    input:focus{outline:2px solid rgba(15,118,110,.2);border-color:var(--accent)}
    .btn{
      margin-top:1rem;
      width:100%;
      padding:.75rem;
      border:0;
      border-radius:12px;
      background:linear-gradient(135deg,var(--accent),#0f8a7f);
      color:#fff;
      font-weight:600;
      cursor:pointer;
    }
    .err{color:#b91c1c;margin:.6rem 0}
    .ok{color:#15803d;margin:.6rem 0}
  </style>
</head>
<body>
  <div class="card">
    <h1>Nister Admin</h1>
    <div class="muted">Sign in to manage payments and approvals.</div>

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
