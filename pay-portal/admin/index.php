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
  .kpi{
    padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;
    display:flex;flex-direction:column;gap:6px;min-height:92px;
  }
  .kpi .label{font-size:.85rem;color:var(--muted)}
  .kpi .value{font-size:1.35rem;font-weight:600}
  h2{font-family:var(--font-display);margin:.2rem 0 .8rem}
  .section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:8px}
  .table-wrap{overflow:auto;border-radius:12px;border:1px solid var(--line)}
  .table{width:100%;border-collapse:collapse;min-width:840px;background:#fff}
  .table th,.table td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;font-size:.92rem}
  .table thead th{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:#faf6f0}
  .table tbody tr:hover{background:rgba(15,118,110,.04)}
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
        <div class="label">Payments approved (today)</div>
        <div class="value" id="pay_today">GHS 0.00</div>
      </div>
      <div class="kpi">
        <div class="label">Active users</div>
        <div class="value" id="active_users">0</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="section-head">
      <h2>Payments</h2>
      <div class="muted">Approve or decline with notes for audit trail.</div>
    </div>
    <div class="grid">
      <div class="kpi"><div class="label">Pending</div><div class="value" id="pay_pending_cnt">0</div></div>
      <div class="kpi"><div class="label">Approved (count)</div><div class="value" id="pay_approved_cnt">0</div></div>
      <div class="kpi"><div class="label">Approved (total)</div><div class="value" id="pay_approved_sum">GHS 0.00</div></div>
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
function safe(v){ return (v===null||v===undefined)?'':String(v); }

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
  document.getElementById('active_users').textContent = j.active_users ?? 0;
  document.getElementById('pay_pending_cnt').textContent = j.payments?.pending_cnt ?? 0;
  document.getElementById('pay_approved_cnt').textContent = j.payments?.approved_cnt ?? 0;
  document.getElementById('pay_approved_sum').textContent = centsToGHS(j.payments?.approved_cents||0);
  document.getElementById('pay_today').textContent = centsToGHS(j.payments?.approved_today_cents||0);
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

async function refreshAll(){
  const btn = document.getElementById('refresh_btn');
  if (btn) btn.disabled = true;
  await loadWho();
  await loadStats();
  await loadPending();
  if (btn) btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', ()=>{
  refreshAll();
  const btn = document.getElementById('refresh_btn');
  if (btn) btn.addEventListener('click', refreshAll);
});
</script>
</body>
</html>
