<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
$ENV = user_boot();

$err = '';
$msg = (string)($_GET['msg'] ?? '');
$prefill = (string)($_GET['username'] ?? $_GET['user'] ?? $_GET['msisdn'] ?? '');
$prefill = msisdn_display(normalize_msisdn($prefill)) ?: $prefill;
$locationCode = location_normalize_code((string)($_GET['location_code'] ?? $_GET['site_code'] ?? $_POST['location_code'] ?? ''));
if ($locationCode === '') {
  $sCode = location_session_get_code();
  if ($sCode !== null) $locationCode = $sCode;
}

function login_retry_message(int $retryAfter): string {
  $retryAfter = max(1, $retryAfter);
  if ($retryAfter < 60) return "Too many attempts. Try again in {$retryAfter} seconds.";
  $mins = (int)ceil($retryAfter / 60);
  return "Too many attempts. Try again in {$mins} minute(s).";
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $msisdn = (string)($_POST['msisdn'] ?? '');
  $pass   = (string)($_POST['password'] ?? '');
  if ($msisdn === '' || $pass === '') {
    $err = 'Please enter your number and password.';
  } else {
    $clientIp = nister_client_ip($ENV);
    if ($clientIp === '') $clientIp = 'unknown';
    $msisdnNorm = normalize_msisdn($msisdn);
    $userKey = ($msisdnNorm !== '') ? $msisdnNorm : strtolower(trim($msisdn));
    $ipKey = $clientIp;
    $comboKey = $clientIp . '|' . $userKey;

    $ipGate = nister_rate_limit_allow('portal_login_ip', $ipKey, 10, 600, 900);
    $userGate = nister_rate_limit_allow('portal_login_user', $comboKey, 6, 600, 900);
    if (!($ipGate['allowed'] ?? false) || !($userGate['allowed'] ?? false)) {
      $retryAfter = max((int)($ipGate['retry_after'] ?? 0), (int)($userGate['retry_after'] ?? 0));
      $err = login_retry_message($retryAfter > 0 ? $retryAfter : 60);
    } elseif (user_do_login($msisdn, $pass)) {
      nister_rate_limit_clear('portal_login_ip', $ipKey);
      nister_rate_limit_clear('portal_login_user', $comboKey);
      header('Location: /portal.php');
      exit;
    } else {
      $ipHit = nister_rate_limit_hit('portal_login_ip', $ipKey, 10, 600, 900);
      $userHit = nister_rate_limit_hit('portal_login_user', $comboKey, 6, 600, 900);
      if (!($ipHit['allowed'] ?? true) || !($userHit['allowed'] ?? true)) {
        $retryAfter = max((int)($ipHit['retry_after'] ?? 0), (int)($userHit['retry_after'] ?? 0));
        $err = login_retry_message($retryAfter > 0 ? $retryAfter : 60);
      } else {
        $err = 'Login failed. Check the phone number and hotspot password, then try again.';
      }
    }
  }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nister WiFi | Login</title>
  <link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#f4f1ea;--surface:#172025;--surface-2:#202b31;--ink:#1c2329;--muted:#5f6a76;--accent:#0f766e;--accent-2:#b45309;--green:#0f766e;--card:#fffdfa;--line:#e2d6c8;--line-dark:#334047;--shadow:0 20px 60px rgba(27,35,42,.16);--radius:18px;--font-display:"Fraunces",serif;--font-body:"Sora",sans-serif;
    }
    *{box-sizing:border-box}
    body{
      margin:0;font-family:var(--font-body);color:var(--ink);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;letter-spacing:0;
      background:linear-gradient(180deg,var(--bg) 0%,#efe8de 100%);
    }
    body::before{
      content:"";position:fixed;inset:0;z-index:-1;
      background:
        radial-gradient(900px 480px at 8% -10%,rgba(15,118,110,.18),transparent 60%),
        radial-gradient(760px 420px at 92% 0%,rgba(180,83,9,.14),transparent 60%);
    }
    .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);width:min(430px,100%)}
    .brand-row{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .mark{width:38px;height:38px;border-radius:12px;display:grid;grid-template-columns:repeat(3,1fr);align-items:end;gap:3px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border:1px solid rgba(15,118,110,.22);padding:7px;box-shadow:0 12px 24px rgba(15,118,110,.22)}
    .mark::before,.mark::after,.mark span{content:"";display:block;width:100%;border-radius:3px;background:#fffdfa}
    .mark::before{height:8px}.mark span{height:14px}.mark::after{height:20px}
    .brand-name{font-weight:800;color:var(--ink)}
    .brand-tag{font-size:.82rem;color:var(--muted)}
    h1{font-family:var(--font-display);margin:0 0 8px;letter-spacing:0}
    .muted{color:var(--muted);font-size:.95rem;margin-bottom:16px}
    .field{margin:12px 0}
    .label{display:block;margin-bottom:6px;color:var(--muted);font-size:.85rem}
    input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;font-size:1rem}
    input:focus{outline:3px solid rgba(15,118,110,.18);border-color:var(--accent)}
    .password-wrap{position:relative}
    .password-wrap input{padding-right:78px}
    .password-toggle{
      position:absolute;right:8px;top:50%;transform:translateY(-50%);
      border:1px solid var(--line);border-radius:10px;background:#fffefb;color:var(--accent);
      font-weight:800;font-size:.82rem;padding:7px 10px;cursor:pointer;
    }
    .password-toggle:focus{outline:3px solid rgba(15,118,110,.18)}
    .btn{appearance:none;border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--accent),#0f8a7f);color:#fff;width:100%;min-height:46px;box-shadow:0 12px 24px rgba(15,118,110,.22)}
    .msg{padding:10px 12px;border-radius:12px;margin-bottom:12px;font-size:.9rem}
    .msg.err{background:#fff0f0;border:1px solid #f2b8b8;color:#842029}
    .msg.ok{background:#f1fbf7;border:1px solid #bfe8d7;color:#0f5132}
    .links{margin-top:14px;text-align:center;font-size:.9rem}
    .links a{color:var(--accent);text-decoration:none;font-weight:600}
  </style>
  <link rel="stylesheet" href="/assets/premium.css?v=20260603-premium5">
</head>
<body class="pay-auth">
  <main class="auth-shell">
    <section class="auth-brand" aria-label="Nister WiFi pay portal">
      <div class="brand-row">
        <div class="mark"><span></span></div>
        <div>
          <div class="brand-name">Nister WiFi</div>
          <div class="brand-tag">Pay Portal</div>
        </div>
      </div>
      <div>
        <h2>Get back to your WiFi faster.</h2>
        <p>Use your hotspot login to top up your wallet, buy plans, manage auto-renew, and check rewards in one secure place.</p>
      </div>
      <div class="auth-meta" aria-hidden="true">
        <span>Wallet</span>
        <span>Plans</span>
        <span>Support</span>
      </div>
    </section>
    <section class="card auth-card">
    <div class="brand-row">
      <div class="mark"><span></span></div>
      <div>
        <div class="brand-name">Nister WiFi</div>
        <div class="brand-tag">Pay Portal</div>
      </div>
    </div>
    <h1>Welcome back</h1>
    <div class="muted">Enter the phone number and password you use on the hotspot login page.</div>
    <?php if ($msg === 'logged_out'): ?>
      <div class="msg ok">You have logged out of the pay portal.</div>
    <?php endif; ?>
    <?php if ($err !== ''): ?>
      <div class="msg err"><?=htmlspecialchars($err, ENT_QUOTES, 'UTF-8')?></div>
    <?php endif; ?>
    <form method="post" action="/login.php<?= $locationCode !== '' ? ('?location_code='.rawurlencode($locationCode)) : '' ?>" autocomplete="off">
      <?php if ($locationCode !== ''): ?>
        <input type="hidden" name="location_code" value="<?=htmlspecialchars($locationCode, ENT_QUOTES, 'UTF-8')?>">
      <?php endif; ?>
      <div class="field">
        <label class="label" for="msisdn">Phone number</label>
        <input id="msisdn" name="msisdn" type="tel" placeholder="e.g. 059xxxxxxx" value="<?=htmlspecialchars($prefill, ENT_QUOTES, 'UTF-8')?>" required>
      </div>
      <div class="field">
        <label class="label" for="password">Password</label>
        <div class="password-wrap">
          <input id="password" name="password" type="password" placeholder="Hotspot password" autocomplete="current-password" required>
          <button class="password-toggle" type="button" data-password-toggle="password" aria-controls="password" aria-pressed="false">Show</button>
        </div>
      </div>
      <button class="btn" type="submit">Open my portal</button>
    </form>
    <div class="links">
      <a href="/portal.php">Return to pay portal</a>
    </div>
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
