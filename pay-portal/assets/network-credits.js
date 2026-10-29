'use strict';
(() => {
  const root = document.querySelector('#credit-main'); if (!root) return;
  const $ = s => document.querySelector(s); const money = c => 'GHS ' + (Number(c) / 100).toFixed(2);
  const key = 'nister.credit.purchase.' + root.dataset.account; let pending = null, busy = false, page = 0;
  const message = text => { $('#credit-message').textContent = text; $('#credit-message').hidden = !text; };
  function table(selector, rows, values) {
    const body = $(selector); body.replaceChildren();
    if (!rows.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 10; cell.textContent = 'No transactions yet.'; return; }
    rows.forEach(value => { const row = body.insertRow(); values(value).forEach(text => { row.insertCell().textContent = String(text ?? ''); }); });
  }
  async function request(body) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('/network-credit-api.php' + (body ? '' : '?page=' + page), { signal: controller.signal, credentials: 'same-origin', cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.csrf }, body: JSON.stringify(body) } : {}) });
      const data = await res.json(); if (!res.ok || !data.ok) { const error = new Error(data.message || 'Credit service unavailable.'); error.status = res.status; throw error; } return data;
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    try {
      const data = await request(); const credits = data.credits;
      $('#network-total').textContent = money(credits.balance_cents);
      table('#credit-history', credits.entries, e => [e.created_at, e.kind, money(e.amount_cents), money(e.balance_after_cents), e.ref, e.notes]);
      table('#stake-history', credits.spins, e => [e.created_at, e.outcome, money(e.stake_cents), money(e.outcome === 'win' ? e.stake_cents : 0), e.bonus_pct + '%', money(e.bonus_cents), money(e.credit_cents), 'v' + e.config_id, 'SPIN-' + e.id]);
      table('#redemption-history', credits.redemptions, e => [e.created_at, e.plan_code, money(e.price_cents), e.purchase_id, e.expires_at]);
      const plans = $('#credit-plans'); plans.replaceChildren();
      data.plans.filter(p => p.price_cents > 0 && p.active !== false).forEach(plan => {
        const card = document.createElement('article'); card.className = 'credit-plan';
        const name = document.createElement('h3'); name.textContent = plan.name || plan.display_name || plan.code;
        const detail = document.createElement('p'); detail.textContent = money(plan.price_cents) + ' · ' + (plan.duration_days || 30) + ' days';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn'; button.textContent = credits.balance_cents >= plan.price_cents ? 'Purchase with credits' : 'Insufficient network credits';
        button.disabled = busy || !!pending || credits.balance_cents < plan.price_cents;
        button.addEventListener('click', async () => {
          if (busy || pending || !confirm('Spend ' + money(plan.price_cents) + ' of network credit on ' + name.textContent + '?')) return;
          try { pending = { plan_code: plan.code, request_key: crypto.randomUUID() }; localStorage.setItem(key, JSON.stringify(pending)); await purchase(); }
          catch (_) { message('Recovery storage is required before purchasing.'); pending = null; }
        }); card.append(name, detail, button); plans.append(card);
      });
      $('#retry-purchase').hidden = !pending;
      $('#credit-previous').disabled = page === 0;
      $('#credit-next').disabled = Math.max(credits.entries.length, credits.spins.length, credits.redemptions.length) < 100;
      $('#credit-page').textContent = 'Page ' + (page + 1);
    } catch (e) { message(e.message); }
  }
  async function purchase() {
    if (!pending || busy) return; busy = true; await refresh();
    try {
      const data = await request(pending); localStorage.removeItem(key); pending = null;
      message('Internet purchase confirmed. Receipt NET-' + data.receipt.id + '. Expires ' + data.receipt.expires_at + ' UTC.');
    } catch (e) { message(e.status && e.status < 500 ? e.message : 'Purchase confirmation interrupted. Recover the saved purchase using the same reference.'); if (e.status && e.status < 500) { localStorage.removeItem(key); pending = null; } }
    finally { busy = false; await refresh(); }
  }
  $('#retry-purchase').addEventListener('click', purchase);
  $('#credit-previous').addEventListener('click', () => { page = Math.max(0, page - 1); refresh(); });
  $('#credit-next').addEventListener('click', () => { page++; refresh(); });
  try { pending = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { message('Browser recovery storage is unavailable.'); }
  refresh();
})();
