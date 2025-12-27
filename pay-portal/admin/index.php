<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
$ENV = admin_boot();
admin_require_login();
?><!doctype html>
<html>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nister Admin</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;margin:0;line-height:1.45;background:#f8fafc}
  .wrap{max-width:1100px;margin:0 auto;padding:24px}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 16px}
  .row{display:flex;gap:16px;flex-wrap:wrap}
  .col{flex:1 1 320px}
  h1,h2,h3{margin:.2rem 0 .8rem}
  .muted{color:#64748b}
  .table{width:100%;border-collapse:collapse}
  .table th,.table td{padding:.5rem;border-bottom:1px solid #e5e7eb;text-align:left}
  .badge{display:inline-block;border:1px solid #94a3b8;border-radius:999px;padding:.1rem .5rem;font-size:.8rem;margin-left:.25rem}
  .btn{display:inline-block;padding:.4rem .6rem;border:1px solid #cbd5e1;border-radius:8px;text-decoration:none;cursor:pointer;background:#fff}
  .btn.approve{border-color:#16a34a}
  .btn.decline{border-color:#dc2626}
  .grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  .stat{font-size:1.2rem}
  .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div><h1>Nister Admin</h1><div class="muted" id="whoami">...</div></div>
    <div><a class="btn" href="/admin/index.php?logout=1">Logout</a></div>
  </div>

  <div class="card">
    <h2>Business Overview</h2>
    <div class="grid3">
      <div class="col">
        <div class="muted">Wallet liability</div>
        <div class="stat" id="wallet_liability">–</div>
      </div>
      <div class="col">
        <div class="muted">Payments approved (today)</div>
        <div class="stat" id="pay_today">–</div>
      </div>
      <div class="col">
        <div class="muted">Active users</div>
        <div class="stat" id="active_users">–</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Payments</h2>
    <div class="grid3">
      <div class="col"><div class="muted">Pending</div><div class="stat" id="pay_pending_cnt">–</div></div>
      <div class="col"><div class="muted">Approved (count)</div><div class="stat" id="pay_approved_cnt">–</div></div>
      <div class="col"><div class="muted">Approved (total)</div><div class="stat" id="pay_approved_sum">–</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Pending Deposits</h2>
    <table class="table" id="pending_tbl">
      <thead>
        <tr>
          <th>Ref</th><th>MSISDN</th><th>Amount</th><th>Method</th><th>Payer</th><th>Notes</th><th>When</th><th>Action</th>
        </tr>
      </thead>
      <tbody><tr><td colspan="8" class="muted">Loading…</td></tr></tbody>
    </table>
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
    document.getElementById('whoami').textContent = `Logged in as ${j.user} · since ${at} · IP ${j.ip}`;
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
      <button class="btn approve" data-act="approve" data-ref="${safe(p.ref)}">Approve</button>
      <button class="btn decline" data-act="decline" data-ref="${safe(p.ref)}">Decline</button>
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

document.addEventListener('DOMContentLoaded', ()=>{
  loadWho();
  loadStats();
  loadPending();
});
</script>
</body>
</html>
