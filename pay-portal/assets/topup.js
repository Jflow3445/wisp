(function(){
  // ---------- helpers ----------
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var ce = function(t, p){ var el=document.createElement(t); if(p){ for(var k in p){ try{ el[k]=p[k]; }catch(_){ el.setAttribute(k,p[k]); } } } return el; };
  var show = function(el){ if(el) el.style.display=''; };
  var hide = function(el){ if(el) el.style.display='none'; };
  var money = function(c){ return 'GHS ' + (Number(c||0)/100).toFixed(2); };
  var MIN_TOPUP_CENTS = (typeof window !== 'undefined' && window.NISTER_MIN_TOPUP_CENTS !== undefined)
    ? Number(window.NISTER_MIN_TOPUP_CENTS)
    : 3000;
  if (!isFinite(MIN_TOPUP_CENTS) || MIN_TOPUP_CENTS <= 0) MIN_TOPUP_CENTS = 3000;
  var PLAN_CACHE = [];

  function planByCode(code){
    if (!code) return null;
    var lc = String(code).toLowerCase();
    for (var i=0; i<PLAN_CACHE.length; i++){
      var p = PLAN_CACHE[i];
      if (p && String(p.code||'').toLowerCase() === lc) return p;
    }
    return null;
  }
  function fmtBytes(bytes){
    var n = Number(bytes || 0);
    if (!isFinite(n) || n <= 0) return '';
    var gb = n / 1073741824;
    if (gb >= 1) return (Math.abs(gb - Math.round(gb)) < 0.05 ? String(Math.round(gb)) : gb.toFixed(1).replace(/\.0$/, '')) + ' GB';
    var mb = n / 1048576;
    return (Math.abs(mb - Math.round(mb)) < 0.05 ? String(Math.round(mb)) : mb.toFixed(0)) + ' MB';
  }
  function fmtDays(days){
    var n = Number(days || 0);
    if (!isFinite(n) || n <= 0) return 'Flexible';
    return n + ' ' + (n === 1 ? 'day' : 'days');
  }
  function fmtRate(rate){
    var raw = String(rate || '').trim();
    if (!raw) return 'Managed speed';
    return raw.replace('/', ' down / ') + ' up';
  }
  function pricePerGb(cents, bytes){
    var c = Number(cents || 0);
    var b = Number(bytes || 0);
    if (!isFinite(c) || !isFinite(b) || c <= 0 || b <= 0) return '';
    var gb = b / 1073741824;
    if (gb <= 0) return '';
    return 'GHS ' + (c / gb / 100).toFixed(2) + '/GB';
  }

  // ---------- API ----------
  async function fetchMe(){
    var r = await fetch('me.php', {cache:'no-store', credentials:'same-origin'});
    if(!r.ok) throw new Error('me.php '+r.status);
    var j = await r.json();
    if(!j || !j.ok) throw new Error((j&&j.error)||'bad json');
    return j;
  }
  async function postDeposit(payload){
    var r = await fetch('deposit_request.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body: JSON.stringify(payload)
    });
    if (r.status === 401) { window.location.href = '/login.php'; return {ok:false,error:'unauthorized'}; }
    var j = await r.json().catch(function(){ return {ok:false,error:'invalid json'}; });
    if(!r.ok || !j.ok){
      var msg = (j && (j.message || j.error)) || ('HTTP '+r.status);
      var err = new Error(msg);
      err.code = j && j.error;
      err.data = j;
      throw err;
    }
    return j;
  }
  async function fetchTopupConfig(){
    var fallback = {
      ok: true,
      manual_enabled: true,
      paystack_enabled: false,
      currency: 'GHS',
      min_topup_cents: MIN_TOPUP_CENTS
    };
    try{
      var r = await fetch('topup_config.php', {cache:'no-store', credentials:'same-origin'});
      var j = await r.json().catch(function(){ return null; });
      if (!r.ok || !j || !j.ok) return fallback;
      if (Number(j.min_topup_cents) > 0) MIN_TOPUP_CENTS = Number(j.min_topup_cents);
      return j;
    }catch(_){
      return fallback;
    }
  }
  async function postPaystackInitialize(payload){
    var r = await fetch('paystack_initialize.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body: JSON.stringify(payload)
    });
    if (r.status === 401) { window.location.href = '/login.php'; return {ok:false,error:'unauthorized'}; }
    var j = await r.json().catch(function(){ return {ok:false,error:'invalid json'}; });
    if(!r.ok || !j.ok){
      var msg = (j && (j.message || j.error)) || ('HTTP '+r.status);
      var err = new Error(msg);
      err.code = j && j.error;
      err.data = j;
      throw err;
    }
    return j;
  }
  function parseAmountCents(raw){
    var n = Number(String(raw || '').replace(/[^\d.]/g, ''));
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }

  // ---------- renderers ----------
  function renderActive(active){
    var el = $('#active'); if(!el) return;
    if (typeof active === 'string') {
      el.textContent = active;
    } else if(active && (active.plan_code || active.expires_at)){
      var label = active.name || active.plan_code || 'Active';
      el.textContent = label + (active.expires_at? (' | Expires '+active.expires_at):'');
    } else {
      el.textContent = 'No active plan';
    }
  }
  function renderPlans(msisdn, plans){
    var root = $('#plans'); if(!root) return;
    root.innerHTML = '';
    PLAN_CACHE = Array.isArray(plans) ? plans.slice() : [];
    if (!window.NISTER_LOGGED_IN) {
      root.appendChild(ce('div',{className:'muted', textContent:'Login to view and buy plans.'}));
      return;
    }
    if(!Array.isArray(plans) || plans.length===0){
      root.appendChild(ce('div',{className:'muted', textContent:'No plans configured for your location.'}));
      return;
    }
    var bestCode = '';
    var bestValue = Infinity;
    plans.forEach(function(p){
      var quotaGb = Number(p && p.quota_bytes || 0) / 1073741824;
      var perGb = Number(p && p.price_cents || 0) / quotaGb;
      if (isFinite(perGb) && quotaGb > 0 && perGb > 0 && perGb < bestValue) {
        bestValue = perGb;
        bestCode = String(p.code || '');
      }
    });
    plans.forEach(function(p){
      var code = p.code || '';
      var name = p.name || p.display_name || p.code || 'Plan';
      var allowance = fmtBytes(p.quota_bytes) || name;
      var duration = fmtDays(p.duration_days);
      var speed = fmtRate(p.rate_limit);
      var value = pricePerGb(p.price_cents, p.quota_bytes);
      var featured = code && code === bestCode && plans.length > 1;
      var card = ce('article',{className:'plan-card premium-plan' + (featured ? ' featured' : '')});
      var head = ce('div',{className:'plan-top'});
      head.appendChild(ce('span',{className:'plan-badge', textContent: featured ? 'Best value' : duration}));
      if (code) head.appendChild(ce('span',{className:'plan-code', textContent: code.replace(/^PLAN_/,'')}));
      var body = ce('div',{className:'plan-body'});
      body.appendChild(ce('div',{className:'plan-title', textContent:name}));
      body.appendChild(ce('div',{className:'plan-allowance', textContent:allowance}));
      body.appendChild(ce('div',{className:'plan-price', textContent:money(p.price_cents || 0)}));
      var details = ce('div',{className:'plan-details'});
      details.appendChild(ce('div',{className:'plan-detail', textContent:duration}));
      details.appendChild(ce('div',{className:'plan-detail', textContent:speed}));
      if (value) details.appendChild(ce('div',{className:'plan-detail', textContent:value}));
      body.appendChild(details);
      var foot = ce('div',{className:'plan-foot'});
      var btn = ce('button',{className:'buy-btn', textContent:'Activate plan'});
      if (code) btn.dataset.code = code;
      btn.addEventListener('click', async function(){
        if (!window.NISTER_LOGGED_IN) { window.location.href = '/login.php'; return; }
        if(!code){ alert('Invalid plan.'); return; }
        if(!confirm('Confirm purchase of '+(p.name||code)+'?')) return;
        var autoRenewChoice = confirm('Auto-renew this data when near expiry or exhaustion?');
        var old=this.textContent; this.disabled=true; this.textContent='Buying...';
        try{
          var resp = await fetch('purchase.php', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            credentials:'same-origin',
            body: JSON.stringify({ plan_code: code })
          });
          if (resp.status === 401) { window.location.href = '/login.php'; return; }
          var j = await resp.json().catch(function(){ return {ok:false,error:'Invalid JSON'}; });
          if(!resp.ok || !j.ok){
            var msg = (j && (j.message || j.error)) || resp.statusText || 'Error';
            alert('Purchase failed: ' + msg);
          }
          else {
            try{
              await setAutoRenewPreference(!!autoRenewChoice, code);
            }catch(e){
              alert('Purchase ok, but auto-renew update failed: ' + e.message);
            }
            alert('Purchase successful.');
            callRefreshUser();
          }
        }catch(e){ alert('Network error: '+e.message); }
        finally{ this.disabled=false; this.textContent=old; }
      });
      foot.appendChild(btn);
      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(foot);
      root.appendChild(card);
    });
  }
  function renderReferral(ref){
    var code = $('#ref_code');
    if (!code) return;
    if (!window.NISTER_LOGGED_IN) {
      code.textContent = 'Login to view';
      var stats = $('#ref_stats'); if (stats) hide(stats);
      var actions = $('#ref_actions'); if (actions) hide(actions);
      return;
    }
    var invite = (ref && ref.invite_code) ? ref.invite_code : '';
    code.textContent = invite || 'N/A';
    var p = $('#ref_pending'); if (p) p.textContent = money(ref && ref.pending_cents || 0);
    var m = $('#ref_released_month'); if (m) m.textContent = money(ref && ref.released_cents_month || 0);
    var l = $('#ref_released_lifetime'); if (l) l.textContent = money(ref && ref.released_cents_lifetime || 0);
    var stats = $('#ref_stats'); if (stats) show(stats);
    var actions = $('#ref_actions'); if (actions) show(actions);
  }

  var autoRenewBound = false;
  function bindAutoRenew(){
    if (autoRenewBound) return;
    autoRenewBound = true;
    var save = $('#auto_renew_save');
    if (save) save.addEventListener('click', saveAutoRenew);
    var sel = $('#auto_renew_plan');
    if (sel) sel.addEventListener('change', function(){
      if (window.__NISTER_ME__) updateAutoRenewInfoFromUI(window.__NISTER_ME__);
    });
    var toggle = $('#auto_renew_enabled');
    if (toggle) toggle.addEventListener('change', function(){
      if (window.__NISTER_ME__) updateAutoRenewInfoFromUI(window.__NISTER_ME__);
    });
  }

  async function setAutoRenewPreference(enabled, planCode){
    if (!window.NISTER_LOGGED_IN) { window.location.href = '/login.php'; return null; }
    var r = await fetch('auto_renew.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body: JSON.stringify({ enabled: enabled ? 1 : 0, plan_code: planCode || '' })
    });
    if (r.status === 401) { window.location.href = '/login.php'; return null; }
    var j = await r.json().catch(function(){ return {ok:false,error:'invalid json'}; });
    if (!r.ok || !j.ok) throw new Error((j && (j.message || j.error)) || ('HTTP '+r.status));
    return j;
  }

  async function saveAutoRenew(){
    if (!window.NISTER_LOGGED_IN) { window.location.href = '/login.php'; return; }
    var enabledEl = $('#auto_renew_enabled');
    var planSel = $('#auto_renew_plan');
    var enabled = !!(enabledEl && enabledEl.checked);
    var planCode = planSel ? (planSel.value || '') : '';
    if (enabled && !planCode) { alert('Select a plan to auto-renew.'); return; }

    var btn = $('#auto_renew_save');
    var old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try{
      var info = $('#auto_renew_info');
      if (info) info.textContent = 'Saving auto-renew...';
      await setAutoRenewPreference(enabled, planCode);
      if (info) info.textContent = 'Auto-renew saved.';
      callRefreshUser();
    }catch(e){
      alert('Auto-renew update failed: ' + e.message);
    }finally{
      if (btn) { btn.disabled = false; btn.textContent = old || 'Save'; }
    }
  }

  function renderAutoRenew(j){
    var card = $('#auto_renew_card'); if (!card) return;
    var controls = $('#auto_renew_controls');
    var enabledEl = $('#auto_renew_enabled');
    var planSel = $('#auto_renew_plan');
    var badge = $('#auto_renew_badge');
    var info = $('#auto_renew_info');
    if (!window.NISTER_LOGGED_IN) {
      if (controls) hide(controls);
      if (info) info.textContent = 'Login to enable auto-renew.';
      if (badge) { badge.textContent = 'Off'; badge.className = 'pill soft'; }
      return;
    }
    if (controls) show(controls);

    var ar = j.auto_renew || {};
    var enabled = !!ar.enabled;
    if (enabledEl) enabledEl.checked = enabled;
    if (badge) { badge.textContent = enabled ? 'On' : 'Off'; badge.className = enabled ? 'pill' : 'pill soft'; }

    if (planSel) {
      var current = planSel.value;
      planSel.innerHTML = '';
      if (PLAN_CACHE.length === 0 && Array.isArray(j.plans)) PLAN_CACHE = j.plans.slice();
      if (PLAN_CACHE.length === 0) {
        planSel.appendChild(ce('option',{value:'', textContent:'No plans available'}));
      } else {
        PLAN_CACHE.forEach(function(p){
          var label = (p.name || p.code || 'Plan') + ' - ' + money(p.price_cents || 0);
          planSel.appendChild(ce('option',{value: p.code || '', textContent: label}));
        });
      }
      var desired = ar.plan_code || (j.active && j.active.plan_code) || current || '';
      if (desired) planSel.value = desired;
    }

    updateAutoRenewInfoFromUI(j);
  }

  function updateAutoRenewInfoFromUI(j){
    var enabledEl = $('#auto_renew_enabled');
    var planSel = $('#auto_renew_plan');
    var badge = $('#auto_renew_badge');
    var info = $('#auto_renew_info');
    if (!window.NISTER_LOGGED_IN) return;
    var enabled = !!(enabledEl && enabledEl.checked);
    if (badge) { badge.textContent = enabled ? 'On' : 'Off'; badge.className = enabled ? 'pill' : 'pill soft'; }
    var selected = planSel ? planByCode(planSel.value) : null;
    var price = selected ? (selected.price_cents || 0) : 0;
    var bal = (j && j.balance_cents) ? j.balance_cents : 0;
    var canAfford = price > 0 && bal >= price;
    if (info) {
      if (!enabled) info.textContent = 'Auto-renew is off.';
      else if (!selected) info.textContent = 'Choose a plan to auto-renew.';
      else if (canAfford) info.textContent = 'Wallet can cover ' + (selected.name || selected.code || 'this plan') + '.';
      else info.textContent = 'Top up to cover ' + (selected.name || selected.code || 'this plan') + ' (' + money(price) + ').';
    }
  }
  function renderLedger(ledger){
    var root = $('#recent'); if(!root) return;
    root.innerHTML = '';
    if(!Array.isArray(ledger) || ledger.length===0){
      root.appendChild(ce('li',{className:'muted', textContent:'No recent transactions.'}));
      return;
    }
    ledger.slice(0,5).forEach(function(L){
      var li = ce('li');
      var left = ce('div');
      var right= ce('div', {className:'amt'});
      left.textContent = (L.type||'') + (L.created_at ? (' | '+L.created_at):'') + (L.ref? (' | '+L.ref):'');
      right.textContent = money(L.amount_cents||0);
      li.appendChild(left); li.appendChild(right);
      root.appendChild(li);
    });
  }
  window.renderPlans = renderPlans;
  window._renderLedger = renderLedger;
  function renderAll(msisdn, j){
    window.__NISTER_ME__ = j || null;
    var who = $('#who') || $('#msisdn_label');
    if (who) who.textContent = (window.NISTER_MSISDN||msisdn||'').trim();

    var bal = $('#balance_stat') || (($('#balance') && $('#balance .stat'))||$('.stat'));
    if (bal) bal.textContent = money(j.balance_cents||0);

    renderActive(j.active);
    renderPlans(msisdn, j.plans||[]);
    renderLedger(j.ledger||[]);
    renderReferral(j.referral||{});
    renderAutoRenew(j);
  }

  async function callRefreshUser(){
    if (!window.NISTER_LOGGED_IN) return;
    try{
      var j = await fetchMe();
      renderAll(window.NISTER_MSISDN||'', j);
    }catch(e){
      console.error(e);
      if (String(e.message||'').indexOf('401') !== -1) {
        window.location.href = '/login.php';
        return;
      }
      alert('Failed to load account: '+e.message);
    }
  }
  window.callRefreshUser = callRefreshUser;

  // ---------- Top-Up UI ----------
  function ensureTopupUI(){
    window.__NISTER_TOPUP_UI__ = true;
    if (document.querySelector('.nister-fab')) return;

    // ensure CSS
    if (!document.querySelector('link[href*="topup.css"]')) {
      var l=document.createElement('link'); l.rel='stylesheet'; l.href='assets/topup.css?v=10'; document.head.appendChild(l);
    }

    var fab = ce('div',{className:'nister-fab'});
    var bTop= ce('button',{className:'fab-topup', textContent:'Top up wallet'});
    var bWa = ce('button',{className:'fab-wa',    textContent:'WhatsApp support'});
    fab.appendChild(bTop); fab.appendChild(bWa); document.body.appendChild(fab);

    var waLink = document.getElementById('wa_link');
    var wa = (waLink && waLink.getAttribute('href')) ? waLink.getAttribute('href') : 'https://wa.me/233598544768';
    var digitsMatch = /wa\.me\/(\d+)/.exec(wa);
    var alt = 'whatsapp://send?phone=' + (digitsMatch ? digitsMatch[1] : '233598544768');
    if (waLink) waLink.href = wa;
    bWa.addEventListener('click', function(){
      try{ window.open(wa,'_blank','noopener'); }catch(_){ window.location.href=alt; }
    });

    var bd = ce('div',{className:'nister-backdrop'}), md=ce('div',{className:'nister-modal'});
    bd.style.display='none';
    bd.appendChild(md); document.body.appendChild(bd);

    var minExample = (MIN_TOPUP_CENTS / 100).toFixed(2).replace(/\.00$/, '');
    md.innerHTML =
      '<h3 style="margin:0 0 8px">Top up wallet</h3>'
      + '<div class="nister-alert nister-ok" id="n_ok"></div>'
      + '<div class="nister-alert nister-err" id="n_err"></div>'
      + '<div class="nister-modebar" id="n_modes">'
      + '<button type="button" id="n_mode_paystack" data-mode="paystack">Paystack</button>'
      + '<button type="button" id="n_mode_manual" data-mode="manual">Manual MoMo</button>'
      + '</div>'
      + '<div id="n_disabled" class="nister-empty">Top-up is currently unavailable.</div>'
      + '<section id="n_paystack" class="nister-pane">'
      + '<div class="nister-pay-head"><div><strong>Automated payment</strong><span>Card, mobile money, or bank transfer through Paystack.</span></div><span class="nister-secure">Verified</span></div>'
      + '<div class="nister-row" style="margin:12px 0"><input class="nister-input" id="ps_amount" inputmode="decimal" placeholder="Amount (GHS) e.g. ' + minExample + '"></div>'
      + '<div class="muted nister-min">Minimum top up: <span id="n_min_ps">' + money(MIN_TOPUP_CENTS) + '</span></div>'
      + '<button class="nister-btn nister-primary nister-wide" id="ps_submit" type="button">Pay with Paystack</button>'
      + '</section>'
      + '<section id="n_manual" class="nister-pane">'
      + '<div id="n_instr" class="muted" style="margin:6px 0 10px">Loading instructions...</div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_msisdn" placeholder="Your number (auto)" autocomplete="tel"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_momo" placeholder="MoMo number used (MTN only)"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_txid" placeholder="Transaction ID / Reference"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_amount" inputmode="decimal" placeholder="Amount (GHS) e.g. ' + minExample + '"></div>'
      + '<div class="muted nister-min">Minimum top up: <span id="n_min_manual">' + money(MIN_TOPUP_CENTS) + '</span></div>'
      + '<button class="nister-btn nister-primary nister-wide" id="n_submit" type="button">Submit manual top-up</button>'
      + '</section>'
      + '<div class="nister-actions"><button class="nister-btn nister-ghost" id="n_cancel" type="button">Close</button></div>';

    var instrLoaded = false;
    function loadManualInstructions(){
      var instr = $('#n_instr');
      if (!instr || instrLoaded) return;
      instrLoaded = true;
      fetch('deposit_instructions.php', {cache:'no-store'})
        .then(function(r){
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function(html){
          if (/^\s*\{/.test(String(html||''))) throw new Error('unexpected_json');
          instr.innerHTML = html;
        })
        .catch(function(){ instr.textContent = 'Send MTN MoMo to 0598544768. After payment, submit the details below.'; });
    }
    function updateMinimumLabels(){
      var minPs = $('#n_min_ps'), minManual = $('#n_min_manual');
      if (minPs) minPs.textContent = money(MIN_TOPUP_CENTS);
      if (minManual) minManual.textContent = money(MIN_TOPUP_CENTS);
    }
    function setTopupMode(mode){
      var ps = $('#n_paystack'), manual = $('#n_manual');
      var bPs = $('#n_mode_paystack'), bManual = $('#n_mode_manual');
      var isPs = mode === 'paystack';
      if (ps) ps.style.display = isPs ? '' : 'none';
      if (manual) manual.style.display = isPs ? 'none' : '';
      if (bPs) bPs.classList.toggle('active', isPs);
      if (bManual) bManual.classList.toggle('active', !isPs);
      if (!isPs) loadManualInstructions();
    }
    function configureTopupModes(cfg){
      cfg = cfg || {};
      var manualEnabled = cfg.manual_enabled !== false && cfg.manual_enabled !== 0 && cfg.manual_enabled !== '0';
      var paystackEnabled = cfg.paystack_enabled === true || cfg.paystack_enabled === 1 || cfg.paystack_enabled === '1';
      var modes = $('#n_modes'), disabled = $('#n_disabled');
      var ps = $('#n_paystack'), manual = $('#n_manual');
      var bPs = $('#n_mode_paystack'), bManual = $('#n_mode_manual');
      updateMinimumLabels();
      if (bPs) bPs.style.display = paystackEnabled ? '' : 'none';
      if (bManual) bManual.style.display = manualEnabled ? '' : 'none';
      if (modes) modes.style.display = (paystackEnabled && manualEnabled) ? 'grid' : 'none';
      if (disabled) disabled.style.display = (!paystackEnabled && !manualEnabled) ? '' : 'none';
      if (!paystackEnabled && ps) ps.style.display = 'none';
      if (!manualEnabled && manual) manual.style.display = 'none';
      if (paystackEnabled) setTopupMode('paystack');
      else if (manualEnabled) setTopupMode('manual');
    }

    function openModal(){
      if (!window.NISTER_LOGGED_IN) { window.location.href = '/login.php'; return; }
      var raw = (window.NISTER_MSISDN||'').trim();
      var x = $('#in_msisdn'); if (x) { x.value = raw; x.readOnly = true; }
      var ok=$('#n_ok'), err=$('#n_err'); if(ok) ok.style.display='none'; if(err){err.style.display='none'; err.textContent='';}
      show(bd);
      fetchTopupConfig().then(configureTopupModes);
    }
    function closeModal(){ hide(bd); }

    bTop.addEventListener('click', openModal);
    var topupNow = document.getElementById('topup_now');
    if (topupNow) topupNow.addEventListener('click', openModal);
    $('#n_cancel').addEventListener('click', closeModal);
    $('#n_mode_paystack').addEventListener('click', function(){ setTopupMode('paystack'); });
    $('#n_mode_manual').addEventListener('click', function(){ setTopupMode('manual'); });

    $('#n_submit').addEventListener('click', async function(){
      var msisdn = ($('#in_msisdn')&&$('#in_msisdn').value||'').trim();
      var momo   = ($('#in_momo')  &&$('#in_momo').value  ||'').trim();
      var txid   = ($('#in_txid')  &&$('#in_txid').value  ||'').trim();
      var amtStr = ($('#in_amount')&&$('#in_amount').value||'').trim();

      var ok=$('#n_ok'), err=$('#n_err');
      if(ok) ok.style.display='none';
      if(err){ err.style.display='none'; err.textContent=''; }

      if(!msisdn || !txid || !amtStr){ if(err){ err.textContent='Please fill TxID and Amount.'; err.style.display='block'; } return; }

      var amount_cents = parseAmountCents(amtStr);
      if(!(amount_cents>0)){ if(err){ err.textContent='Amount must be a number > 0.'; err.style.display='block'; } return; }
      if(amount_cents < MIN_TOPUP_CENTS){ if(err){ err.textContent='Minimum top up is ' + money(MIN_TOPUP_CENTS) + '.'; err.style.display='block'; } return; }

      var payload = {
        payer_name: momo || msisdn,
        txref: txid,
        amount_cents: amount_cents,
        network: 'MTN',
        method: 'momo',
        notes: 'Front page top-up request'
      };

      var btn=this, old=btn.textContent; btn.disabled=true; btn.textContent='Submitting...';
      try{
        var res = await postDeposit(payload);
        if(ok){ ok.textContent = 'Submitted. Request ID: '+ (res.request_id||res.ref||'-'); ok.style.display='block'; }
        setTimeout(closeModal, 1000);
      }catch(e){
        var msg = e.message || 'Submit failed.';
        if (e.code === 'min_amount' && e.data && e.data.min_ghs) {
          msg = 'Minimum top up is GHS ' + Number(e.data.min_ghs).toFixed(2) + '.';
        } else if (e.code === 'manual_topup_disabled') {
          msg = 'Manual top-up is currently unavailable.';
        } else if (e.code === 'db_config_missing' || e.code === 'db_connect_failed' || e.code === 'db_error') {
          msg = 'Payment service is temporarily unavailable. Please try again shortly.';
        }
        if(err){ err.textContent = 'Submit failed: '+msg; err.style.display='block'; }
      }finally{
        btn.disabled=false; btn.textContent=old;
      }
    });

    $('#ps_submit').addEventListener('click', async function(){
      var amtStr = ($('#ps_amount')&&$('#ps_amount').value||'').trim();
      var ok=$('#n_ok'), err=$('#n_err');
      if(ok) ok.style.display='none';
      if(err){ err.style.display='none'; err.textContent=''; }

      var amount_cents = parseAmountCents(amtStr);
      if(!(amount_cents>0)){ if(err){ err.textContent='Amount must be a number > 0.'; err.style.display='block'; } return; }
      if(amount_cents < MIN_TOPUP_CENTS){ if(err){ err.textContent='Minimum top up is ' + money(MIN_TOPUP_CENTS) + '.'; err.style.display='block'; } return; }

      var btn=this, old=btn.textContent; btn.disabled=true; btn.textContent='Opening Paystack...';
      try{
        var res = await postPaystackInitialize({amount_cents: amount_cents});
        if (!res.authorization_url) throw new Error('authorization_url_missing');
        window.location.href = res.authorization_url;
      }catch(e){
        var msg = e.message || 'Paystack checkout failed.';
        if (e.code === 'paystack_disabled') msg = 'Paystack payment is currently unavailable.';
        else if (e.code === 'paystack_not_configured') msg = 'Paystack payment is not configured yet.';
        else if (e.code === 'min_amount' && e.data && e.data.min_ghs) msg = 'Minimum top up is GHS ' + Number(e.data.min_ghs).toFixed(2) + '.';
        if(err){ err.textContent = msg; err.style.display='block'; }
      }finally{
        btn.disabled=false; btn.textContent=old;
      }
    });
    configureTopupModes({manual_enabled:true, paystack_enabled:false});
  }

  function bindPortalMenu(){
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-menu-link]'));
    if (!links.length) return;
    var panels = Array.prototype.slice.call(document.querySelectorAll('.portal-panel'));
    var defaultId = 'account_section';
    var byId = {};
    links.forEach(function(link){
      var id = String(link.getAttribute('href') || '').replace(/^#/, '');
      if (id) byId[id] = true;
      link.addEventListener('click', function(ev){
        ev.preventDefault();
        showPortalPanel(id || defaultId, true);
      });
    });
    function showPortalPanel(id, writeHash){
      if (!byId[id] || !document.getElementById(id)) id = defaultId;
      panels.forEach(function(panel){
        var active = panel.id === id;
        panel.toggleAttribute('hidden', !active);
        panel.classList.toggle('is-active', active);
      });
      links.forEach(function(link){
        link.classList.toggle('active', String(link.getAttribute('href') || '') === '#' + id);
      });
      if (writeHash && history && history.pushState) history.pushState(null, '', '#' + id);
    }
    window.addEventListener('hashchange', function(){
      showPortalPanel(String(window.location.hash || '').replace(/^#/, '') || defaultId, false);
    });
    showPortalPanel(String(window.location.hash || '').replace(/^#/, '') || defaultId, false);
  }

  // ---------- boot ----------
  window.addEventListener('DOMContentLoaded', function(){
    // auto-load from URL
    var qp = new URLSearchParams(window.location.search);
    var manualRow = $('#manual_row'), inp = $('#msisdn_in'), load = $('#load_btn');
    if (manualRow && window.NISTER_LOGGED_IN) hide(manualRow);
    if (load) load.addEventListener('click', function(){ window.location.href = '/login.php'; });
    if (window.NISTER_LOGGED_IN) callRefreshUser();

    ensureTopupUI();
    bindAutoRenew();
    bindPortalMenu();

    var copyBtn = $('#ref_copy_btn');
    if (copyBtn) copyBtn.addEventListener('click', function(){
      var code = ($('#ref_code') && $('#ref_code').textContent || '').trim();
      if (!code || code === 'N/A' || code === 'Login to view') return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function(){
          alert('Referral code copied.');
        }).catch(function(){ alert('Copy failed.'); });
      } else {
        alert('Referral code: ' + code);
      }
    });
  });
})();
