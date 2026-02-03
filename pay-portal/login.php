<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
$ENV = user_boot();

$err = '';
$msg = (string)($_GET['msg'] ?? '');
$prefill = (string)($_GET['username'] ?? $_GET['user'] ?? $_GET['msisdn'] ?? '');
$prefill = msisdn_display(normalize_msisdn($prefill)) ?: $prefill;

if (!user_logged_in() && isset($_GET['autologin']) && $_GET['autologin'] !== '0') {
  $u = (string)($_GET['username'] ?? $_GET['user'] ?? $_GET['msisdn'] ?? '');
  $ip = (string)($_GET['ip'] ?? '');
  $mac = (string)($_GET['mac'] ?? '');
  if ($u !== '' && $ip !== '' && user_do_autologin($u, $ip, $mac)) {
    header('Location: /index.php');
    exit;
  } else {
    $err = 'Please login to continue.';
  }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $msisdn = (string)($_POST['msisdn'] ?? '');
  $pass   = (string)($_POST['password'] ?? '');
  if ($msisdn === '' || $pass === '') {
    $err = 'Please enter your number and password.';
  } elseif (user_do_login($msisdn, $pass)) {
    header('Location: /index.php');
    exit;
  } else {
    $err = 'Login failed. Check your number and password.';
  }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nister WiFi | Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#f4f1ea;--ink:#1c2329;--muted:#5f6a76;--accent:#0f766e;--card:#fffdfa;--line:#e2d6c8;--shadow:0 20px 60px rgba(27,35,42,.12);--radius:18px;--font-display:"Fraunces",serif;--font-body:"Sora",sans-serif;
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:var(--font-body);background:linear-gradient(180deg,var(--bg) 0%,#efe8de 100%);color:var(--ink);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);width:min(420px,100%)}
    h1{font-family:var(--font-display);margin:0 0 8px}
    .muted{color:var(--muted);font-size:.95rem;margin-bottom:16px}
    .field{margin:12px 0}
    .label{display:block;margin-bottom:6px;color:var(--muted);font-size:.85rem}
    input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;font-size:1rem}
    input:focus{outline:2px solid rgba(15,118,110,.25);border-color:var(--accent)}
    .btn{appearance:none;border:0;border-radius:12px;padding:12px 16px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,var(--accent),#0f8a7f);color:#fff;width:100%}
    .msg{padding:10px 12px;border-radius:12px;margin-bottom:12px;font-size:.9rem}
    .msg.err{background:#fff0f0;border:1px solid #f2b8b8;color:#842029}
    .msg.ok{background:#f1fbf7;border:1px solid #bfe8d7;color:#0f5132}
    .links{margin-top:14px;text-align:center;font-size:.9rem}
    .links a{color:var(--accent);text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome back</h1>
    <div class="muted">Use the same credentials as your captive portal login.</div>
    <?php if ($msg === 'logged_out'): ?>
      <div class="msg ok">You are logged out.</div>
    <?php endif; ?>
    <?php if ($err !== ''): ?>
      <div class="msg err"><?=htmlspecialchars($err, ENT_QUOTES, 'UTF-8')?></div>
    <?php endif; ?>
    <form method="post" action="/login.php" autocomplete="off">
      <div class="field">
        <label class="label" for="msisdn">Phone number</label>
        <input id="msisdn" name="msisdn" type="tel" placeholder="e.g. 059xxxxxxx" value="<?=htmlspecialchars($prefill, ENT_QUOTES, 'UTF-8')?>" required>
      </div>
      <div class="field">
        <label class="label" for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Your hotspot password" required>
      </div>
      <button class="btn" type="submit">Login</button>
    </form>
    <div class="links">
      <a href="/index.php">Back to pay portal</a>
    </div>
  </div>
</body>
</html>
