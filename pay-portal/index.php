<?php declare(strict_types=1); ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Nister Wi-Fi — Self Service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root{--bg:#0f172a;--card:#0b1326;--muted:#94a3b8;--text:#e5e7eb;--brand:#6366f1;--brand2:#4f46e5;--ring:rgba(99,102,241,.35)}
    *{box-sizing:border-box}
    body{margin:0;background:linear-gradient(180deg,#0b1224,#0f172a);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial}
    .wrap{max-width:1000px;margin:40px auto;padding:0 16px}
    .grid{display:grid;gap:16px;grid-template-columns:1fr}
    @media(min-width:900px){.grid{grid-template-columns:360px 1fr}}
    .card{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.02));border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.25);backdrop-filter:blur(8px)}
    h1{font-size:28px;margin:0 0 12px}.muted{color:var(--muted)} .sep{height:1px;background:rgba(148,163,184,.18);margin:14px 0}
    .row{display:flex;gap:10px;align-items:center}.row>*{flex:1}
    input[type=text]{width:100%;background:#081023;color:var(--text);border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:12px 14px;font-size:16px;outline:0}
    input:focus{border-color:var(--brand);box-shadow:0 0 0 4px var(--ring)}
    button{appearance:none;border:0;border-radius:12px;padding:12px 14px;color:#fff;background:linear-gradient(180deg,var(--brand),var(--brand2));font-weight:700;cursor:pointer;box-shadow:0 10px 18px rgba(79,70,229,.35)}
    .ghost{background:transparent;color:var(--text);border:1px solid rgba(148,163,184,.3);box-shadow:none}
    .stat{font-size:26px;font-weight:800}
    .pill{display:inline-flex;gap:6px;align-items:center;font-size:12px;padding:6px 10px;border-radius:999px;background:#081023;border:1px solid rgba(148,163,184,.2)}
    .plans{display:grid;gap:12px;grid-template-columns:1fr}
    @media(min-width:650px){.plans{grid-template-columns:repeat(2,1fr)}}
    .plan-card{background:#0b1326;border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:14px}
    .plan-title{font-weight:700;margin:0 0 6px}
    .plan-meta{color:#94a3b8;margin:0 0 10px}
    .buy-btn{width:100%}
    /* recent list */
    .recent{list-style:none;margin:0;padding:0}
    .recent li{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px dashed rgba(148,163,184,.18)}
    .recent .amt{font-weight:700}
    .recent .pos{color:#86efac}.recent .neg{color:#fca5a5}
  </style>
  <link rel="stylesheet" href="assets/topup.css">
</head>
<body>
  <div class="wrap">
    <h1>Nister Wi-Fi <span class="pill">Self-Service</span></h1>

    <div class="grid">
      <!-- LEFT -->
      <div class="card">
        <div class="muted" style="margin-bottom:8px">
          Loaded for: <b id="who">—</b> &nbsp; <span class="muted"></span>
        </div>

        <!-- Manual fallback (hidden when URL has ?username / ?msisdn / ?user) -->
        <div class="row" id="manual_row" style="margin-bottom:10px">
          <input id="msisdn_in" type="text" placeholder="e.g., 0594 10 1126" autocomplete="tel">
          <button id="load_btn" class="ghost">Load</button>
        </div>

        <div class="sep"></div>

        <div class="row">
          <div>
            <div class="muted">Balance</div>
            <div class="stat" id="bal">GHS 0.00</div>
          </div>
          <div>
            <div class="muted">Active Plan</div>
            <div id="active">No active plan</div>
          </div>
        </div>
      </div>

      <!-- RIGHT -->
      <div class="card">
        <h2 style="margin:0 0 10px">Available Plans</h2>
        <div id="plans" class="plans"></div>
      </div>
    </div>

    <!-- RECENT -->
    <div class="card" style="margin-top:16px">
      <h2 style="margin:0 0 10px">Recent transactions</h2>
      <ul id="recent" class="recent">
        <li class="muted"><span>Loading…</span><span></span></li>
      </ul>
    </div>
  </div>

  <!-- Floating “Top Up Wallet” & WhatsApp -->
  <script src="assets/topup.js?v=<?php echo time(); ?>" defer></script>
</body>
</html>
