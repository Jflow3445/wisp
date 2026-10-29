'use strict';
(() => {
  const app = document.querySelector('#spin-app'); if (!app) return;
  const $ = s => document.querySelector(s);
  const money = c => 'GHS ' + (Number(c) / 100).toFixed(2);
  const storageKey = 'nister.flight.pending.' + app.dataset.account;
  const dialog = $('#confirm-dialog');
  // Keep the selected account section visible in the portal's mobile menu.
  function revealAccountSection() {
    const menu = $('.user-menu'), selected = menu?.querySelector('[aria-current="page"]');
    if (!selected || menu.scrollWidth <= menu.clientWidth) return;
    const bounds = menu.getBoundingClientRect(), active = selected.getBoundingClientRect();
    menu.scrollLeft += active.left - bounds.left - (bounds.width - active.width) / 2;
  }
  requestAnimationFrame(revealAccountSection);
  window.addEventListener('resize', revealAccountSection);
  document.fonts?.ready.then(revealAccountSection);
  const flightMotion = new window.NisterFlightMotion($('#flight-stage'));
  let snapshot, round, pending, busy = false, polling = false, receiptId, firstStake, offset = 0, latency = 0;
  function minor(value) {
    const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
    if (!match) throw new Error('Enter an amount with at most two decimal places.');
    return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  }
  function message(text) { $('#game-message').textContent = text; $('#game-message').hidden = !text; }
  function showStage() {
    $('#flight-stage').focus({ preventScroll: true });
    if (window.matchMedia('(max-width:650px)').matches) $('#flight-stage').scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  }
  async function api(body, query = '') {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    const sent = Date.now();
    try {
      const response = await fetch('/spin-api.php' + query, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': app.dataset.csrf }, body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok || !data.ok) { const error = new Error(data.message || 'The game is temporarily unavailable.'); error.code = data.error; error.status = response.status; throw error; }
      const view = data.flight || data.game?.active_flight;
      if (view) { latency = Date.now() - sent; offset = view.server_ms - sent; }
      return data;
    } finally { clearTimeout(timeout); }
  }
  function save(value) {
    if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey);
    pending = value;
  }
  function controls() {
    const live = round?.status === 'ACTIVE', waiting = round?.status === 'PAYOUT_PENDING';
    const blocked = snapshot?.eligibility && snapshot.eligibility.code !== 'terms_required';
    $('#review-stake').hidden = live || waiting;
    $('#review-stake').disabled = busy || !!pending || !snapshot?.availability.can_play || !!blocked;
    $('#stake').disabled = busy || !!pending;
    document.querySelectorAll('[data-stake]').forEach(b => { b.disabled = busy || !!pending || Number(b.dataset.stake) < (snapshot?.rules.min_stake_cents || 0); });
    $('#collect-flight').hidden = !live;
    const fresh = live && round.offer && round.offer.expires_ms - (Date.now() + offset) > Math.max(350, latency + 100);
    $('#collect-flight').disabled = busy || !!pending?.collect || !fresh;
    $('#collect-flight').textContent = busy && pending?.collect ? 'Securing your return...' : 'Stop & Collect' + (live ? ' ' + money(round.offer.amount_cents) : '');
    const liveReturn = live ? round.offer.amount_cents : 0;
    const profit = live && liveReturn > round.stake_cents;
    $('#collect-flight').dataset.outcome = profit ? 'profit' : live && liveReturn === round.stake_cents ? 'even' : 'loss';
    $('#collect-breakdown').hidden = !live;
    if (live) $('#collect-breakdown').textContent = profit ? money(round.stake_cents) + ' stake + ' + money(liveReturn - round.stake_cents) + ' profit' :
      liveReturn === round.stake_cents ? 'Your full stake returned.' : money(liveReturn) + ' recovered \u00b7 ' + money(round.stake_cents - liveReturn) + ' loss';
    $('#pending-box').hidden = !pending || (live && !pending.collect);
    $('#pending-text').textContent = waiting ? 'Your return is secured. Waiting for wallet space.' : pending?.collect ? 'Checking whether your collection was accepted...' : 'Checking your flight...';
    $('#recover-spin').disabled = busy;
    $('#confirm-spin').disabled = busy || !$('#ack-risk').checked;
    app.setAttribute('aria-busy', String(busy));
    flightMotion.freeze(!!pending?.collect);
    if (live) $('#flight-time').textContent = Math.max(0, Math.ceil((round.end_ms - Date.now() - offset) / 1000)) + 's remaining';
  }
  function history(rows) {
    const body = $('#spin-history'); body.replaceChildren();
    if (!rows.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = 'Your flights will appear here.'; return; }
    rows.forEach(r => {
      const result = Number(r.payout_cents) > Number(r.stake_cents) ? 'Profit' : Number(r.payout_cents) === Number(r.stake_cents) ? 'Break even' : Number(r.payout_cents) > 0 ? 'Partial return' : 'Zero return';
      const row = body.insertRow();
      [r.settled_at, result, money(r.stake_cents), money(r.payout_cents), money(r.cash_after_cents)].forEach(t => { row.insertCell().textContent = t; });
    });
  }
  function draw(view) {
    if (pending?.id && pending.id !== view.id) return;
    if (round?.id === view.id && (view.server_ms < round.server_ms || (round.status === 'SETTLED' && view.status !== 'SETTLED'))) return;
    round = view; $('#cash-balance').textContent = money(view.wallet_cents);
    $('#held-balance').textContent = view.held_cents ? money(view.held_cents) + ' stake held' : 'No stake held';
    const amount = view.offer ? view.offer.amount_cents : Number(view.receipt.payout_cents);
    const net = amount - view.stake_cents;
    const shownMultiplier = Math.floor(amount * 100 / view.stake_cents) / 100;
    $('#flight-multiplier').textContent = amount > 0 && shownMultiplier === 0 ? '< 0.01x' : (amount * 100 % view.stake_cents ? '\u2248 ' : '') + shownMultiplier.toFixed(2) + 'x';
    $('#flight-return').textContent = money(amount) + (view.status === 'ACTIVE' ? ' current return' : ' total return');
    $('#flight-net').textContent = net === 0 ? 'Break even' : (net > 0 ? '+' : '-') + money(Math.abs(net)) + (net > 0 ? ' net profit' : ' from your stake');
    $('#flight-stage').dataset.position = net > 0 ? 'profit' : net < 0 ? 'loss' : 'even';
    $('#flight-tag').textContent = view.status === 'ACTIVE' ? 'FLIGHT IN PROGRESS' : view.status === 'PAYOUT_PENDING' ? 'RETURN SECURED' : 'FLIGHT COMPLETE';
    $('#flight-caption').textContent = view.status === 'ACTIVE' ? 'Collect now, or stay in flight. The return can change.' : 'The final return is locked.';
    $('#game-state').textContent = view.status === 'ACTIVE' ? 'In flight' : view.status === 'PAYOUT_PENDING' ? 'Return pending' : 'Ready for another?';
    flightMotion.update(view);
    if (view.status !== 'ACTIVE') {
      $('#flight-time').textContent = view.receipt.end_reason === 'collected' ? 'COLLECTED' : 'AUTOMATIC FINISH';
      const receipt = view.receipt, root = $('#result'); root.replaceChildren(); root.hidden = false;
      root.dataset.outcome = net > 0 ? 'profit' : net < 0 ? 'loss' : 'even';
      const title = document.createElement('h2');
      title.textContent = net > 0 ? money(net) + ' profit.' : amount === 0 ? 'Flight ended at zero.' : net === 0 ? 'Stake returned.' : money(amount) + ' returned.';
      const text = document.createElement('p');
      text.textContent = view.status === 'PAYOUT_PENDING' ? 'Your exact return is secured. It will be credited automatically when your wallet has enough space. You cannot start another flight while this is pending.' :
        money(amount) + ' returned to your wallet.';
      const breakdown = document.createElement('dl'); breakdown.className = 'return-breakdown';
      const lines = [[net > 0 ? 'Stake returned' : 'Stake recovered', Math.min(view.stake_cents, amount)], [net >= 0 ? 'Net profit' : 'Net loss', Math.abs(net)],
        [view.status === 'PAYOUT_PENDING' ? 'Total secured' : 'Total credited', amount]];
      lines.forEach(([label, value]) => { const row = document.createElement('div'), term = document.createElement('dt'), figure = document.createElement('dd'); term.textContent = label; figure.textContent = money(value); row.append(term, figure); breakdown.append(row); });
      const ref = document.createElement('small'); ref.className = 'receipt-ref'; ref.textContent = 'Receipt FLT-' + receipt.id;
      root.append(title, text, breakdown);
      if (view.status === 'SETTLED') {
        const before = Number(receipt.cash_after_hold_cents) + view.stake_cents;
        const after = Number(receipt.cash_after_cents);
        const movement = view.wallet_movement || { before_cents: before, after_cents: after, other_activity_cents: after - (before - view.stake_cents + amount) };
        const other = Number(movement.other_activity_cents);
        const equation = document.createElement('p'); equation.className = 'wallet-equation';
        equation.textContent = 'Wallet for this flight: ' + money(movement.before_cents) + ' \u2212 ' + money(view.stake_cents) + ' stake + ' + money(amount) + ' returned' +
          (other ? (other > 0 ? ' + ' : ' \u2212 ') + money(Math.abs(other)) + ' other activity' : '') + ' = ' + money(movement.after_cents) + '.';
        root.append(equation);
      }
      root.append(ref);
      if (receiptId !== receipt.id || view.status === 'SETTLED') $('#spin-live').textContent = title.textContent;
      receiptId = receipt.id;
      if (view.status === 'SETTLED') save(null);
    }
    controls();
  }
  async function refresh() {
    try {
      snapshot = (await api()).game;
      $('#cash-balance').textContent = money(snapshot.wallet.balance_cents); $('#account-number').textContent = snapshot.account.number;
      $('#stake-hint').textContent = 'Minimum ' + money(snapshot.rules.min_stake_cents);
      $('#eligibility-note').hidden = !snapshot.eligibility || snapshot.eligibility.code === 'terms_required';
      $('#eligibility-note').textContent = snapshot.eligibility?.message || '';
      $('#availability-message').hidden = snapshot.availability.can_play;
      $('#availability-message').textContent = 'New flights are temporarily unavailable. Your accepted flight can still finish.';
      history(snapshot.history);
      if (!pending && !snapshot.active_flight) $('#game-state').textContent = snapshot.availability.can_play ? 'Ready to fly' : 'Temporarily unavailable';
      if (snapshot.active_flight && !busy) { if (!pending) save({ id: snapshot.active_flight.id }); draw(snapshot.active_flight); }
      controls(); return true;
    } catch (e) {
      if (e.status === 404 && !pending && receiptId) {
        snapshot.availability.can_play = false; controls();
        $('#availability-message').hidden = false;
        $('#availability-message').textContent = 'New flights are temporarily unavailable. Your completed return is recorded below.';
        $('#game-state').textContent = 'Flight complete';
      } else if (e.status === 404 && !pending) { $('#game-content').hidden = true; $('#closed-content').hidden = false; if (dialog.open) dialog.close(); }
      else message(e.message);
      return false;
    }
  }
  async function start(stake) {
    if (busy || pending) return;
    busy = true; message(''); $('#result').hidden = true;
    try {
      save({ key: crypto.randomUUID(), stake }); controls();
      const data = await api({ action: 'start', stake_cents: stake, request_key: pending.key });
      if (data.flight.status !== 'SETTLED') save({ ...pending, id: data.flight.id });
      draw(data.flight);
      if (data.flight.status === 'ACTIVE') showStage();
      if (data.flight.status === 'SETTLED') await refresh();
    } catch (e) {
      // Transport errors may have committed. Keep the reference until the server resolves it.
      if (e.status && e.status < 500) save(null);
      message(e.message);
    } finally { busy = false; controls(); }
  }
  async function recover() {
    if (busy || !pending) return;
    busy = true; controls();
    try {
      if (pending.collect) {
        const data = await api({ action: 'collect', round_id: pending.id, offer_id: pending.collect.offer, request_key: pending.collect.key });
        draw(data.flight);
      } else {
        const query = pending.id ? '&id=' + pending.id : '&request_key=' + encodeURIComponent(pending.key);
        const data = await api(null, '?action=flight' + query);
        if (data.flight) { if (!pending.id) save({ ...pending, id: data.flight.id }); draw(data.flight); }
        else {
          // No accepted request: replay the SAME key, never create a second stake.
          const data = await api({ action: 'start', stake_cents: pending.stake, request_key: pending.key });
          if (data.flight.status !== 'SETTLED') save({ ...pending, id: data.flight.id });
          draw(data.flight);
        }
      }
      message(''); if (round?.status === 'SETTLED') await refresh();
    } catch (e) {
      if (e.code === 'offer_expired') { save({ ...pending, collect: null }); message(e.message); }
      else if (e.status && e.status < 500 && !pending?.id) { save(null); message(e.message); }
      else message(e.message + ' Use Check my flight to retry safely.');
    } finally { busy = false; controls(); }
  }
  async function poll() {
    if (busy || polling || !pending?.id || pending.collect) return;
    polling = true;
    try {
      const data = await api(null, '?action=flight&id=' + pending.id);
      if (!busy) draw(data.flight);
      if (round?.status === 'SETTLED') await refresh();
    } catch (e) { message('Connection interrupted. The flight continues; reconnect to check its return.'); $('#collect-flight').disabled = true; }
    finally { polling = false; }
  }
  async function watchFlight() {
    await poll();
    const remaining = round?.offer ? round.offer.expires_ms - Date.now() - offset : 400;
    const delay = pending?.id && !pending.collect ? Math.min(400, Math.max(100, remaining + 20)) : 400;
    setTimeout(watchFlight, delay);
  }
  $('#stake-form').addEventListener('submit', e => {
    e.preventDefault(); if (busy || pending || !snapshot) return;
    try {
      firstStake = minor($('#stake').value);
      if (firstStake < snapshot.rules.min_stake_cents) throw new Error('Choose at least ' + money(snapshot.rules.min_stake_cents) + '.');
      if (firstStake > snapshot.wallet.stakeable_cents) throw new Error('Your wallet has insufficient funds.');
      if (!snapshot.consent_accepted) { $('#first-stake').textContent = 'Your first stake: ' + money(firstStake); dialog.showModal(); }
      else start(firstStake);
    } catch (error) { message(error.message); }
  });
  $('#ack-risk').addEventListener('change', controls);
  $('#confirm-spin').addEventListener('click', async () => {
    if (busy || !$('#ack-risk').checked) return; busy = true; controls();
    try { await api({ action: 'preferences', accept_terms: true }); snapshot.consent_accepted = true; dialog.close(); busy = false; await start(firstStake); }
    catch (e) { $('#consent-message').textContent = e.message; } finally { busy = false; controls(); }
  });
  $('#collect-flight').addEventListener('click', async () => {
    controls(); if ($('#collect-flight').disabled) return;
    // Freeze this exact offer while the collection request is in flight.
    save({ ...pending, collect: { key: crypto.randomUUID(), offer: round.offer.id } });
    await recover();
  });
  document.querySelectorAll('[data-stake]').forEach(b => b.addEventListener('click', () => { $('#stake').value = (Number(b.dataset.stake) / 100).toFixed(2); }));
  $('#recover-spin').addEventListener('click', recover);
  window.addEventListener('online', () => { if (pending) recover(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (pending?.collect) recover(); else poll(); } });
  async function init() {
    try { pending = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) { message('Enable browser storage to recover flights safely.'); return; }
    await refresh(); if (pending) await recover();
    if (round?.status === 'ACTIVE') showStage();
    setInterval(controls, 100); setTimeout(watchFlight, 400);
    setInterval(() => { if (!pending && !busy && !document.hidden) refresh(); }, 15000);
  }
  init();
})();
