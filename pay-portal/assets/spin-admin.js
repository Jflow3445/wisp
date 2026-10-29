'use strict';
(() => {
  const root = document.querySelector('#spin-admin'); if (!root) return;
  const $ = s => document.querySelector(s); const money = c => 'GHS ' + (Number(c) / 100).toFixed(2);
  let dashboard, mutation, page = 0, search = '', loadedAt = 0, applying = false, reviewing = false;
  const dialog = $('#admin-confirm');
  const message = text => { $('#admin-message').textContent = text; $('#admin-message').hidden = !text; };
  function minor(raw) { const m = /^(-?)(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw.trim()); if (!m) throw new Error('Use a monetary amount with at most two decimal places.'); return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'))); }
  function edgePpm(raw) {
    const m = /^(\d{1,2})(?:\.(\d{1,4}))?$/.exec(String(raw).trim());
    if (!m) throw new Error('Enter a minimum edge from 0 to 99.9999%, with at most four decimal places.');
    return Number(m[1]) * 10000 + Number((m[2] || '').padEnd(4, '0'));
  }
  function readRules() {
    const rules = {};
    for (const [key, value] of new FormData($('#rules-form'))) rules[key] = key === 'min_house_edge_ppm' ? edgePpm(value) : ['distribution', 'movement_model'].includes(key) ? value : key === 'weights' ? JSON.parse(value) : Number(value);
    return rules;
  }
  function edgeSummary() {
    try {
      const rules = readRules(), survival = 10000 - rules.zero_bps;
      const opening = survival <= 0 ? 0 : Math.min(999999, Math.floor((1000000 - rules.min_house_edge_ppm) * 10000 / survival));
      $('#edge-summary').textContent = 'Minimum expected edge: ' + (rules.min_house_edge_ppm / 10000).toFixed(4) + '%. Derived nonzero opening: ' + (opening / 10000).toFixed(4) + '% before pool and currency rounding.';
    } catch (error) { $('#edge-summary').textContent = 'Complete the settings to calculate the opening return.'; }
  }
  function showPreview(preview) {
    const e = preview.edge_model, auto = preview.automatic_finish;
    lines('#preview-result', [['Selected minimum expected edge', (e.selected_min_edge_ppm / 10000).toFixed(4) + '%'],
      ['Derived nonzero opening', (e.opening_return_ppm / 10000).toFixed(4) + '%'],
      ['Calculated model edge bound', e.model_min_edge_pct.toFixed(6) + '%'], ['Total-return ceiling', money(preview.cap_cents)],
      ['Nonzero opening for this stake', money(preview.opening_amount_cents)], ['Expected opening return / stake', preview.opening_return_pct.toFixed(4) + '%'],
      ['Minimum edge for this stake', preview.stake_min_edge_pct.toFixed(4) + '%'],
      ['Calibrated automatic-finish expected return', auto.estimated_return_pct.toFixed(4) + '% ± ' + auto.standard_error_pct.toFixed(4) + '% SE'],
      ['Calibrated automatic-finish expected edge', auto.estimated_edge_pct.toFixed(4) + '%'],
      ['Expected ceiling-rebound cost', auto.expected_ceiling_cost_cents.toFixed(4) + ' pesewas per flight'],
      ['Highest theoretically reachable return', money(preview.max_reachable_cents)],
      ['Profit reachable with this stake and rules', preview.profit_reachable ? 'Yes' : 'No'],
      ...Object.entries(preview.policies).map(([name, v]) => [name.replaceAll('_', ' '), v.estimated_return_pct.toFixed(2) + '% return ± ' + v.standard_error_pct.toFixed(2) + '% SE']),
      ['Simulation paths', preview.samples]]);
    return 'Selected minimum expected edge: ' + (e.selected_min_edge_ppm / 10000).toFixed(4) + '%\nDerived nonzero opening: ' + (e.opening_return_ppm / 10000).toFixed(4) +
      '%\nCalculated model edge bound: ' + e.model_min_edge_pct.toFixed(6) + '%\nAutomatic-finish expected return: ' + auto.estimated_return_pct.toFixed(4) + '% ± ' + auto.standard_error_pct.toFixed(4) + '% SE' + (preview.profit_reachable ? '' : '\nThis stake cannot return a profit under this draft and current pool.');
  }
  async function api(body, extra = '') {
    const response = await fetch('/admin/spin-api.php' + (body ? '' : '?search=' + encodeURIComponent(search) + '&page=' + page + extra), { cache: 'no-store', credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.csrf }, body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message || 'Administration service unavailable.'); return data;
  }
  function table(selector, rows, columns) {
    const container = $(selector); container.replaceChildren(); const wrap = document.createElement('div'); wrap.className = 'table-wrap'; const t = document.createElement('table');
    const header = t.createTHead().insertRow(); columns.forEach(([label]) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.append(th); }); const body = t.createTBody();
    if (!rows.length) { const cell = body.insertRow().insertCell(); cell.colSpan = columns.length; cell.textContent = 'No records on this page.'; }
    rows.forEach(item => { const row = body.insertRow(); columns.forEach(([, field, format]) => { const cell = row.insertCell(); cell.textContent = String(format ? format(item[field], item) : item[field] ?? '—'); if (['payload', 'reason', 'notes', 'rules_json'].includes(field)) cell.className = 'wrap'; }); });
    wrap.append(t); container.append(wrap);
  }
  function lines(selector, entries) { const target = $(selector); target.replaceChildren(); entries.forEach(([key, value]) => { const row = document.createElement('div'); row.className = 'quote-line'; const label = document.createElement('span'); label.textContent = key; const text = document.createElement('strong'); text.textContent = String(value ?? 'Never'); row.append(label, text); target.append(row); }); }
  const duration = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm ' + (s % 60) + 's'; };
  const eventColumns = [['Time (UTC)', 'created_at'], ['Actor', 'actor'], ['Event', 'event'], ['Details', 'payload']];
  function transitions() {
    const d = dashboard; const dt = Math.floor((Date.now() - loadedAt) / 1000); const w = d.watchdog; const s = d.state;
    const latest = name => d.transitions.find(e => e.event === name)?.created_at || 'Never';
    const rows = [['Operational state', s.state], ['Last qualifying administrator login', s.last_admin_login], ['Administrator', s.last_admin_user], ['Elapsed since login', duration(w.elapsed_seconds + dt)], ['Until automatic Ghost Mode', duration(w.remaining_seconds - dt)], ['Inactivity threshold', duration(s.threshold_seconds)], ['Watchdog enabled / healthy', 'Yes / ' + (w.healthy && dt < 180 ? 'Yes' : 'No')], ['Last watchdog evaluation', s.last_watchdog_at], ['Last financial reconciliation', s.last_reconcile_at], ['Reconciliation healthy', Number(s.reconcile_ok) ? 'Yes' : (s.health_error || 'No')], ['Last automatic ghost', latest('automatic_ghost')], ['Last manual ghost', latest('manual_ghost')], ['Last restoration', latest('restore')]];
    lines('#ghost-details', rows); lines('#pulse', rows.slice(0, 8));
  }
  function movementTable() { const filter = $('#movement-filter').value; table('#pool-table', dashboard.pool_movements.filter(e => filter === 'all' || (filter === 'manual' ? e.kind === 'manual' : e.kind !== 'manual')), [['Time (UTC)', 'created_at'], ['Kind', 'kind'], ['Movement', 'amount_cents', money], ['Pool after', 'balance_after_cents', money], ['Actor', 'actor'], ['Reason', 'reason'], ['Reference', 'ref']]); }
  function analytics() {
    const groups = new Map(); const period = $('#period').value;
    dashboard.daily.forEach(d => {
      let key = d.day;
      if (period === 'month') key = key.slice(0, 7);
      if (period === 'week') { const date = new Date(d.day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); key = date.toISOString().slice(0, 10); }
      if (!groups.has(key)) groups.set(key, { day: key, spins: 0, wins: 0, stakes_cents: 0, bonuses_cents: 0, credits_cents: 0, pool_movement_cents: 0, expected: 0, expectedWins: 0 });
      const v = groups.get(key); ['spins', 'wins', 'stakes_cents', 'bonuses_cents', 'credits_cents', 'pool_movement_cents'].forEach(k => v[k] += Number(d[k])); v.expected += Number(d.expected_rtp_pct) * Number(d.stake_cents); v.expectedWins += Number(d.expected_win_pct) * Number(d.spins);
    });
    const rows = [...groups.values()]; rows.forEach(r => { r.expected_rtp_pct = r.stakes_cents ? r.expected / r.stakes_cents : 0; r.expected_win_pct = r.spins ? r.expectedWins / r.spins : 0; });
    table('#daily-table', rows, [['Period (UTC)', 'day'], ['Spins', 'spins'], ['Stakes', 'stakes_cents', money], ['Flights with profit', 'wins', (v, r) => (v / r.spins * 100).toFixed(2) + '%'], ['Profit returned', 'bonuses_cents', money], ['Pool movement', 'pool_movement_cents', money], ['Payouts', 'credits_cents', money]]);
    const chart = $('#performance-chart'); chart.replaceChildren(); const max = Math.max(1, ...rows.map(r => r.stakes_cents));
    rows.slice(0, 30).reverse().forEach(r => { const bar = document.createElement('div'); bar.className = 'chart-bar'; bar.style.height = Math.max(2, r.stakes_cents / max * 100) + '%'; bar.title = r.day + ': ' + money(r.stakes_cents) + ' stakes, ' + money(r.bonuses_cents) + ' bonuses'; chart.append(bar); });
    if (!rows.length) chart.textContent = 'Performance appears after settled play.';
  }
  async function refresh() {
    try {
      const data = await api(); dashboard = data.dashboard; loadedAt = Date.now(); const d = dashboard, m = d.metrics, s = d.state;
      $('#admin-state').textContent = s.state; $('#ghost-control').textContent = s.state === 'GHOSTED' ? 'Restore Game' : 'Activate Ghost Mode'; $('#launch-notice').hidden = d.availability.launch_ready;
      $('#overview-metrics').replaceChildren();
      [['Prize pool', money(s.pool_cents), 'Internal results budget'], ['Total stakes', money(m.stakes_cents), m.spins + ' settled flights'], ['Actual win rate', Number(m.actual_win_pct).toFixed(2) + '%', m.wins + ' wins / ' + m.losses + ' losses'], ['Profit returned', money(m.bonuses_cents), 'Pool expenditure'], ['Total returns', money(m.wallet_winnings_cents), 'Paid into regular customer wallets'], ['Auto Ghost deadline', duration(d.watchdog.remaining_seconds), 'Without a qualifying login']].forEach(([label, value, sub]) => { const card = document.createElement('div'); card.className = 'admin-metric'; const l = document.createElement('span'), v = document.createElement('strong'), note = document.createElement('small'); l.textContent = label; v.textContent = value; note.textContent = sub; card.append(l, v, note); $('#overview-metrics').append(card); });
      transitions(); movementTable(); analytics();
      lines('#exposure', [['Current pool', money(s.pool_cents)], ['Maximum allocation', (d.rules.pool_bps / 100) + '%'], ['Total-return ceiling', money(d.bonus_ceiling_cents)], ['Held stakes', money(d.reservations.held)], ['Reserved gross returns', money(d.reservations.reserved)], ['Active / pending flights', d.reservations.active_count]]);
      lines('#credit-economics', [['Credit issued', money(m.credits_cents)], ['Outstanding credit', money(m.outstanding_credit_cents)], ['Credit redeemed', money(m.redeemed_cents)], ['Credit-funded purchases', m.credit_funded_purchases], ['Estimated delivery cost', money(m.estimated_delivery_cost_cents)], ['Possible displaced revenue (upper bound)', money(m.possible_displaced_revenue_cents)]]);
      const form = $('#rules-form');
      if (!form.contains(document.activeElement) && !form.dataset.dirty) Object.entries(d.rules).forEach(([key, value]) => { const input = form.elements.namedItem(key); if (input) input.value = key === 'weights' ? JSON.stringify(value) : key === 'min_house_edge_ppm' ? (value / 10000).toFixed(4) : value; });
      edgeSummary();
      $('#config-version').textContent = 'VERSION ' + s.flight_config_id;
      if (document.activeElement !== $('#threshold-hours')) $('#threshold-hours').value = s.threshold_seconds / 3600;
      table('#overview-events', d.transitions.slice(0, 6), eventColumns); table('#transition-table', d.transitions, eventColumns); table('#audit-table', d.events, [...eventColumns, ['HMAC', 'event_hash']]);
      table('#config-history', d.configs, [['Version', 'id'], ['Created (UTC)', 'created_at'], ['Administrator', 'created_by'], ['Reason', 'reason'], ['Rules', 'rules_json'], ['Hash', 'rules_hash']]);
      table('#players-table', d.players, [['WISP account', 'msisdn'], ['Optional age review', 'verified_at'], ['Restricted', 'restricted', v => Number(v) ? 'Yes' : 'No'], ['Excluded until', 'excluded_until'], ['Regular wallet', 'cash_cents', money], ['Legacy credits', 'network_credit_cents', money], ['Terms', 'terms_version']]);
      table('#spins-table', d.spins, [['Date (UTC)', 'created_at'], ['Account', 'msisdn'], ['Status', 'status'], ['Stake', 'stake_cents', money], ['Return ceiling', 'return_cap_cents', money], ['Total return', 'payout_cents', v => v === null ? 'Pending' : money(v)], ['Finish', 'end_reason'], ['Config', 'config_id'], ['Receipt', 'id']]);
      table('#cash-table', d.cash_entries, [['Date (UTC)', 'created_at'], ['Account', 'msisdn'], ['Type', 'type'], ['Amount', 'amount_cents', money], ['Receipt', 'ref'], ['Notes', 'notes']]);
      table('#credits-table', d.credit_entries, [['Date (UTC)', 'created_at'], ['Account', 'msisdn'], ['Type', 'kind'], ['Amount', 'amount_cents', money], ['Balance after', 'balance_after_cents', money], ['Receipt', 'ref'], ['Notes', 'notes']]);
      table('#redemptions-table', d.redemptions, [['Date (UTC)', 'created_at'], ['Account', 'msisdn'], ['Plan', 'plan_code'], ['Credit spent', 'price_cents', money], ['Purchase', 'purchase_id'], ['Expiry (UTC)', 'expires_at']]);
      table('#distribution-table', d.distribution, [['Outcome', 'outcome'], ['Flights', 'spins'], ['Total returns', 'returned_cents', money]]);
      $('#page-number').textContent = 'Page ' + (page + 1); $('#previous-page').disabled = page === 0;
    } catch (error) { message(error.message); }
  }
  function review(change, summary = '') {
    mutation = { ...change, request_key: crypto.randomUUID() }; $('#admin-change-preview').textContent = (summary ? summary + '\n\n' : '') + JSON.stringify(change, null, 2);
    $('#admin-reason').value = ''; $('#admin-confirm-message').textContent = ''; dialog.showModal(); $('#admin-reason').focus();
  }
  $('#admin-confirm-form').addEventListener('submit', async e => {
    e.preventDefault(); if (applying || !mutation) return; applying = true; $('#admin-apply').disabled = true;
    // Keep reason and request key fixed on a retry.
    if (!mutation.reason) mutation.reason = $('#admin-reason').value;
    try { const result = await api(mutation); dialog.close(); message('Change recorded. Reference ' + result.result.ref); $('#rules-form').removeAttribute('data-dirty'); mutation = null; await refresh(); }
    catch (error) { $('#admin-confirm-message').textContent = error.message + ' Retry retains this operation reference. Close and review again to change the operation.'; }
    finally { applying = false; $('#admin-apply').disabled = false; }
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== button.dataset.tab; }); document.querySelectorAll('[data-tab]').forEach(b => { if (b === button) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }));
  document.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => review({ action: 'state', state: b.dataset.state })));
  $('#ghost-control').addEventListener('click', () => { if (dashboard) review({ action: 'state', state: dashboard.state.state === 'GHOSTED' ? 'RESTORE' : 'GHOSTED' }); });
  $('#pool-form').addEventListener('submit', e => { e.preventDefault(); try { review({ action: 'pool', amount_cents: minor($('#pool-delta').value) }); } catch (error) { message(error.message); } });
  $('#threshold-form').addEventListener('submit', e => { e.preventDefault(); review({ action: 'threshold', hours: Number($('#threshold-hours').value) }); });
  $('#rules-form').addEventListener('input', e => { e.currentTarget.dataset.dirty = '1'; edgeSummary(); });
  $('#rules-form').addEventListener('submit', async e => {
    e.preventDefault(); if (reviewing) return; reviewing = true;
    const button = e.currentTarget.querySelector('button[type=submit]'); button.disabled = true;
    try {
      const rules = readRules(); const data = await api({ action: 'preview', rules, stake_cents: minor($('#preview-stake').value) });
      review({ action: 'flight_rules', rules }, showPreview(data.preview));
    } catch (error) { message(error.message); }
    finally { reviewing = false; button.disabled = false; }
  });
  $('#preview-form').addEventListener('submit', async e => { e.preventDefault(); try { const data = await api({ action: 'preview', rules: readRules(), stake_cents: minor($('#preview-stake').value) }); showPreview(data.preview); } catch (error) { message(error.message); } });
  $('#player-form').addEventListener('submit', e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); const change = { action: 'player', msisdn: values.msisdn }; if (values.review_action === 'identity') { change.birth_date = values.birth_date; change.verification_ref = values.verification_ref; } else change.restricted = values.review_action === 'restrict'; review(change); });
  $('#correction-form').addEventListener('submit', e => { e.preventDefault(); try { const values = Object.fromEntries(new FormData(e.currentTarget)); review({ action: 'credit_correction', msisdn: values.msisdn, amount_cents: minor(values.amount) }); } catch (error) { message(error.message); } });
  $('#search-form').addEventListener('submit', e => { e.preventDefault(); search = $('#player-search').value.trim(); page = 0; refresh(); });
  $('#movement-filter').addEventListener('change', movementTable); $('#period').addEventListener('change', analytics);
  $('#reconcile').addEventListener('click', async () => { try { const data = await api(null, '&action=reconcile'); $('#reconcile-result').textContent = JSON.stringify(data.reconciliation, null, 2); } catch (error) { message(error.message); } });
  $('#export-audit').addEventListener('click', () => { if (!dashboard) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ state: dashboard.state, events: dashboard.events, transitions: dashboard.transitions }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'nister-game-audit-page-' + (page + 1) + '.json'; link.click(); URL.revokeObjectURL(url); });
  $('#previous-page').addEventListener('click', () => { page = Math.max(0, page - 1); refresh(); }); $('#next-page').addEventListener('click', () => { page++; refresh(); }); $('#refresh-admin').addEventListener('click', refresh);
  refresh(); setInterval(() => { if (dashboard) transitions(); }, 1000); setInterval(() => { if (!document.hidden && !dialog.open) refresh(); }, 30000);
})();
