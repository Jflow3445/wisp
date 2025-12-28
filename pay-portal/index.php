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
      --ink:#1c2329;
      --muted:#5f6a76;
      --accent:#0f766e;
      --accent-2:#b45309;
      --card:#fffdfa;
      --line:#e2d6c8;
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
      background:
        repeating-linear-gradient(120deg,rgba(0,0,0,.025) 0,rgba(0,0,0,.025) 1px,transparent 1px,transparent 14px);
      opacity:.55;
      z-index:-1;
      pointer-events:none;
    }
    .page{max-width:1200px;margin:0 auto;padding:32px 24px 64px}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
    .mark{
      width:44px;height:44px;border-radius:12px;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));
      box-shadow:0 12px 26px rgba(15,118,110,.28);
    }
    .brand-text{display:flex;flex-direction:column;gap:2px}
    .brand-text .name{font-weight:600;letter-spacing:.3px}
    .brand-text .tag{font-size:.85rem;color:var(--muted)}
    h1,h2,h3{font-family:var(--font-display);margin:0 0 12px}
    h1{font-size:clamp(2.2rem,4vw,3.4rem);line-height:1.05}
    h2{font-size:clamp(1.6rem,2.6vw,2.2rem)}
    h3{font-size:1.2rem}
    p{margin:0 0 16px}
    .lead{font-size:1.05rem;color:var(--muted)}
    .hero{display:grid;grid-template-columns:1.1fr .9fr;gap:32px;align-items:center}
    .hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
    .btn{
      appearance:none;border:1px solid transparent;border-radius:12px;
      padding:12px 16px;font-weight:600;cursor:pointer;text-decoration:none;
      display:inline-flex;align-items:center;justify-content:center;gap:8px;
      transition:transform .2s ease,box-shadow .2s ease;
    }
    .btn:hover{transform:translateY(-1px)}
    .btn.primary{
      background:linear-gradient(135deg,var(--accent),#0f8a7f);
      color:#fff;box-shadow:0 16px 30px rgba(15,118,110,.25);
    }
    .btn.ghost{
      background:transparent;border-color:var(--line);color:var(--ink);
    }
    .btn.outline{
      background:#fff;border-color:var(--line);color:var(--ink);
    }
    .trust{display:flex;flex-wrap:wrap;gap:12px;color:var(--muted);font-size:.9rem}
    .trust-item{
      background:rgba(255,255,255,.6);
      border:1px solid rgba(226,214,200,.7);
      padding:6px 10px;border-radius:999px;
    }
    .hero-cards{display:flex;flex-direction:column;gap:16px}
    .card{
      background:var(--card);border:1px solid var(--line);
      border-radius:var(--radius);padding:18px;box-shadow:var(--shadow-soft);
    }
    .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .pill{
      display:inline-flex;align-items:center;gap:6px;
      font-size:.75rem;padding:4px 10px;border-radius:999px;
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
    .input:focus{outline:2px solid rgba(15,118,110,.25);border-color:var(--accent)}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px}
    .stat{font-weight:600;font-size:1.05rem}
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
      margin-top:auto;border:1px solid transparent;border-radius:12px;padding:10px 12px;
      background:linear-gradient(135deg,#1b8f85,var(--accent));color:#fff;font-weight:600;cursor:pointer;
    }
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
      .hero{grid-template-columns:1fr}
      .split{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="hero-copy">
        <div class="brand">
          <div class="mark"></div>
          <div class="brand-text">
            <span class="name">Nister WiFi</span>
            <span class="tag">Pay Portal</span>
          </div>
        </div>
        <h1>Fast, simple access for every device.</h1>
        <p class="lead">Check your wallet, top up via MTN MoMo, and buy a plan in minutes.</p>
        <div class="hero-actions">
          <button class="btn primary" id="topup_now" type="button">Top up wallet</button>
          <a class="btn ghost" href="#plans_section">Browse plans</a>
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
          <div class="field">
            <div class="label">Your number</div>
            <div id="who" class="value">Not loaded</div>
          </div>
          <div class="manual" id="manual_row">
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
            <a id="wa_link" class="link" href="https://wa.me/233598544768" target="_blank" rel="noopener">WhatsApp support</a>
            <span class="sub">Support team replies quickly during working hours.</span>
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
      <div id="plans" class="plans-grid">
        <div class="muted">Load your number to see available plans.</div>
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
        <p>Use the Top up wallet button after sending payment. We will review and credit your wallet.</p>
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

  <script src="assets/topup.js?v=9"></script>
</body>
</html>
