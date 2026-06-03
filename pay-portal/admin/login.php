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
    $gate = admin_login_rate_limit_allow($u);
    if (!($gate['allowed'] ?? false)) {
      $retry = (int)($gate['retry_after'] ?? 0);
      $err = $retry > 0
        ? 'Too many attempts. Try again in ' . $retry . ' seconds.'
        : 'Too many attempts. Try again shortly.';
    } else {
      $err = 'Invalid credentials.';
    }
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
      --surface:#172025;
      --surface-2:#202b31;
      --ink:#1c2329;
      --muted:#5f6a76;
      --accent:#0f766e;
      --accent-2:#b45309;
      --green:#0f766e;
      --card:#fffdfa;
      --line:#e2d6c8;
      --shadow-soft:0 20px 60px rgba(27,35,42,.16);
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
      letter-spacing:0;
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      z-index:-1;
      background:
        radial-gradient(900px 480px at 8% -10%,rgba(15,118,110,.18),transparent 60%),
        radial-gradient(760px 420px at 92% 0%,rgba(180,83,9,.14),transparent 60%);
    }
    .card{
      background:var(--card);
      border:1px solid var(--line);
      border-radius:18px;
      padding:24px;
      max-width:430px;
      width:100%;
      box-shadow:var(--shadow-soft);
    }
    .brand-row{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .mark{width:38px;height:38px;border-radius:12px;display:grid;grid-template-columns:repeat(3,1fr);align-items:end;gap:3px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border:1px solid rgba(15,118,110,.22);padding:7px;box-shadow:0 12px 24px rgba(15,118,110,.22)}
    .mark::before,.mark::after,.mark span{content:"";display:block;width:100%;border-radius:3px;background:#fffdfa}
    .mark::before{height:8px}.mark span{height:14px}.mark::after{height:20px}
    .brand-name{font-weight:800;color:var(--ink)}
    .brand-tag{font-size:.82rem;color:var(--muted)}
    h1{
      font-family:var(--font-display);
      margin:.2rem 0 .6rem;
      font-size:1.6rem;
      letter-spacing:0;
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
    input:focus{outline:3px solid rgba(15,118,110,.18);border-color:var(--accent)}
    .password-wrap{position:relative}
    .password-wrap input{padding-right:78px}
    .password-toggle{
      position:absolute;right:8px;top:50%;transform:translateY(-50%);
      border:1px solid var(--line);border-radius:10px;background:#fffefb;color:var(--accent);
      font-weight:800;font-size:.82rem;padding:7px 10px;cursor:pointer;
    }
    .password-toggle:focus{outline:3px solid rgba(15,118,110,.18)}
    .btn{
      margin-top:1rem;
      width:100%;
      padding:.75rem;
      border:0;
      border-radius:12px;
      background:linear-gradient(135deg,var(--accent),#0f8a7f);
      color:#fff;
      font-weight:800;
      cursor:pointer;
      box-shadow:0 12px 24px rgba(15,118,110,.22);
    }
    .err{color:#b91c1c;margin:.6rem 0}
    .ok{color:#15803d;margin:.6rem 0}
  </style>
  <link rel="stylesheet" href="/assets/premium.css?v=20260603-premium5">
</head>
<body class="admin-auth">
  <main class="auth-shell">
    <section class="auth-brand" aria-label="Nister admin portal">
      <div class="brand-row">
        <div class="mark"><span></span></div>
        <div>
          <div class="brand-name">Nister WiFi</div>
          <div class="brand-tag">Admin Portal</div>
        </div>
      </div>
      <div>
        <h2>Operations command center.</h2>
        <p>Review deposits, watch service health, manage users, and keep the network running from a single controlled workspace.</p>
      </div>
      <div class="auth-meta" aria-hidden="true">
        <span>Billing</span>
        <span>Users</span>
        <span>Network</span>
      </div>
    </section>
    <section class="card auth-card">
    <div class="brand-row">
      <div class="mark"><span></span></div>
      <div>
        <div class="brand-name">Nister WiFi</div>
        <div class="brand-tag">Admin Portal</div>
      </div>
    </div>
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
      <div class="password-wrap">
        <input id="p" name="p" type="password" autocomplete="current-password" required>
        <button class="password-toggle" type="button" data-password-toggle="p" aria-controls="p" aria-pressed="false">Show</button>
      </div>

      <button class="btn" type="submit">Login</button>
    </form>
    </section>
  </main>
  <script>
    (function(){
      var btn = document.querySelector('[data-password-toggle]');
      if (!btn) return;
      var input = document.getElementById(btn.getAttribute('data-password-toggle'));
      if (!input) return;
      btn.addEventListener('click', function(){
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      });
    })();
  </script>
</body>
</html>
