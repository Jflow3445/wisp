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
  .field input:focus{outline:2px solid rgba(15,118,110,.2);border-color:var(--accent)}
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

  <div class="card">
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
  </div>

  <div class="card">
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

  <div class="card">
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

  <div class="card">
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
    <div class="hint">Plan codes allow letters, numbers, "_" and "-". Groups starting with "HS_" or "nopaid" are protected.</div>
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

  <div class="card">
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

  <div class="card">
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

  <div class="card">
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

  <div class="card">
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
        </div>
        <div class="tool-actions">
          <button class="btn" id="tool_lookup" type="button">Lookup</button>
          <button class="btn approve" id="tool_credit" type="button">Credit Wallet</button>
          <button class="btn" id="tool_apply" type="button">Apply Plan</button>
          <button class="btn decline" id="tool_disconnect" type="button">Disconnect</button>
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
</div>

<script>
async function api(fn, body){
  const opts = body ? { method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(body) } : {};
  const r = await fetch(`/admin/api.php?fn=${encodeURIComponent(fn)}`, opts);
  return r.json();
}

function centsToGHS(c){ return 'GHS ' + (c/100).toFixed(2); }
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
  const tags = [];
  if (st.expired) tags.push('expired');
  if (st.exhausted) tags.push('exhausted');
  if (!tags.length && st.paid) tags.push('paid-limited');
  if (!tags.length) tags.push('nopaid');
  return tags.join(' / ');
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

let adminPlansByCode = {};

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
      const notes = prompt(`${act.toUpperCase()} notes (optional):`, '') || '';
      const body = { ref, action: act, notes };
      const res = await api('decision', body);
      if(res.ok){
        await loadStats();
        await loadPending();
      }else{
        alert(res.error || 'Action failed');
      }
    });
  });
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

async function refreshAll(){
  const btn = document.getElementById('refresh_btn');
  if (btn) btn.disabled = true;
  await loadWho();
  await loadStats();
  await loadPending();
  await loadPlans();
  if (btn) btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', ()=>{
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

  const planSave = document.getElementById('plan_save');
  if (planSave) planSave.addEventListener('click', savePlan);
  const planReset = document.getElementById('plan_reset');
  if (planReset) planReset.addEventListener('click', resetPlanForm);

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
