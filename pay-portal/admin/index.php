<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
$ENV = admin_boot();
admin_require_login();
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nister Admin</title>
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
    --radius:16px;
    --font-display:"Fraunces",serif;
    --font-body:"Sora",sans-serif;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:var(--font-body);
    color:var(--ink);
    background:linear-gradient(180deg,#f4f1ea 0%,#efe8de 100%);
    min-height:100vh;
  }
  .wrap{max-width:1200px;margin:0 auto;padding:28px 24px 48px}
  .topbar{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  .brand{font-family:var(--font-display);font-size:1.9rem;margin:0}
  .muted{color:var(--muted)}
  .actions{display:flex;gap:10px;flex-wrap:wrap}
  .btn{
    appearance:none;border:1px solid var(--line);border-radius:12px;
    padding:10px 14px;background:#fff;color:var(--ink);cursor:pointer;text-decoration:none;
    font-weight:600;transition:transform .2s ease,box-shadow .2s ease;
  }
  .btn:hover{transform:translateY(-1px)}
  .btn.small{padding:6px 10px;font-weight:500}
  .btn.approve{border-color:#15803d;color:#14532d}
  .btn.decline{border-color:#b91c1c;color:#7f1d1d}
  .card{
    background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:16px;box-shadow:var(--shadow-soft);margin-bottom:16px;
  }
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  .grid.tight{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
  .kpi{
    padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;
    display:flex;flex-direction:column;gap:6px;min-height:92px;
  }
  .kpi .label{font-size:.85rem;color:var(--muted)}
  .kpi .value{font-size:1.35rem;font-weight:600}
  .kpi.compact{min-height:auto}
  .kpi.compact .value{font-size:1.05rem}
  h2{font-family:var(--font-display);margin:.2rem 0 .8rem}
  .section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  .split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .field label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:4px}
  .field input{
    width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;
    font-family:var(--font-body);font-size:.95rem;
  }
  .field select,
  .field textarea{
    width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;
    font-family:var(--font-body);font-size:.95rem;
  }
  .field textarea{min-height:110px;resize:vertical}
  .field input:focus{outline:2px solid rgba(15,118,110,.2);border-color:var(--accent)}
  .field select:focus,
  .field textarea:focus{outline:2px solid rgba(15,118,110,.2);border-color:var(--accent)}
  .tool-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .meta{font-size:.9rem;color:var(--muted);margin-top:8px;display:grid;gap:4px}
  .note{font-size:.85rem;color:var(--muted);margin-top:10px}
  .note.error{color:#b91c1c}
  .note.success{color:#14532d}
  .check{display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)}
  .check input{width:16px;height:16px}
  .row-inactive{opacity:.65}
  .hint{font-size:.8rem;color:var(--muted);margin-top:6px}
  .table-wrap{overflow:auto;border-radius:12px;border:1px solid var(--line)}
  .table{width:100%;border-collapse:collapse;min-width:840px;background:#fff}
  .table th,.table td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:.92rem}
  .table thead th{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:#faf6f0}
  .table tbody tr:hover{background:rgba(15,118,110,.04)}
  .table.small{min-width:520px}
  .table.small th,.table.small td{font-size:.85rem}
  .badge{
    display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);
    border-radius:999px;padding:4px 10px;font-size:.8rem;background:#fff;
  }
  .layout{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
  .side{position:sticky;top:16px;align-self:start}
  .side-card{
    background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:12px;box-shadow:var(--shadow-soft);
  }
  .menu{display:block}
  .menu .btn{
    display:block;
    width:100%;
    margin:0 0 8px;
    background:#fff;
    text-align:left;
    justify-content:flex-start;
  }
  .menu .btn:last-child{margin-bottom:0}
  .menu .btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
  .section-hidden{display:none}
  @media (max-width:900px){
    .layout{grid-template-columns:1fr}
    .side{position:static}
    .menu{display:flex;flex-direction:row;flex-wrap:wrap;gap:8px}
    .menu .btn{width:auto;margin:0;white-space:nowrap}
  }
  @media (max-width:900px){
    .table{min-width:680px}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div>
      <h1 class="brand">Nister Admin</h1>
      <div class="muted" id="whoami">...</div>
    </div>
    <div class="actions">
      <button class="btn" id="refresh_btn" type="button">Refresh</button>
      <a class="btn" href="/admin/index.php?logout=1">Logout</a>
    </div>
  </div>

  <div class="layout">
    <aside class="side">
      <div class="side-card">
        <div class="muted" style="margin-bottom:8px;font-weight:600">Menu</div>
        <div class="menu" id="menu">
          <button class="btn" data-section="overview" type="button" onclick="setSection('overview')">Overview</button>
          <button class="btn" data-section="billing" type="button" onclick="setSection('billing')">Billing</button>
          <button class="btn" data-section="plans" type="button" onclick="setSection('plans')">Plans</button>
          <button class="btn" data-section="settings" type="button" onclick="setSection('settings')">Settings</button>
          <button class="btn" data-section="alerts" type="button" onclick="setSection('alerts')">Alerts</button>
          <button class="btn" data-section="users" type="button" onclick="setSection('users')">Users</button>
          <button class="btn" data-section="all" type="button" onclick="setSection('all')">All</button>
        </div>
      </div>
    </aside>
    <main class="content">

  <div class="card" data-section="overview">
    <div class="section-head">
      <h2>Business Overview</h2>
      <span class="badge">Live metrics</span>
    </div>
    <div class="grid">
      <div class="kpi">
        <div class="label">Wallet liability</div>
        <div class="value" id="wallet_liability">GHS 0.00</div>
      </div>
      <div class="kpi">
        <div class="label">Wallet accounts</div>
        <div class="value" id="wallet_accounts">0</div>
      </div>
      <div class="kpi">
        <div class="label">Wallet deposits</div>
        <div class="value" id="wallet_deposits">GHS 0.00</div>
      </div>
      <div class="kpi">
        <div class="label">Wallet purchases</div>
        <div class="value" id="wallet_purchases">GHS 0.00</div>
      </div>
      <div class="kpi">
        <div class="label">Active users</div>
        <div class="value" id="active_users">0</div>
      </div>
      <div class="kpi">
        <div class="label">Active sessions</div>
        <div class="value" id="active_sessions">n/a</div>
      </div>
    </div>
    <div class="section-head" style="margin-top:14px">
      <h3>Network Health</h3>
      <span class="badge" id="health_updated">Last check: -</span>
    </div>
    <div class="grid" id="health_grid">
      <div class="kpi compact">
        <div class="label">Overall</div>
        <div class="value" id="health_overall">-</div>
      </div>
      <div class="kpi compact">
        <div class="label">RADIUS auth</div>
        <div class="value" id="health_radius">-</div>
        <div class="muted" id="health_radius_ms">-</div>
      </div>
      <div class="kpi compact">
        <div class="label">CoA success rate</div>
        <div class="value" id="health_coa_rate">-</div>
        <div class="muted" id="health_coa_ms">-</div>
      </div>
      <div class="kpi compact">
        <div class="label">Tunnel status</div>
        <div class="value" id="health_tunnel">-</div>
        <div class="muted" id="health_route">-</div>
      </div>
      <div class="kpi compact">
        <div class="label">Latency / Loss</div>
        <div class="value" id="health_latency">-</div>
        <div class="muted" id="health_loss">-</div>
      </div>
      <div class="kpi compact">
        <div class="label">Download speed</div>
        <div class="value" id="health_speed">-</div>
      </div>
    </div>
  </div>

  <div class="card" data-section="settings">
    <div class="section-head">
      <h2>Portal Settings</h2>
      <div class="muted">Configure API base and support contact details shown to users.</div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="set_api_base">Hotspot API base</label>
        <input id="set_api_base" type="text" placeholder="https://api.nister.org">
      </div>
      <div class="field">
        <label for="set_pay_base">Pay portal base</label>
        <input id="set_pay_base" type="text" placeholder="https://pay.nister.org">
      </div>
      <div class="field">
        <label for="set_whatsapp">WhatsApp support (digits)</label>
        <input id="set_whatsapp" type="text" placeholder="233598544768">
      </div>
      <div class="field">
        <label for="set_topup_network">Top up network</label>
        <input id="set_topup_network" type="text" placeholder="MTN Ghana">
      </div>
      <div class="field">
        <label for="set_topup_name">Top up name</label>
        <input id="set_topup_name" type="text" placeholder="GRASAG-UHAS">
      </div>
      <div class="field">
        <label for="set_topup_number">Top up number</label>
        <input id="set_topup_number" type="text" placeholder="0530488905">
      </div>
      <div class="field">
        <label for="set_topup_text">Top up WhatsApp text</label>
        <input id="set_topup_text" type="text" placeholder="Hi, I need assistance with Nister Wifi">
      </div>
      <div class="field">
        <label for="set_topup_min">Minimum top up (GHS)</label>
        <input id="set_topup_min" type="text" placeholder="30.00">
      </div>
      <div class="field">
        <label for="set_referral_rate">Referral rate (bps)</label>
        <input id="set_referral_rate" type="text" placeholder="1000">
      </div>
      <div class="field">
        <label for="set_referral_monthly">Referral monthly cap (GHS)</label>
        <input id="set_referral_monthly" type="text" placeholder="60.00">
      </div>
      <div class="field">
        <label for="set_referral_lifetime">Referral lifetime cap (GHS)</label>
        <input id="set_referral_lifetime" type="text" placeholder="300.00">
      </div>
      <div class="field">
        <label for="set_referral_window">Referral window (days)</label>
        <input id="set_referral_window" type="text" placeholder="365">
      </div>
      <div class="field">
        <label for="set_referral_hold">Referral hold (days)</label>
        <input id="set_referral_hold" type="text" placeholder="60">
      </div>
      <div class="field">
        <label for="set_sms_base">SMS API base</label>
        <input id="set_sms_base" type="text" placeholder="https://api.pilosms.com/v1">
      </div>
      <div class="field">
        <label for="set_sms_key">SMS API key</label>
        <input id="set_sms_key" type="text" placeholder="YOUR_API_KEY">
      </div>
      <div class="field">
        <label for="set_sms_sender">SMS Sender ID</label>
        <input id="set_sms_sender" type="text" placeholder="PiloSMS">
      </div>
      <div class="field">
        <label for="set_sms_login_url">SMS login URL</label>
        <input id="set_sms_login_url" type="text" placeholder="https://wifi.nister.org/login.html">
      </div>
      <div class="field">
        <label for="set_sms_welcome">SMS welcome template</label>
        <textarea id="set_sms_welcome" placeholder="Hi {NAME}, your Nister account is ready. Login: {LOGIN_URL}"></textarea>
      </div>
      <div class="field">
        <label for="set_sms_quota_warn">SMS quota warning template</label>
        <textarea id="set_sms_quota_warn" placeholder="Hi {NAME}, you have {REMAIN_MB}MB ({REMAIN_PCT}%) left. Top up or buy a plan."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_expiry_warn">SMS expiry warning template</label>
        <textarea id="set_sms_expiry_warn" placeholder="Hi {NAME}, your plan expires on {EXPIRES_AT}. Renew to stay online."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_quota_pct">Quota warn %</label>
        <input id="set_sms_quota_pct" type="text" placeholder="10">
      </div>
      <div class="field">
        <label for="set_sms_quota_mb">Quota warn MB</label>
        <input id="set_sms_quota_mb" type="text" placeholder="200">
      </div>
      <div class="field">
        <label for="set_sms_expiry_hours">Expiry warn hours</label>
        <input id="set_sms_expiry_hours" type="text" placeholder="24">
      </div>
      <div class="field">
        <label for="set_sms_debounce">SMS debounce hours</label>
        <input id="set_sms_debounce" type="text" placeholder="24">
      </div>
      <div class="field">
        <label for="set_sms_purchase">SMS purchase confirmation template</label>
        <textarea id="set_sms_purchase" placeholder="Hi {NAME}, your purchase {PLAN} is active. Expires {EXPIRES_AT}. Ref {REF}."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_topup">SMS wallet top-up confirmation</label>
        <textarea id="set_sms_topup" placeholder="Top-up confirmed: {AMOUNT_GHS}. New balance {BALANCE_GHS}."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_pending">SMS payment pending</label>
        <textarea id="set_sms_pending" placeholder="We received your payment request {REF}. It is pending review."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_failed">SMS payment failed/declined</label>
        <textarea id="set_sms_failed" placeholder="Payment {REF} failed or was declined. Please try again or contact support."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_renew">SMS auto-renew reminder</label>
        <textarea id="set_sms_renew" placeholder="Your plan {PLAN} expires on {EXPIRES_AT}. Renew to stay online."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_renew_hours">Renew reminder hours</label>
        <input id="set_sms_renew_hours" type="text" placeholder="24">
      </div>
      <div class="field">
        <label for="set_sms_pwd_reset">SMS password reset confirmation</label>
        <textarea id="set_sms_pwd_reset" placeholder="Your Wi-Fi password has been updated. If this wasn't you, contact support."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_back_online">SMS back online notice</label>
        <textarea id="set_sms_back_online" placeholder="You are back online. Enjoy your connection."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_inactive">SMS inactive re-engagement</label>
        <textarea id="set_sms_inactive" placeholder="We miss you! Come back and enjoy Nister Wi-Fi."></textarea>
      </div>
      <div class="field">
        <label for="set_sms_inactive_days">Inactive days</label>
        <input id="set_sms_inactive_days" type="text" placeholder="30">
      </div>
    </div>
    <div class="tool-actions">
      <button class="btn approve" id="settings_save" type="button">Save Settings</button>
      <button class="btn" id="settings_reload" type="button">Reload</button>
    </div>
    <div class="note" id="settings_status">Settings load on refresh.</div>
  </div>

  <div class="card" data-section="billing">
    <div class="section-head">
      <h2>Payments</h2>
      <div class="muted">Approve or decline with notes for audit trail.</div>
    </div>
    <div class="grid">
      <div class="kpi"><div class="label">Pending (count)</div><div class="value" id="pay_pending_cnt">0</div></div>
      <div class="kpi"><div class="label">Pending (total)</div><div class="value" id="pay_pending_sum">GHS 0.00</div></div>
      <div class="kpi"><div class="label">Approved (count)</div><div class="value" id="pay_approved_cnt">0</div></div>
      <div class="kpi"><div class="label">Approved (total)</div><div class="value" id="pay_approved_sum">GHS 0.00</div></div>
      <div class="kpi"><div class="label">Declined (count)</div><div class="value" id="pay_declined_cnt">0</div></div>
      <div class="kpi"><div class="label">Declined (total)</div><div class="value" id="pay_declined_sum">GHS 0.00</div></div>
      <div class="kpi"><div class="label">Approved today</div><div class="value" id="pay_today">GHS 0.00</div></div>
    </div>
  </div>

  <div class="card" data-section="billing">
    <div class="section-head">
      <h2>Purchases</h2>
      <div class="muted">Applied plans and sales health.</div>
    </div>
    <div class="grid">
      <div class="kpi"><div class="label">Total sales</div><div class="value" id="purchase_total">GHS 0.00</div></div>
      <div class="kpi"><div class="label">Applied sales</div><div class="value" id="purchase_applied_total">GHS 0.00</div></div>
      <div class="kpi"><div class="label">Pending (count)</div><div class="value" id="purchase_pending_cnt">0</div></div>
      <div class="kpi"><div class="label">Applied (count)</div><div class="value" id="purchase_applied_cnt">0</div></div>
      <div class="kpi"><div class="label">Failed (count)</div><div class="value" id="purchase_failed_cnt">0</div></div>
    </div>
  </div>

  <div class="card" data-section="plans">
    <div class="section-head">
      <h2>Plan Management</h2>
      <div class="muted">Create, update, or retire storefront plans.</div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="plan_code">Plan code</label>
        <input id="plan_code" type="text" placeholder="WEEKEND_5GB">
      </div>
      <div class="field">
        <label for="plan_name">Display name</label>
        <input id="plan_name" type="text" placeholder="Weekend 5GB">
      </div>
      <div class="field">
        <label for="plan_price">Price (GHS)</label>
        <input id="plan_price" type="text" placeholder="0.00">
      </div>
      <div class="field">
        <label for="plan_days">Duration (days)</label>
        <input id="plan_days" type="text" placeholder="30">
      </div>
      <div class="field">
        <label for="plan_data">Data (GB)</label>
        <input id="plan_data" type="text" placeholder="Leave empty for unlimited">
      </div>
      <div class="field">
        <label for="plan_rate">Rate limit</label>
        <input id="plan_rate" type="text" placeholder="2M/2M">
      </div>
      <div class="field">
        <label for="plan_addr">Address list</label>
        <input id="plan_addr" type="text" placeholder="HS_ACTIVE">
      </div>
      <div class="field">
        <label for="plan_active">Status</label>
        <label class="check"><input id="plan_active" type="checkbox" checked> Active (shown in storefront)</label>
      </div>
    </div>
    <div class="tool-actions">
      <button class="btn approve" id="plan_save" type="button">Save Plan</button>
      <button class="btn" id="plan_reset" type="button">Reset</button>
    </div>
    <div class="hint">Plan codes allow letters, numbers, "_" and "-". Groups starting with "HS_" are protected.</div>
    <div class="note" id="plan_status">No plan changes yet.</div>
    <div class="table-wrap">
      <table class="table" id="plans_tbl">
        <thead>
          <tr>
            <th>Code</th><th>Name</th><th>Price</th><th>Days</th><th>Data</th><th>Rate</th><th>Address list</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="9" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="billing">
    <div class="section-head">
      <h2>Top Plans (30 days)</h2>
      <div class="muted">Most used plans in the last 30 days.</div>
    </div>
    <div class="table-wrap">
      <table class="table small" id="top_plans_tbl">
        <thead>
          <tr>
            <th>Plan</th><th>Count</th><th>Revenue</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="3" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="billing">
    <div class="section-head">
      <h2>Daily Totals (14 days)</h2>
      <div class="muted">Approved payments vs applied purchases.</div>
    </div>
    <div class="table-wrap">
      <table class="table small" id="series_tbl">
        <thead>
          <tr>
            <th>Date</th><th>Payments approved</th><th>Purchases applied</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="3" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="billing">
    <div class="section-head">
      <h2>Pending Deposits</h2>
      <div class="muted">Review and confirm top ups.</div>
    </div>
    <div class="table-wrap">
      <table class="table" id="pending_tbl">
        <thead>
          <tr>
            <th>Ref</th><th>MSISDN</th><th>Amount</th><th>Method</th><th>Payer</th><th>Notes</th><th>When</th><th>Action</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="8" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="alerts">
    <div class="section-head">
      <h2>Alerts</h2>
      <div class="muted">CoA failures and limit events.</div>
    </div>
    <div class="form-grid" style="margin-bottom:10px">
      <div class="field">
        <label class="check"><input id="alerts_auto_retry" type="checkbox"> Auto‑retry CoA fails on refresh</label>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table small" id="alerts_tbl">
        <thead>
          <tr>
            <th>When</th><th>Type</th><th>User</th><th>Message</th><th>From</th><th>Action</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="6" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="section-head" style="margin-top:14px">
      <h3>Downtime timeline</h3>
      <div class="muted">Health outages detected by cron checks.</div>
    </div>
    <div class="table-wrap">
      <table class="table small" id="health_downtime_tbl">
        <thead>
          <tr>
            <th>Start</th><th>End</th><th>Minutes</th><th>Reason</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="4" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="users">
    <div class="section-head">
      <h2>User States</h2>
      <div class="muted">Expiry/quota status per user (HS_* only).</div>
    </div>
    <div class="form-grid" style="margin-bottom:10px">
      <div class="field">
        <label for="state_search">Search MSISDN</label>
        <input id="state_search" type="text" placeholder="233xxxxxxxxx or 0xxxxxxxxx">
      </div>
      <div class="field">
        <label for="state_group">Group</label>
        <select id="state_group">
          <option value="">All</option>
          <option value="HS_ACTIVE">HS_ACTIVE</option>
          <option value="HS_LIMITED">HS_LIMITED</option>
          <option value="HS_NOPAID">HS_NOPAID</option>
        </select>
      </div>
      <div class="field">
        <label class="check"><input id="state_expired" type="checkbox"> Expired only</label>
      </div>
      <div class="field">
        <label class="check"><input id="state_exhausted" type="checkbox"> Exhausted only</label>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table small" id="user_states_tbl">
        <thead>
          <tr>
            <th>User</th><th>Group</th><th>Expires</th><th>Quota</th><th>Used</th><th>Window</th><th>Expired</th><th>Exhausted</th><th>Rate</th><th>Action</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="10" class="muted">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="card" data-section="users">
    <div class="section-head">
      <h2>User Tools</h2>
      <div class="muted">Lookup users, credit wallets, apply plans, or disconnect sessions.</div>
    </div>
    <div class="split">
      <div>
        <div class="form-grid">
          <div class="field">
            <label for="tool_msisdn">MSISDN</label>
            <input id="tool_msisdn" type="text" placeholder="233xxxxxxxxx">
          </div>
          <div class="field">
            <label for="tool_ip">Force kick IP</label>
            <input id="tool_ip" type="text" placeholder="192.168.88.x">
          </div>
          <div class="field">
            <label for="tool_amount">Amount (GHS)</label>
            <input id="tool_amount" type="text" placeholder="0.00">
          </div>
          <div class="field">
            <label for="tool_plan">Plan code</label>
            <input id="tool_plan" type="text" placeholder="PLAN_CODE">
          </div>
          <div class="field">
            <label for="tool_notes">Notes</label>
            <input id="tool_notes" type="text" placeholder="Optional">
          </div>
          <div class="field">
            <label for="tool_new_password">New password</label>
            <input id="tool_new_password" type="text" placeholder="Set a new password">
          </div>
          <div class="field">
            <label for="tool_new_password2">Confirm password</label>
            <input id="tool_new_password2" type="text" placeholder="Re-enter password">
          </div>
          <div class="field">
            <label for="tool_expiry">Expiry date (YYYY-MM-DD HH:MM:SS)</label>
            <input id="tool_expiry" type="text" placeholder="2026-05-08 23:59:59">
          </div>
          <div class="field">
            <label for="tool_days">Expiry + days</label>
            <input id="tool_days" type="text" placeholder="30">
          </div>
          <div class="field">
            <label for="tool_add_gb">Add quota (GB)</label>
            <input id="tool_add_gb" type="text" placeholder="3">
          </div>
          <div class="field">
            <label for="tool_set_gb">Set quota (GB)</label>
            <input id="tool_set_gb" type="text" placeholder="10">
          </div>
          <div class="field">
            <label for="tool_addrlist">Address list</label>
            <input id="tool_addrlist" type="text" placeholder="HS_ACTIVE / HS_LIMITED / HS_NOPAID">
          </div>
          <div class="field">
            <label for="tool_rate">Rate limit</label>
            <input id="tool_rate" type="text" placeholder="2M/2M">
          </div>
          <div class="field">
            <label for="tool_group">Plan group</label>
            <input id="tool_group" type="text" placeholder="HS_ACTIVE / HS_LIMITED / HS_NOPAID">
          </div>
        </div>
        <div class="tool-actions">
          <button class="btn" id="tool_lookup" type="button">Lookup</button>
          <button class="btn approve" id="tool_credit" type="button">Credit Wallet</button>
          <button class="btn" id="tool_apply" type="button">Apply Plan</button>
          <button class="btn decline" id="tool_disconnect" type="button">Disconnect</button>
          <button class="btn decline" id="tool_force_kick_ip" type="button">Force Kick by IP</button>
          <button class="btn approve" id="tool_set_password" type="button">Set Password</button>
        </div>
        <div class="tool-actions">
          <button class="btn" id="tool_set_expiry" type="button">Set Expiry</button>
          <button class="btn" id="tool_add_quota" type="button">Add Quota</button>
          <button class="btn" id="tool_set_quota" type="button">Set Quota</button>
          <button class="btn" id="tool_clear_quota" type="button">Clear Quota</button>
          <button class="btn" id="tool_set_addr" type="button">Set Address List</button>
          <button class="btn" id="tool_set_rate" type="button">Set Rate</button>
          <button class="btn" id="tool_set_group" type="button">Set Group</button>
          <button class="btn decline" id="tool_reset_nopaid" type="button">Reset to HS_NOPAID</button>
        </div>
        <div class="note" id="tool_status">No user loaded.</div>
      </div>
      <div>
        <div id="user_snapshot" class="note">No user loaded.</div>
        <div id="user_meta" class="meta"></div>
        <div class="table-wrap" id="user_ledger_wrap">
          <table class="table small" id="user_ledger_tbl">
            <thead>
              <tr>
                <th>Type</th><th>Amount</th><th>Ref</th><th>Notes</th><th>When</th>
              </tr>
            </thead>
            <tbody><tr><td colspan="5" class="muted">No ledger entries.</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  <div class="card" data-section="users">
    <div class="section-head">
      <h2>SMS Broadcast</h2>
      <div class="muted">Send SMS to all users, a group, or specific numbers.</div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="sms_audience">Audience</label>
        <select id="sms_audience">
          <option value="list">Specific list</option>
          <option value="all">All users</option>
          <option value="group">By group</option>
        </select>
      </div>
      <div class="field">
        <label for="sms_group">Group</label>
        <select id="sms_group">
          <option value="">Select group</option>
          <option value="HS_ACTIVE">HS_ACTIVE</option>
          <option value="HS_LIMITED">HS_LIMITED</option>
          <option value="HS_NOPAID">HS_NOPAID</option>
        </select>
      </div>
      <div class="field">
        <label for="sms_sender">Sender ID (optional)</label>
        <input id="sms_sender" type="text" placeholder="Uses configured Sender ID by default">
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="sms_recipients">Recipients (comma / space separated)</label>
        <textarea id="sms_recipients" placeholder="0241234567, 0201234567"></textarea>
      </div>
      <div class="field">
        <label for="sms_message">Message</label>
        <textarea id="sms_message" placeholder="Your SMS content..."></textarea>
      </div>
    </div>
    <div class="tool-actions">
      <button class="btn approve" id="sms_send" type="button">Send SMS</button>
    </div>
    <div class="note" id="sms_status">SMS will use the configured gateway settings from Portal Settings.</div>
  </div>
    </main>
  </div>
</div>

<script>
async function api(fn, body){
  const opts = body ? { method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(body) } : {};
  const r = await fetch(`/admin/api.php?fn=${encodeURIComponent(fn)}`, opts);
  return r.json();
}

function setSection(sec){
  const cards = document.querySelectorAll('[data-section]');
  cards.forEach(c=>{
    const show = (sec === 'all' || c.dataset.section === sec);
    c.classList.toggle('section-hidden', !show);
  });
  const menu = document.getElementById('menu');
  if (menu){
    menu.querySelectorAll('button[data-section]').forEach(b=>{
      b.classList.toggle('active', b.dataset.section === sec);
    });
  }
  try { localStorage.setItem('admin_section', sec); } catch (e) {}
}

function initMenu(){
  const menu = document.getElementById('menu');
  if (!menu) return;
  menu.querySelectorAll('button[data-section]').forEach(btn=>{
    btn.addEventListener('click', ()=>setSection(btn.dataset.section || 'all'));
  });
  let saved = 'overview';
  try { saved = localStorage.getItem('admin_section') || 'overview'; } catch (e) {}
  setSection(saved);
}

function centsToGHS(c){ return 'GHS ' + (c/100).toFixed(2); }
function centsToAmount(c){
  const n = Number(c);
  if (!isFinite(n) || n <= 0) return '';
  return (n/100).toFixed(2);
}
function esc(v){
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function safe(v){ return (v===null||v===undefined)?'':esc(v); }
function fmtBytes(bytes){
  if (bytes === null || bytes === undefined) return '-';
  const n = Number(bytes);
  if (!isFinite(n)) return '-';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB','MB','GB','TB','PB'];
  let v = n;
  let idx = -1;
  while (v >= 1024 && idx < units.length - 1) { v /= 1024; idx++; }
  const dec = v >= 10 ? 1 : 2;
  return `${v.toFixed(dec)} ${units[idx]}`;
}
function statusLabel(st){
  if (!st) return 'unknown';
  if (st.can_browse) return 'active';
  if (st.policy_limited) return 'limited';
  if (st.expired) return 'expired';
  if (st.exhausted) return 'exhausted';
  if (st.paid) return 'paid';
  return 'unpaid';
}
function parseAmountCents(val){
  const n = parseFloat(String(val || '').replace(/[^\d.]/g,''));
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
function bytesToGb(bytes){
  if (bytes === null || bytes === undefined) return '';
  const n = Number(bytes);
  if (!isFinite(n) || n <= 0) return '';
  const gb = n / (1024 * 1024 * 1024);
  const rounded = Math.round(gb * 100) / 100;
  return String(rounded);
}
function healthFlag(v){
  if (v === 1 || v === true) return 'OK';
  if (v === 0 || v === false) return 'FAIL';
  return 'n/a';
}
function fmtMs(v){
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!isFinite(n)) return '-';
  return `${Math.round(n)} ms`;
}
function fmtLoss(v){
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!isFinite(n)) return '-';
  return `${Math.round(n)}% loss`;
}
function fmtMpbs(v){
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!isFinite(n)) return '-';
  return `${n.toFixed(2)} Mbps`;
}

let adminPlansByCode = {};
let alertsAutoRetryRunning = false;

async function loadWho(){
  const j = await api('whoami');
  if(j.ok){
    const at = j.since ? new Date(j.since*1000).toLocaleString() : '-';
    document.getElementById('whoami').textContent = `Logged in as ${j.user} | since ${at} | IP ${j.ip}`;
  }
}

async function loadStats(){
  const j = await api('stats');
  if(!j.ok){ console.warn(j); return; }
  document.getElementById('wallet_liability').textContent = centsToGHS(j.wallet_liability_cents||0);
  document.getElementById('wallet_accounts').textContent = j.wallet?.accounts_cnt ?? 0;
  document.getElementById('wallet_deposits').textContent = centsToGHS(j.wallet?.deposits_cents||0);
  document.getElementById('wallet_purchases').textContent = centsToGHS(j.wallet?.purchases_cents||0);
  document.getElementById('active_users').textContent = j.active_users ?? 0;
  document.getElementById('active_sessions').textContent = (j.active_sessions === null || j.active_sessions === undefined) ? 'n/a' : j.active_sessions;
  document.getElementById('pay_pending_cnt').textContent = j.payments?.pending_cnt ?? 0;
  document.getElementById('pay_pending_sum').textContent = centsToGHS(j.payments?.pending_cents||0);
  document.getElementById('pay_approved_cnt').textContent = j.payments?.approved_cnt ?? 0;
  document.getElementById('pay_approved_sum').textContent = centsToGHS(j.payments?.approved_cents||0);
  document.getElementById('pay_declined_cnt').textContent = j.payments?.declined_cnt ?? 0;
  document.getElementById('pay_declined_sum').textContent = centsToGHS(j.payments?.declined_cents||0);
  document.getElementById('pay_today').textContent = centsToGHS(j.payments?.approved_today_cents||0);
  document.getElementById('purchase_total').textContent = centsToGHS(j.purchases?.total_cents||0);
  document.getElementById('purchase_applied_total').textContent = centsToGHS(j.purchases?.applied_cents||0);
  document.getElementById('purchase_pending_cnt').textContent = j.purchases?.pending_cnt ?? 0;
  document.getElementById('purchase_applied_cnt').textContent = j.purchases?.applied_cnt ?? 0;
  document.getElementById('purchase_failed_cnt').textContent = j.purchases?.failed_cnt ?? 0;
  renderTopPlans(j.purchases?.top_plans || []);
  renderSeries(j.payments?.series || [], j.purchases?.series || []);
}

function renderHealth(j){
  const latest = j.latest || null;
  const updated = latest && latest.ts ? latest.ts : '-';
  const overall = latest ? healthFlag(latest.overall_ok) : '-';
  const radius = latest ? healthFlag(latest.radius_ok) : '-';
  const coaRate = (j.coa_rate !== null && j.coa_rate !== undefined) ? `${j.coa_rate}%` : '-';
  const tunnel = latest ? healthFlag(latest.tunnel_ok) : '-';
  const routeDev = latest && latest.route_dev ? `via ${latest.route_dev}` : '-';
  const latency = latest ? fmtMs(latest.ping_ms) : '-';
  const loss = latest ? fmtLoss(latest.loss_pct) : '-';
  const speed = latest ? fmtMpbs(latest.speed_mbps) : '-';

  const updEl = document.getElementById('health_updated');
  if (updEl) updEl.textContent = `Last check: ${updated}`;
  const oEl = document.getElementById('health_overall');
  if (oEl) oEl.textContent = overall;
  const rEl = document.getElementById('health_radius');
  if (rEl) rEl.textContent = radius;
  const rMs = document.getElementById('health_radius_ms');
  if (rMs) rMs.textContent = latest ? fmtMs(latest.radius_ms) : '-';
  const cEl = document.getElementById('health_coa_rate');
  if (cEl) cEl.textContent = coaRate;
  const cMs = document.getElementById('health_coa_ms');
  if (cMs) cMs.textContent = latest ? fmtMs(latest.coa_ms) : '-';
  const tEl = document.getElementById('health_tunnel');
  if (tEl) tEl.textContent = tunnel;
  const rtEl = document.getElementById('health_route');
  if (rtEl) rtEl.textContent = routeDev;
  const lEl = document.getElementById('health_latency');
  if (lEl) lEl.textContent = latency;
  const lossEl = document.getElementById('health_loss');
  if (lossEl) lossEl.textContent = loss;
  const sEl = document.getElementById('health_speed');
  if (sEl) sEl.textContent = speed;

  const tbl = document.getElementById('health_downtime_tbl');
  if (!tbl) return;
  const rows = (j.events || []).map((e)=>{
    const start = e.start_ts || '-';
    const end = e.end_ts || 'ongoing';
    let mins = '-';
    try {
      if (e.start_ts) {
        const s = new Date(e.start_ts.replace(' ', 'T'));
        const eDate = e.end_ts ? new Date(e.end_ts.replace(' ', 'T')) : new Date();
        const diff = Math.max(0, eDate - s);
        mins = Math.round(diff / 60000);
      }
    } catch (err) {}
    const reason = safe(e.reason || '');
    return `<tr><td>${safe(start)}</td><td>${safe(end)}</td><td>${mins}</td><td>${reason}</td></tr>`;
  }).join('');
  tbl.querySelector('tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No downtime recorded.</td></tr>';
}

async function loadHealth(){
  const j = await api('health_status');
  if (!j.ok){
    console.warn(j);
    renderHealth({});
    return;
  }
  renderHealth(j);
}

function rowHTML(p){
  return `<tr>
    <td>${safe(p.ref)}</td>
    <td>${safe(p.msisdn)}</td>
    <td>${safe(p.amount)}</td>
    <td>${safe(p.method)}</td>
    <td>${safe(p.payer_name||'')}</td>
    <td>${safe(p.notes||'')}</td>
    <td>${safe(p.created_at||'')}</td>
    <td>
      <button class="btn small approve" data-act="approve" data-ref="${safe(p.ref)}">Approve</button>
      <button class="btn small decline" data-act="decline" data-ref="${safe(p.ref)}">Decline</button>
    </td>
  </tr>`;
}

function renderTopPlans(plans){
  const tb = document.querySelector('#top_plans_tbl tbody');
  if (!tb) return;
  if (!Array.isArray(plans) || plans.length === 0){
    tb.innerHTML = '<tr><td colspan="3" class="muted">No applied plans yet.</td></tr>';
    return;
  }
  tb.innerHTML = plans.map(p=>`<tr>
    <td>${safe(p.plan_code || '-')}</td>
    <td>${safe(p.cnt ?? 0)}</td>
    <td>${centsToGHS(p.cents || 0)}</td>
  </tr>`).join('');
}

function renderSeries(paySeries, purSeries){
  const tb = document.querySelector('#series_tbl tbody');
  if (!tb) return;
  const pmap = {};
  const umap = {};
  (Array.isArray(paySeries) ? paySeries : []).forEach(row=>{
    if (row && row.d) pmap[row.d] = Number(row.cents || 0);
  });
  (Array.isArray(purSeries) ? purSeries : []).forEach(row=>{
    if (row && row.d) umap[row.d] = Number(row.cents || 0);
  });
  const dates = Array.from(new Set([...Object.keys(pmap), ...Object.keys(umap)]))
    .sort((a,b)=>b.localeCompare(a))
    .slice(0,14);
  if (dates.length === 0){
    tb.innerHTML = '<tr><td colspan="3" class="muted">No activity yet.</td></tr>';
    return;
  }
  tb.innerHTML = dates.map(d=>`<tr>
    <td>${safe(d)}</td>
    <td>${centsToGHS(pmap[d] || 0)}</td>
    <td>${centsToGHS(umap[d] || 0)}</td>
  </tr>`).join('');
}

function renderAlerts(rows){
  const tb = document.querySelector('#alerts_tbl tbody');
  if (!tb) return;
  if (!rows || rows.length === 0) {
    tb.innerHTML = '<tr><td colspan="6" class="muted">No alerts.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(r => `<tr>
    <td>${safe(r.created_at || r.ts || '')}</td>
    <td>${safe(r.type || '')}</td>
    <td>${safe(r.username || '')}</td>
    <td>${safe(r.msg || '')}</td>
    <td>${safe(r.remote_addr || '')}</td>
    <td>
      ${r.acked ? '<span class="muted">acked</span>' : `
        <button class="btn small" data-act="ack" data-id="${safe(r.id)}">Ack</button>
        <button class="btn small approve" data-act="retry" data-id="${safe(r.id)}">Retry</button>
      `}
    </td>
  </tr>`).join('');

  tb.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const id = ev.currentTarget.getAttribute('data-id');
      const act = ev.currentTarget.getAttribute('data-act');
      if (!id) return;
      if (act === 'ack') {
        await api('alerts_ack', { id });
        await loadAlerts();
      } else if (act === 'retry') {
        await api('alerts_retry', { id });
        await loadAlerts();
      }
    });
  });
}

function renderUserStates(rows){
  const tb = document.querySelector('#user_states_tbl tbody');
  if (!tb) return;
  if (!rows || rows.length === 0) {
    tb.innerHTML = '<tr><td colspan="10" class="muted">No users.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(r => `<tr>
    <td>${safe(r.username || '')}</td>
    <td>${safe(r.groupname || '')}</td>
    <td>${safe(r.expires || '')}</td>
    <td>${fmtBytes(r.quota_bytes)}</td>
    <td>${fmtBytes(r.used_bytes)}</td>
    <td>${safe(r.window_start || '')}</td>
    <td>${r.expired_flag ? 'yes' : 'no'}</td>
    <td>${r.exhausted_flag ? 'yes' : 'no'}</td>
    <td>${safe(r.rate_limit || '')}</td>
    <td>
      <button class="btn small" data-act="active" data-u="${safe(r.username)}">Active</button>
      <button class="btn small" data-act="limited" data-u="${safe(r.username)}">Limited</button>
      <button class="btn small" data-act="nopaid" data-u="${safe(r.username)}">NoPay</button>
      <button class="btn small approve" data-act="expire" data-u="${safe(r.username)}">Expire</button>
      <button class="btn small approve" data-act="exhaust" data-u="${safe(r.username)}">Exhaust</button>
    </td>
  </tr>`).join('');

  tb.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const u = ev.currentTarget.getAttribute('data-u') || '';
      const act = ev.currentTarget.getAttribute('data-act') || '';
      if (!u || !act) return;
      if (act === 'active') await api('user_set_group', { msisdn: u, group: 'HS_ACTIVE' });
      if (act === 'limited') await api('user_set_group', { msisdn: u, group: 'HS_LIMITED' });
      if (act === 'nopaid') await api('user_set_group', { msisdn: u, group: 'HS_NOPAID' });
      if (act === 'expire') await api('user_force_expire', { msisdn: u });
      if (act === 'exhaust') await api('user_force_exhaust', { msisdn: u });
      await loadUserStates();
    });
  });
}

function setPlanStatus(msg, state){
  const el = document.getElementById('plan_status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('error','success');
  if (state === 'error') el.classList.add('error');
  if (state === 'success') el.classList.add('success');
}

function resetPlanForm(){
  const byId = (id)=>document.getElementById(id);
  const set = (id, val)=>{ const el = byId(id); if (el) el.value = val; };
  set('plan_code','');
  set('plan_name','');
  set('plan_price','');
  set('plan_days','');
  set('plan_data','');
  set('plan_rate','');
  set('plan_addr','');
  const active = byId('plan_active');
  if (active) active.checked = true;
  setPlanStatus('Ready for a new plan.');
}

function fillPlanForm(p){
  const byId = (id)=>document.getElementById(id);
  const set = (id, val)=>{ const el = byId(id); if (el) el.value = val; };
  set('plan_code', p.code || '');
  set('plan_name', p.display_name || '');
  if (p.price_cents !== null && p.price_cents !== undefined) {
    set('plan_price', (Number(p.price_cents)/100).toFixed(2));
  } else {
    set('plan_price', '');
  }
  set('plan_days', p.duration_days || '');
  set('plan_data', bytesToGb(p.quota_bytes));
  set('plan_rate', p.rate_limit || '');
  set('plan_addr', p.address_list || '');
  const active = byId('plan_active');
  if (active) active.checked = (p.active !== false);
  setPlanStatus(`Editing ${p.code}.`, 'success');
}

function renderPlans(plans){
  const tb = document.querySelector('#plans_tbl tbody');
  if (!tb) return;
  adminPlansByCode = {};
  if (!Array.isArray(plans) || plans.length === 0){
    tb.innerHTML = '<tr><td colspan="9" class="muted">No plans configured.</td></tr>';
    return;
  }
  plans.forEach(p=>{
    if (p && p.code) adminPlansByCode[p.code] = p;
  });
  tb.innerHTML = plans.map(p=>{
    const qv = (p.quota_bytes !== null && p.quota_bytes !== undefined) ? Number(p.quota_bytes) : null;
    const quota = (qv && qv > 0) ? fmtBytes(qv) : 'Unlimited';
    const status = (p.active === false) ? 'Inactive' : 'Active';
    return `<tr class="${p.active === false ? 'row-inactive' : ''}">
      <td>${safe(p.code || '')}</td>
      <td>${safe(p.name || p.code || '')}</td>
      <td>${p.price_cents !== null && p.price_cents !== undefined ? centsToGHS(p.price_cents) : '-'}</td>
      <td>${safe(p.duration_days ?? '-')}</td>
      <td>${safe(quota)}</td>
      <td>${safe(p.rate_limit || '-')}</td>
      <td>${safe(p.address_list || '-')}</td>
      <td>${safe(status)}</td>
      <td>
        <button class="btn small" data-plan-edit="${safe(p.code || '')}">Edit</button>
        <button class="btn small decline" data-plan-delete="${safe(p.code || '')}">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

async function loadPlans(){
  const j = await api('plans');
  if (!j.ok){
    setPlanStatus(j.error || 'Failed to load plans.', 'error');
    renderPlans([]);
    return;
  }
  renderPlans(j.plans || []);
}

function setSettingsStatus(msg, state){
  const el = document.getElementById('settings_status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('error','success');
  if (state === 'error') el.classList.add('error');
  if (state === 'success') el.classList.add('success');
}

async function loadSettings(){
  const j = await api('settings_get');
  if (!j.ok){
    const msg = j.detail ? (j.error + ': ' + j.detail) : (j.error || 'Failed to load settings.');
    setSettingsStatus(msg, 'error');
    return;
  }
  const s = j.settings || {};
  const set = (id, val)=>{ const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('set_api_base', s.HOTSPOT_API_BASE || '');
  set('set_pay_base', s.PAY_BASE || '');
  set('set_whatsapp', s.WHATSAPP_SUPPORT || '');
  set('set_topup_network', s.TOPUP_NETWORK || '');
  set('set_topup_name', s.TOPUP_NAME || '');
  set('set_topup_number', s.TOPUP_NUMBER || '');
  set('set_topup_text', s.TOPUP_WA_TEXT || '');
  set('set_topup_min', centsToAmount(s.TOPUP_MIN_CENTS || ''));
  set('set_referral_rate', s.REFERRAL_RATE_BPS || '');
  set('set_referral_monthly', centsToAmount(s.REFERRAL_MONTHLY_CAP_CENTS || ''));
  set('set_referral_lifetime', centsToAmount(s.REFERRAL_LIFETIME_CAP_CENTS || ''));
  set('set_referral_window', s.REFERRAL_WINDOW_DAYS || '');
  set('set_referral_hold', s.REFERRAL_PENDING_HOLD_DAYS || '');
  set('set_sms_base', s.MNOTIFY_BASE || '');
  set('set_sms_key', s.MNOTIFY_API_KEY || '');
  set('set_sms_sender', s.MNOTIFY_SENDER || '');
  set('set_sms_login_url', s.SMS_LOGIN_URL || '');
  set('set_sms_welcome', s.SMS_WELCOME_TEXT || '');
  set('set_sms_quota_warn', s.SMS_QUOTA_WARN_TEXT || '');
  set('set_sms_expiry_warn', s.SMS_EXPIRY_WARN_TEXT || '');
  set('set_sms_quota_pct', s.SMS_QUOTA_WARN_PCT || '');
  set('set_sms_quota_mb', s.SMS_QUOTA_WARN_MB || '');
  set('set_sms_expiry_hours', s.SMS_EXPIRY_WARN_HOURS || '');
  set('set_sms_debounce', s.SMS_DEBOUNCE_HOURS || '');
  set('set_sms_purchase', s.SMS_PURCHASE_CONFIRM_TEXT || '');
  set('set_sms_topup', s.SMS_TOPUP_CONFIRM_TEXT || '');
  set('set_sms_pending', s.SMS_PAYMENT_PENDING_TEXT || '');
  set('set_sms_failed', s.SMS_PAYMENT_FAILED_TEXT || '');
  set('set_sms_renew', s.SMS_RENEW_REMINDER_TEXT || '');
  set('set_sms_renew_hours', s.SMS_RENEW_REMINDER_HOURS || '');
  set('set_sms_pwd_reset', s.SMS_PASSWORD_RESET_TEXT || '');
  set('set_sms_back_online', s.SMS_BACK_ONLINE_TEXT || '');
  set('set_sms_inactive', s.SMS_INACTIVE_TEXT || '');
  set('set_sms_inactive_days', s.SMS_INACTIVE_DAYS || '');
  setSettingsStatus('Settings loaded.', 'success');
}

async function saveSettings(){
  const minTopupRaw = toolValue('set_topup_min');
  const referralMonthlyRaw = toolValue('set_referral_monthly');
  const referralLifetimeRaw = toolValue('set_referral_lifetime');
  const body = {
    HOTSPOT_API_BASE: toolValue('set_api_base'),
    PAY_BASE: toolValue('set_pay_base'),
    WHATSAPP_SUPPORT: toolValue('set_whatsapp'),
    TOPUP_NETWORK: toolValue('set_topup_network'),
    TOPUP_NAME: toolValue('set_topup_name'),
    TOPUP_NUMBER: toolValue('set_topup_number'),
    TOPUP_WA_TEXT: toolValue('set_topup_text'),
    TOPUP_MIN_CENTS: minTopupRaw ? String(parseAmountCents(minTopupRaw)) : '',
    REFERRAL_RATE_BPS: toolValue('set_referral_rate'),
    REFERRAL_MONTHLY_CAP_CENTS: referralMonthlyRaw ? String(parseAmountCents(referralMonthlyRaw)) : '',
    REFERRAL_LIFETIME_CAP_CENTS: referralLifetimeRaw ? String(parseAmountCents(referralLifetimeRaw)) : '',
    REFERRAL_WINDOW_DAYS: toolValue('set_referral_window'),
    REFERRAL_PENDING_HOLD_DAYS: toolValue('set_referral_hold'),
    MNOTIFY_BASE: toolValue('set_sms_base'),
    MNOTIFY_API_KEY: toolValue('set_sms_key'),
    MNOTIFY_SENDER: toolValue('set_sms_sender'),
    SMS_LOGIN_URL: toolValue('set_sms_login_url'),
    SMS_WELCOME_TEXT: toolValue('set_sms_welcome'),
    SMS_QUOTA_WARN_TEXT: toolValue('set_sms_quota_warn'),
    SMS_EXPIRY_WARN_TEXT: toolValue('set_sms_expiry_warn'),
    SMS_QUOTA_WARN_PCT: toolValue('set_sms_quota_pct'),
    SMS_QUOTA_WARN_MB: toolValue('set_sms_quota_mb'),
    SMS_EXPIRY_WARN_HOURS: toolValue('set_sms_expiry_hours'),
    SMS_DEBOUNCE_HOURS: toolValue('set_sms_debounce'),
    SMS_PURCHASE_CONFIRM_TEXT: toolValue('set_sms_purchase'),
    SMS_TOPUP_CONFIRM_TEXT: toolValue('set_sms_topup'),
    SMS_PAYMENT_PENDING_TEXT: toolValue('set_sms_pending'),
    SMS_PAYMENT_FAILED_TEXT: toolValue('set_sms_failed'),
    SMS_RENEW_REMINDER_TEXT: toolValue('set_sms_renew'),
    SMS_RENEW_REMINDER_HOURS: toolValue('set_sms_renew_hours'),
    SMS_PASSWORD_RESET_TEXT: toolValue('set_sms_pwd_reset'),
    SMS_BACK_ONLINE_TEXT: toolValue('set_sms_back_online'),
    SMS_INACTIVE_TEXT: toolValue('set_sms_inactive'),
    SMS_INACTIVE_DAYS: toolValue('set_sms_inactive_days'),
  };
  setSettingsStatus('Saving...');
  const j = await api('settings_save', body);
  if (!j.ok){
    const msg = j.detail ? (j.error + ': ' + j.detail) : (j.error || 'Save failed.');
    setSettingsStatus(msg, 'error');
    return;
  }
  setSettingsStatus('Settings saved.', 'success');
}

async function savePlan(){
  const code = toolValue('plan_code');
  const price = toolValue('plan_price');
  const days = toolValue('plan_days');
  if (!code){
    setPlanStatus('Plan code is required.', 'error');
    return;
  }
  if (!price){
    setPlanStatus('Price is required.', 'error');
    return;
  }
  if (!days){
    setPlanStatus('Duration days is required.', 'error');
    return;
  }
  const body = {
    plan_code: code,
    display_name: toolValue('plan_name'),
    price: price,
    duration_days: days,
    data_gb: toolValue('plan_data'),
    rate_limit: toolValue('plan_rate'),
    address_list: toolValue('plan_addr'),
    active: document.getElementById('plan_active')?.checked ? 1 : 0
  };
  setPlanStatus('Saving plan...');
  const j = await api('plan_save', body);
  if (!j.ok){
    setPlanStatus(j.error || 'Plan save failed.', 'error');
    return;
  }
  await loadPlans();
  setPlanStatus('Plan saved.', 'success');
}

async function deletePlan(code){
  if (!code) return;
  if (!confirm(`Delete plan ${code}? This removes it from the storefront.`)) return;
  setPlanStatus('Removing plan...');
  const j = await api('plan_delete', { plan_code: code });
  if (!j.ok){
    setPlanStatus(j.error || 'Plan delete failed.', 'error');
    return;
  }
  await loadPlans();
  setPlanStatus('Plan removed.', 'success');
}

async function loadPending(){
  const j = await api('pending');
  const tb = document.querySelector('#pending_tbl tbody');
  tb.innerHTML = '';
  const arr = (j.ok && Array.isArray(j.pending)) ? j.pending : [];
  if(arr.length === 0){
    tb.innerHTML = '<tr><td colspan="8" class="muted">No pending deposits.</td></tr>';
    return;
  }
  tb.innerHTML = arr.map(rowHTML).join('');
  tb.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const ref = ev.currentTarget.getAttribute('data-ref');
      const act = ev.currentTarget.getAttribute('data-act');
      const notes = prompt(`${act.toUpperCase()} notes (optional):`, '');
      if (notes === null) return; // user cancelled
      const body = { ref, action: act, notes };
      const res = await api('decision', body);
      if(res.ok){
        await loadStats();
        await loadPending();
        if (res.sms_attempted && !res.sms_sent) {
          alert(res.sms_warning || 'Decision saved, but SMS could not be delivered.');
        }
      }else{
        alert(res.error || 'Action failed');
      }
    });
  });
}

async function loadAlerts(){
  const j = await api('alerts_list', { limit: 200 });
  if (!j.ok){
    const tb = document.querySelector('#alerts_tbl tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="6" class="muted">Alerts error.</td></tr>';
    console.warn(j);
    return;
  }
  renderAlerts(j.alerts || []);

  const autoRetry = document.getElementById('alerts_auto_retry');
  if (autoRetry && autoRetry.checked && !alertsAutoRetryRunning) {
    alertsAutoRetryRunning = true;
    const alerts = Array.isArray(j.alerts) ? j.alerts : [];
    for (const a of alerts) {
      if (a && a.type === 'coa_fail' && !a.acked) {
        await api('alerts_retry', { id: a.id });
      }
    }
    alertsAutoRetryRunning = false;
    await loadAlerts();
  }
}

async function loadUserStates(){
  const search = document.getElementById('state_search')?.value || '';
  const group = document.getElementById('state_group')?.value || '';
  const expired_only = !!document.getElementById('state_expired')?.checked;
  const exhausted_only = !!document.getElementById('state_exhausted')?.checked;
  const j = await api('user_state_list', { limit: 300, search, group, expired_only, exhausted_only });
  if (!j.ok){ console.warn(j); return; }
  renderUserStates(j.users || []);
}

function toolValue(id){
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setToolStatus(msg, state){
  const el = document.getElementById('tool_status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('error','success');
  if (state === 'error') el.classList.add('error');
  if (state === 'success') el.classList.add('success');
}

function setSmsStatus(msg, state){
  const el = document.getElementById('sms_status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('error','success');
  if (state === 'error') el.classList.add('error');
  if (state === 'success') el.classList.add('success');
}

function updateSmsAudience(){
  const audience = toolValue('sms_audience');
  const groupEl = document.getElementById('sms_group');
  const recEl = document.getElementById('sms_recipients');
  if (groupEl) groupEl.disabled = (audience !== 'group');
  if (recEl) recEl.disabled = (audience !== 'list');
}

function renderUserSnapshot(data){
  const snap = document.getElementById('user_snapshot');
  const meta = document.getElementById('user_meta');
  const ledgerTb = document.querySelector('#user_ledger_tbl tbody');
  if (!snap || !meta || !ledgerTb) return;

  const balance = (data.balance_cents !== undefined && data.balance_cents !== null) ? centsToGHS(data.balance_cents) : 'n/a';
  const status = data.status || null;
  const plan = data.active_plan || null;
  const last = data.last_purchase || null;

  const quota = status && status.quota_bytes !== null ? Number(status.quota_bytes) : null;
  const used = status && status.used_bytes !== null ? Number(status.used_bytes) : null;
  const remaining = (quota !== null && used !== null) ? Math.max(0, quota - used) : null;

  snap.className = 'grid tight';
  snap.innerHTML = `
    <div class="kpi compact"><div class="label">Balance</div><div class="value">${safe(balance)}</div></div>
    <div class="kpi compact"><div class="label">Status</div><div class="value">${safe(statusLabel(status))}</div></div>
    <div class="kpi compact"><div class="label">Expires</div><div class="value">${safe((status && status.expires_at) || (plan && plan.expires_at) || '-')}</div></div>
    <div class="kpi compact"><div class="label">Quota</div><div class="value">${safe(fmtBytes(quota))}</div></div>
    <div class="kpi compact"><div class="label">Used</div><div class="value">${safe(fmtBytes(used))}</div></div>
    <div class="kpi compact"><div class="label">Remaining</div><div class="value">${safe(fmtBytes(remaining))}</div></div>
  `;

  const planCode = plan && plan.plan_code ? plan.plan_code : (status && status.group ? status.group : null);
  const planName = plan && plan.name ? plan.name : null;
  let planDisplay = '-';
  if (planName && planCode) planDisplay = `${safe(planName)} (${safe(planCode)})`;
  else if (planCode) planDisplay = safe(planCode);
  else if (planName) planDisplay = safe(planName);

  const rate = plan && plan.rate_limit ? safe(plan.rate_limit) : '-';
  const addr = plan && plan.address_list ? safe(plan.address_list) : (status && status.addrlist ? safe(status.addrlist) : '-');
  const lastCoa = data.last_coa_fail || null;
  let coaLine = '-';
  if (lastCoa) {
    const bits = [];
    if (lastCoa.created_at) bits.push(safe(lastCoa.created_at));
    if (lastCoa.msg) bits.push(safe(lastCoa.msg));
    if (bits.length) coaLine = bits.join(' | ');
  }

  let lastLine = '-';
  if (last) {
    const bits = [];
    if (last.plan_code) bits.push(safe(last.plan_code));
    if (last.status) bits.push(safe(last.status));
    if (last.price_cents !== undefined && last.price_cents !== null) {
      bits.push(safe(centsToGHS(last.price_cents)));
    } else if (last.price !== undefined && last.price !== null) {
      const priceNum = Number(last.price);
      if (isFinite(priceNum)) bits.push(safe('GHS ' + priceNum.toFixed(2)));
    }
    if (last.activated_at) bits.push(safe(last.activated_at));
    else if (last.created_at) bits.push(safe(last.created_at));
    if (last.expires_at) bits.push('exp ' + safe(last.expires_at));
    if (bits.length) lastLine = bits.join(' | ');
  }

  meta.innerHTML = `
    <div><span class="muted">Plan:</span> ${planDisplay}</div>
    <div><span class="muted">Rate limit:</span> ${rate}</div>
    <div><span class="muted">Address list:</span> ${addr}</div>
    <div><span class="muted">Last purchase:</span> ${lastLine}</div>
    <div><span class="muted">Last CoA fail:</span> ${coaLine}</div>
  `;

  const ledger = Array.isArray(data.ledger) ? data.ledger : [];
  if (!ledger.length){
    ledgerTb.innerHTML = '<tr><td colspan="5" class="muted">No ledger entries.</td></tr>';
  } else {
    ledgerTb.innerHTML = ledger.map(row=>`<tr>
      <td>${safe(row.type || '')}</td>
      <td>${safe(centsToGHS(row.amount_cents || 0))}</td>
      <td>${safe(row.ref || '')}</td>
      <td>${safe(row.notes || '')}</td>
      <td>${safe(row.created_at || '')}</td>
    </tr>`).join('');
  }
}

async function lookupUser(){
  const msisdn = toolValue('tool_msisdn');
  if (!msisdn){
    setToolStatus('MSISDN is required.', 'error');
    return;
  }
  setToolStatus('Loading user...');
  const j = await api('user_lookup', { msisdn });
  if (!j.ok){
    setToolStatus(j.error || 'Lookup failed.', 'error');
    return;
  }
  renderUserSnapshot(j);
  setToolStatus(`Loaded ${j.msisdn || msisdn}.`, 'success');
}

async function creditWallet(){
  const msisdn = toolValue('tool_msisdn');
  const amount = toolValue('tool_amount');
  const notes = toolValue('tool_notes') || 'Admin credit';
  if (!msisdn || !amount){
    setToolStatus('MSISDN and amount are required.', 'error');
    return;
  }
  const cents = parseAmountCents(amount);
  if (!cents){
    setToolStatus('Amount must be greater than 0.', 'error');
    return;
  }
  setToolStatus('Crediting wallet...');
  const j = await api('credit_wallet', { msisdn, amount, notes });
  if (!j.ok){
    setToolStatus(j.error || 'Credit failed.', 'error');
    return;
  }
  await loadStats();
  await lookupUser();
  setToolStatus(`Credited ${centsToGHS(cents)}.`, 'success');
}

async function applyPlan(){
  const msisdn = toolValue('tool_msisdn');
  const plan_code = toolValue('tool_plan');
  const amount = toolValue('tool_amount');
  if (!msisdn || !plan_code){
    setToolStatus('MSISDN and plan code are required.', 'error');
    return;
  }
  const body = { msisdn, plan_code };
  if (amount) body.amount = amount;
  setToolStatus('Applying plan...');
  const j = await api('apply_plan', body);
  if (!j.ok){
    setToolStatus(j.error || 'Apply plan failed.', 'error');
    return;
  }
  await loadStats();
  await lookupUser();
  setToolStatus(`Plan applied. Expires ${j.expires_at || '-'}.`, 'success');
}

async function disconnectUser(){
  const msisdn = toolValue('tool_msisdn');
  if (!msisdn){
    setToolStatus('MSISDN is required.', 'error');
    return;
  }
  if (!confirm(`Disconnect ${msisdn}?`)) return;
  setToolStatus('Sending disconnect...');
  const j = await api('disconnect_user', { msisdn });
  if (!j.ok){
    setToolStatus(j.error || 'Disconnect failed.', 'error');
    return;
  }
  setToolStatus('Disconnect sent.', 'success');
}

async function forceKickByIp(){
  const ip = toolValue('tool_ip');
  const msisdn = toolValue('tool_msisdn');
  if (!ip){
    setToolStatus('IP address is required.', 'error');
    return;
  }
  if (!confirm(`Force kick IP ${ip}?`)) return;
  setToolStatus('Sending IP disconnect...');
  const body = { ip };
  if (msisdn) body.msisdn = msisdn;
  const j = await api('user_force_kick_ip', body);
  if (!j.ok){
    setToolStatus(j.error || 'Force kick failed.', 'error');
    return;
  }
  const msg = j.user ? `Disconnect sent for ${ip} (${j.user}).` : `Disconnect sent for ${ip}.`;
  setToolStatus(msg, 'success');
}

async function setExpiry(){
  const msisdn = toolValue('tool_msisdn');
  const expires_at = toolValue('tool_expiry');
  const days = toolValue('tool_days');
  if (!msisdn){
    setToolStatus('MSISDN is required.', 'error');
    return;
  }
  if (!expires_at && !days){
    setToolStatus('Provide expiry date or days.', 'error');
    return;
  }
  setToolStatus('Setting expiry...');
  const j = await api('user_set_expiry', { msisdn, expires_at, days });
  if (!j.ok){
    setToolStatus(j.error || 'Expiry update failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus(`Expiry set to ${j.expires_at || expires_at}.`, 'success');
}

async function addQuota(){
  const msisdn = toolValue('tool_msisdn');
  const gb = toolValue('tool_add_gb');
  if (!msisdn || !gb){
    setToolStatus('MSISDN and add quota (GB) are required.', 'error');
    return;
  }
  setToolStatus('Adding quota...');
  const j = await api('user_add_quota', { msisdn, gb });
  if (!j.ok){
    setToolStatus(j.error || 'Add quota failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Quota added.', 'success');
}

async function setQuota(){
  const msisdn = toolValue('tool_msisdn');
  const gb = toolValue('tool_set_gb');
  if (!msisdn || !gb){
    setToolStatus('MSISDN and set quota (GB) are required.', 'error');
    return;
  }
  setToolStatus('Setting quota...');
  const j = await api('user_set_quota', { msisdn, gb });
  if (!j.ok){
    setToolStatus(j.error || 'Set quota failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Quota updated.', 'success');
}

async function clearQuota(){
  const msisdn = toolValue('tool_msisdn');
  if (!msisdn){
    setToolStatus('MSISDN is required.', 'error');
    return;
  }
  setToolStatus('Clearing quota...');
  const j = await api('user_clear_quota', { msisdn });
  if (!j.ok){
    setToolStatus(j.error || 'Clear quota failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Quota cleared.', 'success');
}

async function setAddrList(){
  const msisdn = toolValue('tool_msisdn');
  const addrlist = toolValue('tool_addrlist');
  if (!msisdn || !addrlist){
    setToolStatus('MSISDN and address list are required.', 'error');
    return;
  }
  setToolStatus('Setting address list...');
  const j = await api('user_set_addrlist', { msisdn, addrlist });
  if (!j.ok){
    setToolStatus(j.error || 'Set address list failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Address list updated.', 'success');
}

async function setRate(){
  const msisdn = toolValue('tool_msisdn');
  const rate_limit = toolValue('tool_rate');
  if (!msisdn || !rate_limit){
    setToolStatus('MSISDN and rate limit are required.', 'error');
    return;
  }
  setToolStatus('Setting rate limit...');
  const j = await api('user_set_rate', { msisdn, rate_limit });
  if (!j.ok){
    setToolStatus(j.error || 'Set rate failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Rate limit updated.', 'success');
}

async function setGroup(){
  const msisdn = toolValue('tool_msisdn');
  const group = toolValue('tool_group');
  if (!msisdn || !group){
    setToolStatus('MSISDN and group are required.', 'error');
    return;
  }
  setToolStatus('Setting group...');
  const j = await api('user_set_group', { msisdn, group });
  if (!j.ok){
    setToolStatus(j.error || 'Set group failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('Group updated.', 'success');
}

async function resetNoPaid(){
  const msisdn = toolValue('tool_msisdn');
  if (!msisdn){
    setToolStatus('MSISDN is required.', 'error');
    return;
  }
  if (!confirm(`Reset ${msisdn} to HS_NOPAID?`)) return;
  setToolStatus('Resetting user...');
  const j = await api('user_reset_nopaid', { msisdn });
  if (!j.ok){
    setToolStatus(j.error || 'Reset failed.', 'error');
    return;
  }
  await lookupUser();
  setToolStatus('User reset to HS_NOPAID.', 'success');
}

async function setPassword(){
  const msisdn = toolValue('tool_msisdn');
  const password = toolValue('tool_new_password');
  const confirm = toolValue('tool_new_password2');
  if (!msisdn || !password){
    setToolStatus('MSISDN and new password are required.', 'error');
    return;
  }
  if (confirm && confirm !== password){
    setToolStatus('Passwords do not match.', 'error');
    return;
  }
  if (!confirm && !window.confirm('Set password without confirmation?')) return;
  setToolStatus('Updating password...');
  const j = await api('user_set_password', { msisdn, password });
  if (!j.ok){
    setToolStatus(j.error || 'Password update failed.', 'error');
    return;
  }
  setToolStatus('Password updated.', 'success');
}

async function sendSms(){
  const audience = toolValue('sms_audience') || 'list';
  const group = toolValue('sms_group');
  const sender = toolValue('sms_sender');
  const msgEl = document.getElementById('sms_message');
  const recEl = document.getElementById('sms_recipients');
  const message = msgEl ? msgEl.value.trim() : '';
  const recipients = recEl ? recEl.value.trim() : '';
  if (!message){
    setSmsStatus('Message is required.', 'error');
    return;
  }
  if (audience === 'list' && !recipients){
    setSmsStatus('Recipients list is required for specific list.', 'error');
    return;
  }
  if (audience === 'group' && !group){
    setSmsStatus('Select a group to message.', 'error');
    return;
  }
  if (!confirm('Send this SMS now?')) return;
  setSmsStatus('Sending...');
  const body = { audience, group, sender, message, recipients };
  const j = await api('sms_send', body);
  if (!j.ok){
    let msg = j.error || 'SMS failed.';
    if (j.detail) msg = `${j.error}: ${j.detail}`;
    else if (j.response) {
      if (j.response.message) msg = `${j.error}: ${j.response.message}`;
      else if (typeof j.response === 'string') msg = `${j.error}: ${j.response}`;
      else msg = `${j.error}: ${JSON.stringify(j.response)}`;
    }
    setSmsStatus(msg, 'error');
    return;
  }
  setSmsStatus(`SMS sent to ${j.recipients || 0} recipients.`, 'success');
}

async function refreshAll(){
  const btn = document.getElementById('refresh_btn');
  if (btn) btn.disabled = true;
  await loadWho();
  await loadStats();
  await loadHealth();
  await loadPending();
  await loadPlans();
  await loadSettings();
  await loadAlerts();
  await loadUserStates();
  if (btn) btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', ()=>{
  initMenu();
  refreshAll();
  const btn = document.getElementById('refresh_btn');
  if (btn) btn.addEventListener('click', refreshAll);
  const lookupBtn = document.getElementById('tool_lookup');
  if (lookupBtn) lookupBtn.addEventListener('click', lookupUser);
  const creditBtn = document.getElementById('tool_credit');
  if (creditBtn) creditBtn.addEventListener('click', creditWallet);
  const applyBtn = document.getElementById('tool_apply');
  if (applyBtn) applyBtn.addEventListener('click', applyPlan);
  const disconnectBtn = document.getElementById('tool_disconnect');
  if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectUser);
  const forceKickBtn = document.getElementById('tool_force_kick_ip');
  if (forceKickBtn) forceKickBtn.addEventListener('click', forceKickByIp);
  const setExpBtn = document.getElementById('tool_set_expiry');
  if (setExpBtn) setExpBtn.addEventListener('click', setExpiry);
  const addQuotaBtn = document.getElementById('tool_add_quota');
  if (addQuotaBtn) addQuotaBtn.addEventListener('click', addQuota);
  const setQuotaBtn = document.getElementById('tool_set_quota');
  if (setQuotaBtn) setQuotaBtn.addEventListener('click', setQuota);
  const clearQuotaBtn = document.getElementById('tool_clear_quota');
  if (clearQuotaBtn) clearQuotaBtn.addEventListener('click', clearQuota);
  const setAddrBtn = document.getElementById('tool_set_addr');
  if (setAddrBtn) setAddrBtn.addEventListener('click', setAddrList);
  const setRateBtn = document.getElementById('tool_set_rate');
  if (setRateBtn) setRateBtn.addEventListener('click', setRate);
  const setGroupBtn = document.getElementById('tool_set_group');
  if (setGroupBtn) setGroupBtn.addEventListener('click', setGroup);
  const resetBtn = document.getElementById('tool_reset_nopaid');
  if (resetBtn) resetBtn.addEventListener('click', resetNoPaid);
  const setPassBtn = document.getElementById('tool_set_password');
  if (setPassBtn) setPassBtn.addEventListener('click', setPassword);

  const stateSearch = document.getElementById('state_search');
  if (stateSearch) stateSearch.addEventListener('input', loadUserStates);
  const stateGroup = document.getElementById('state_group');
  if (stateGroup) stateGroup.addEventListener('change', loadUserStates);
  const stateExpired = document.getElementById('state_expired');
  if (stateExpired) stateExpired.addEventListener('change', loadUserStates);
  const stateExhausted = document.getElementById('state_exhausted');
  if (stateExhausted) stateExhausted.addEventListener('change', loadUserStates);

  const planSave = document.getElementById('plan_save');
  if (planSave) planSave.addEventListener('click', savePlan);
  const planReset = document.getElementById('plan_reset');
  if (planReset) planReset.addEventListener('click', resetPlanForm);
  const settingsSave = document.getElementById('settings_save');
  if (settingsSave) settingsSave.addEventListener('click', saveSettings);
  const settingsReload = document.getElementById('settings_reload');
  if (settingsReload) settingsReload.addEventListener('click', loadSettings);

  const smsAudience = document.getElementById('sms_audience');
  if (smsAudience) smsAudience.addEventListener('change', updateSmsAudience);
  updateSmsAudience();
  const smsSendBtn = document.getElementById('sms_send');
  if (smsSendBtn) smsSendBtn.addEventListener('click', sendSms);

  const planTable = document.getElementById('plans_tbl');
  if (planTable && planTable.dataset.bound !== '1') {
    planTable.addEventListener('click', (e)=>{
      const editBtn = e.target.closest('[data-plan-edit]');
      if (editBtn) {
        const code = editBtn.getAttribute('data-plan-edit') || '';
        const plan = adminPlansByCode[code];
        if (plan) fillPlanForm(plan);
        return;
      }
      const delBtn = e.target.closest('[data-plan-delete]');
      if (delBtn) {
        const code = delBtn.getAttribute('data-plan-delete') || '';
        deletePlan(code);
      }
    });
    planTable.dataset.bound = '1';
  }
});
</script>
</body>
</html>
