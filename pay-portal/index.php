<?php
declare(strict_types=1);
require_once __DIR__.'/lib/settings.php';
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/user_auth.php';
$ENV = user_boot();
$s = settings_get_all();
$get = static function(string $k, $def=null) use ($s, $ENV) {
  if (isset($s[$k]) && $s[$k] !== '') return $s[$k];
  if (isset($ENV[$k]) && $ENV[$k] !== '') return $ENV[$k];
  $v = getenv($k);
  if ($v !== false && $v !== '') return $v;
  return $def;
};
$waSupport = preg_replace('/\D+/', '', (string)$get('WHATSAPP_SUPPORT','233598544768'));
$waHref = $waSupport !== '' ? ('https://wa.me/'.$waSupport) : 'https://wa.me/233598544768';
$topupNetwork = (string)$get('TOPUP_NETWORK','MTN MoMo');
$minTopupCents = (int)$get('TOPUP_MIN_CENTS', 3000);
if ($minTopupCents <= 0) $minTopupCents = 3000;
$loggedIn = user_logged_in();
$userMsisdn = $loggedIn ? user_msisdn_display() : '';
$loginHref = '/login.php';
$siteCode = location_session_get_code();
if ($siteCode !== null && $siteCode !== '') {
  $loginHref .= '?location_code='.rawurlencode($siteCode);
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nister WiFi | Pay Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#f4f1ea;
      --bg-2:#fdfbf7;
      --surface:#172025;
      --surface-2:#202b31;
      --ink:#1c2329;
      --muted:#5f6a76;
      --accent:#0f766e;
      --accent-2:#b45309;
      --green:#0f766e;
      --gold:#b45309;
      --card:#fffdfa;
      --line:#e2d6c8;
      --line-dark:#334047;
      --shadow:0 20px 60px rgba(27,35,42,.12);
      --shadow-soft:0 10px 30px rgba(27,35,42,.08);
      --radius:18px;
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
      letter-spacing:0;
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      background:
        radial-gradient(1000px 520px at 5% -10%,rgba(15,118,110,.18),transparent 60%),
        radial-gradient(900px 500px at 95% 0%,rgba(180,83,9,.16),transparent 60%),
        radial-gradient(700px 420px at 40% 100%,rgba(15,118,110,.08),transparent 70%);
      z-index:-2;
    }
    body::after{
      content:"";
      position:fixed;
      inset:-20%;
      background:repeating-linear-gradient(120deg,rgba(0,0,0,.025) 0,rgba(0,0,0,.025) 1px,transparent 1px,transparent 14px);
      opacity:.45;
      z-index:-1;
      pointer-events:none;
    }
    .page{max-width:1200px;margin:0 auto;padding:32px 24px 64px}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .mark{
      width:42px;height:42px;border-radius:12px;
      display:grid;grid-template-columns:repeat(3,1fr);align-items:end;gap:3px;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));
      border:1px solid rgba(15,118,110,.22);padding:8px;
      box-shadow:0 12px 26px rgba(15,118,110,.22);
    }
    .mark::before,.mark::after,.mark span{
      content:"";display:block;width:100%;border-radius:3px;background:#fffdfa;
    }
    .mark::before{height:8px}
    .mark span{height:14px}
    .mark::after{height:20px}
    .brand-text{display:flex;flex-direction:column;gap:2px;color:var(--ink)}
    .brand-text .name{font-weight:700;letter-spacing:0}
    .brand-text .tag{font-size:.85rem;color:var(--muted)}
    h1,h2,h3{font-family:var(--font-display);margin:0 0 12px;letter-spacing:0}
    h1{font-size:clamp(2.25rem,4vw,3.45rem);line-height:1.04;max-width:12ch;color:var(--ink)}
    h2{font-size:clamp(1.5rem,2.5vw,2.1rem)}
    h3{font-size:1.14rem}
    p{margin:0 0 16px;line-height:1.55}
    .lead{font-size:1.08rem;color:var(--muted);max-width:58ch;line-height:1.65}
    .hero{
      display:grid;grid-template-columns:1.08fr .92fr;gap:32px;align-items:center;
      background:rgba(255,253,250,.78);
      border:1px solid rgba(226,214,200,.86);
      border-radius:18px;
      padding:28px;
      box-shadow:var(--shadow);
      min-height:560px;
    }
    .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
    .btn{
      appearance:none;border:1px solid transparent;border-radius:12px;
      padding:12px 16px;font-weight:600;cursor:pointer;text-decoration:none;
      display:inline-flex;align-items:center;justify-content:center;gap:8px;
      min-height:46px;line-height:1.2;
      transition:transform .18s ease,box-shadow .18s ease,background .18s ease,border-color .18s ease;
    }
    .btn:disabled{cursor:not-allowed;opacity:.55;transform:none;box-shadow:none}
    .btn:hover{transform:translateY(-1px)}
    .btn.primary{
      background:linear-gradient(135deg,var(--accent),#0f8a7f);
      color:#fff;box-shadow:0 16px 30px rgba(15,118,110,.24);
    }
    .btn.ghost{
      background:#fff;border-color:var(--line);color:var(--ink);
    }
    .btn.ghost:hover{border-color:rgba(15,118,110,.35)}
    .btn.outline{
      background:#fff;border-color:var(--line);color:var(--ink);
    }
    .trust{display:flex;flex-wrap:wrap;gap:10px;color:var(--muted);font-size:.9rem}
    .trust-item{
      background:rgba(255,255,255,.62);
      border:1px solid rgba(226,214,200,.78);
      padding:7px 10px;border-radius:999px;
    }
    .hero-cards{display:flex;flex-direction:column;gap:16px}
    .card{
      background:var(--card);border:1px solid var(--line);
      border-radius:var(--radius);padding:18px;box-shadow:var(--shadow-soft);
    }
    .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .pill{
      display:inline-flex;align-items:center;gap:6px;
      font-size:.75rem;padding:5px 10px;border-radius:999px;font-weight:700;
      background:rgba(15,118,110,.12);color:var(--accent);border:1px solid rgba(15,118,110,.25);
    }
    .pill.soft{
      background:rgba(180,83,9,.12);color:#8a4a1f;border-color:rgba(180,83,9,.25);
    }
    .field{margin-bottom:12px}
    .label{color:var(--muted);font-size:.85rem;margin-bottom:6px}
    .value{font-weight:600}
    .manual{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
    .input{
      flex:1 1 220px;border:1px solid var(--line);border-radius:12px;
      padding:12px 14px;font-size:1rem;background:#fff;
    }
    .input:focus{outline:3px solid rgba(15,118,110,.18);border-color:var(--accent)}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px}
    .stat{font-weight:700;font-size:1.05rem;color:var(--ink)}
    .support{display:flex;flex-direction:column;gap:6px;margin-top:14px}
    .link{color:var(--accent);font-weight:600;text-decoration:none}
    .link:hover{text-decoration:underline}
    .sub{color:var(--muted);font-size:.85rem}
    .steps ol{margin:0;padding-left:18px;color:var(--muted);display:grid;gap:6px}
    .steps .note{
      margin-top:12px;padding:10px 12px;border-radius:12px;
      background:rgba(15,118,110,.08);color:#0b3c36;font-size:.9rem;
    }
    .section{margin-top:38px}
    .section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px;flex-wrap:wrap}
    .muted{color:var(--muted)}
    .plans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
    .plan-card{
      background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;
      display:flex;flex-direction:column;gap:10px;min-height:170px;box-shadow:var(--shadow-soft);
      animation:fadeUp .6s ease both;
    }
    .plan-title{font-weight:600;font-size:1.05rem}
    .plan-meta{color:var(--muted)}
    .buy-btn{
      margin-top:auto;border:1px solid transparent;border-radius:12px;padding:11px 12px;
      background:linear-gradient(135deg,var(--accent),#0f8a7f);color:#fff;font-weight:700;cursor:pointer;
      transition:transform .18s ease,background .18s ease;
    }
    .buy-btn:hover{background:linear-gradient(135deg,#11847b,#10978c);transform:translateY(-1px)}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .list{list-style:none;padding:0;margin:0;display:grid;gap:12px}
    .list li{
      display:flex;justify-content:space-between;gap:14px;padding-bottom:10px;
      border-bottom:1px dashed rgba(226,214,200,.8);
    }
    .list li:last-child{border-bottom:0}
    .amt{font-weight:600}
    .highlight{background:linear-gradient(135deg,rgba(180,83,9,.08),rgba(15,118,110,.08))}
    .callout{
      border:1px solid rgba(15,118,110,.2);border-radius:14px;padding:12px;background:#fff;
    }
    .callout-title{font-weight:600;margin-bottom:8px}
    .callout ul{margin:0;padding-left:18px;color:var(--muted);display:grid;gap:6px}
    .footer{
      margin-top:42px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;
      border-top:1px solid rgba(226,214,200,.8);padding-top:18px;color:var(--muted);
    }
    .brand-mini{font-weight:600;color:var(--ink)}
    @keyframes fadeUp{
      from{opacity:0;transform:translateY(10px)}
      to{opacity:1;transform:translateY(0)}
    }
    .hero,.section,.footer{animation:fadeUp .7s ease both}
    .section:nth-of-type(2){animation-delay:.08s}
    .section:nth-of-type(3){animation-delay:.16s}
    @media (max-width:980px){
      .hero{grid-template-columns:1fr;min-height:auto}
      .split{grid-template-columns:1fr}
    }
    @media (max-width:640px){
      .page{padding:16px 14px 40px}
      .hero{padding:20px}
      .hero-actions .btn{width:100%}
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="hero-copy">
        <div class="brand">
          <div class="mark"><span></span></div>
          <div class="brand-text">
            <span class="name">Nister WiFi</span>
            <span class="tag">Pay Portal</span>
          </div>
        </div>
        <h1>Fast, simple access for every device.</h1>
        <p class="lead">Check your wallet, top up via <?=htmlspecialchars($topupNetwork, ENT_QUOTES, 'UTF-8')?>, and buy a plan in minutes.</p>
        <div class="hero-actions">
          <button class="btn primary" id="topup_now" type="button"<?= $loggedIn ? '' : ' disabled' ?>>Top up wallet</button>
          <a class="btn ghost" href="#plans_section">Browse plans</a>
          <?php if (!$loggedIn): ?>
            <a class="btn outline" href="<?=htmlspecialchars($loginHref, ENT_QUOTES, 'UTF-8')?>">Login to your account</a>
          <?php endif; ?>
        </div>
        <div class="trust">
          <div class="trust-item">Secure payments</div>
          <div class="trust-item">Instant activation</div>
          <div class="trust-item">WhatsApp support</div>
        </div>
      </div>
      <div class="hero-cards">
        <div class="card overview">
          <div class="card-head">
            <h3>Account overview</h3>
            <span class="pill">Live</span>
          </div>
          <?php if (!$loggedIn): ?>
            <div class="callout" style="margin-bottom:12px">
              <div class="callout-title">Login required</div>
              <div class="sub">Please sign in with the same password you use on the captive portal to access wallet and purchases.</div>
              <div style="margin-top:8px"><a class="btn outline" href="<?=htmlspecialchars($loginHref, ENT_QUOTES, 'UTF-8')?>">Login</a></div>
            </div>
          <?php endif; ?>
          <div class="field">
            <div class="label">Your number</div>
            <div id="who" class="value"><?= $loggedIn ? htmlspecialchars($userMsisdn, ENT_QUOTES, 'UTF-8') : 'Not logged in' ?></div>
          </div>
          <div class="manual" id="manual_row"<?= $loggedIn ? ' style="display:none"' : '' ?>>
            <input id="msisdn_in" class="input" type="tel" placeholder="Enter your phone number">
            <button class="btn outline" id="load_btn" type="button">Load account</button>
          </div>
          <div class="stats">
            <div>
              <div class="label">Wallet balance</div>
              <div id="balance_stat" class="stat">GHS 0.00</div>
            </div>
            <div>
              <div class="label">Active plan</div>
              <div id="active" class="stat">No active plan</div>
            </div>
          </div>
          <div class="support">
            <a id="wa_link" class="link" href="<?=htmlspecialchars($waHref, ENT_QUOTES, 'UTF-8')?>" target="_blank" rel="noopener">WhatsApp support</a>
            <span class="sub">Support team replies quickly during working hours.</span>
            <?php if ($loggedIn): ?>
              <a class="link" href="/logout.php">Logout</a>
            <?php endif; ?>
          </div>
        </div>
        <div class="card" id="referral_card">
          <div class="card-head">
            <h3>Referral rewards</h3>
            <span class="pill">Earn</span>
          </div>
          <?php if (!$loggedIn): ?>
            <div class="callout" style="margin-bottom:12px">
              <div class="callout-title">Login required</div>
              <div class="sub">Log in to view your referral code and rewards.</div>
              <div style="margin-top:8px"><a class="btn outline" href="<?=htmlspecialchars($loginHref, ENT_QUOTES, 'UTF-8')?>">Login</a></div>
            </div>
          <?php endif; ?>
          <div class="field">
            <div class="label">Your referral code</div>
            <div id="ref_code" class="value"><?= $loggedIn ? 'N/A' : 'Login to view' ?></div>
            <div class="sub" id="ref_hint">Share this code with friends to earn bonus credit.</div>
          </div>
          <div id="ref_actions" style="margin:8px 0 12px<?= $loggedIn ? '' : ';display:none' ?>">
            <button class="btn outline" id="ref_copy_btn" type="button">Copy code</button>
          </div>
          <div class="stats" id="ref_stats"<?= $loggedIn ? '' : ' style="display:none"' ?>>
            <div>
              <div class="label">Pending bonus</div>
              <div id="ref_pending" class="stat">GHS 0.00</div>
            </div>
            <div>
              <div class="label">Released (month)</div>
              <div id="ref_released_month" class="stat">GHS 0.00</div>
            </div>
            <div>
              <div class="label">Released (lifetime)</div>
              <div id="ref_released_lifetime" class="stat">GHS 0.00</div>
            </div>
          </div>
        </div>
        <div class="card steps">
          <h3>Simple flow</h3>
          <ol>
            <li>Load your phone number.</li>
            <li>Top up wallet if needed.</li>
            <li>Choose a plan below.</li>
            <li>Get online right away.</li>
          </ol>
          <div class="note">Tip: Open your portal link from WhatsApp to auto-load your number.</div>
        </div>
      </div>
    </header>

    <section class="section" id="plans_section">
      <div class="section-head">
        <div>
          <h2>Choose a plan</h2>
          <p class="muted">Plans are activated immediately after purchase.</p>
        </div>
        <div class="pill soft">Wallet checkout</div>
      </div>
      <div class="card highlight" id="auto_renew_card" style="margin-bottom:16px">
        <div class="card-head">
        <h3>Auto-renew</h3>
          <span class="pill soft" id="auto_renew_badge">Off</span>
        </div>
        <p class="muted">Automatically renew when your data is nearly finished or your plan is about to expire, as long as your wallet can cover the plan price.</p>
        <?php if (!$loggedIn): ?>
          <div class="callout">
            <div class="callout-title">Login required</div>
            <div class="sub">Sign in to enable auto-renew for your account.</div>
          </div>
        <?php endif; ?>
        <div class="manual" id="auto_renew_controls"<?= $loggedIn ? '' : ' style="display:none"' ?>>
          <label class="sub" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="auto_renew_enabled"> Enable auto-renew
          </label>
          <select id="auto_renew_plan" class="input" aria-label="Auto renew plan"></select>
          <button class="btn outline" id="auto_renew_save" type="button">Save</button>
        </div>
        <div class="sub" id="auto_renew_info"></div>
      </div>
      <div id="plans" class="plans-grid">
        <div class="muted"><?= $loggedIn ? 'Loading plans…' : 'Login to view and buy plans.' ?></div>
      </div>
    </section>

    <section class="section split">
      <div class="card">
        <h3>Recent activity</h3>
        <ul id="recent" class="list">
          <li class="muted">No activity yet.</li>
        </ul>
      </div>
      <div class="card highlight">
        <h3>Need to pay by MoMo?</h3>
        <p>Use the Top up wallet button after sending payment. We will review and credit your wallet. Minimum top up is <b>GHS <?=htmlspecialchars(number_format($minTopupCents / 100, 2, '.', ''), ENT_QUOTES, 'UTF-8')?></b>.</p>
        <div class="callout">
          <div class="callout-title">Manual top up checklist</div>
          <ul>
            <li>Use the same number as your account.</li>
            <li>Keep your Transaction ID.</li>
            <li>Submit the exact amount you sent.</li>
          </ul>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div>
        <span class="brand-mini">Nister WiFi</span>
        <span class="muted">Payments and wallet portal</span>
      </div>
      <div class="muted">Need help? WhatsApp support is available.</div>
    </footer>
  </div>

  <script>
    window.NISTER_LOGGED_IN = <?= $loggedIn ? 'true' : 'false' ?>;
    window.NISTER_MSISDN = <?= $loggedIn ? json_encode($userMsisdn) : '""' ?>;
    window.NISTER_MIN_TOPUP_CENTS = <?= (int)$minTopupCents ?>;
  </script>
  <script src="assets/topup.js?v=13"></script>
</body>
</html>
