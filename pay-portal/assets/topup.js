(function(){
  // ---------- helpers ----------
  var $ = function(s, r){ return (r||document).querySelector(s); };
  var ce = function(t, p){ var el=document.createElement(t); if(p){ for(var k in p){ try{ el[k]=p[k]; }catch(_){ el.setAttribute(k,p[k]); } } } return el; };
  var show = function(el){ if(el) el.style.display=''; };
  var hide = function(el){ if(el) el.style.display='none'; };
  var money = function(c){ return 'GHS ' + (Number(c||0)/100).toFixed(2); };

  // ---------- API ----------
  async function fetchMe(rawMsisdn){
    var r = await fetch('me.php?msisdn='+encodeURIComponent(rawMsisdn), {cache:'no-store'});
    if(!r.ok) throw new Error('me.php '+r.status);
    var j = await r.json();
    if(!j || !j.ok) throw new Error((j&&j.error)||'bad json');
    return j;
  }
  async function postDeposit(payload){
    var r = await fetch('deposit_request.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var j = await r.json().catch(function(){ return {ok:false,error:'invalid json'}; });
    if(!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
    return j;
  }

  // ---------- renderers ----------
  function renderActive(active){
    var el = $('#active'); if(!el) return;
    if (typeof active === 'string') {
      el.textContent = active;
    } else if(active && (active.plan_code || active.expires_at)){
      var label = active.name || active.plan_code || 'Active';
      el.textContent = label + (active.expires_at? (' • Expires '+active.expires_at):'');
    } else {
      el.textContent = 'No active plan';
    }
  }
  function renderPlans(msisdn, plans){
    var root = $('#plans'); if(!root) return;
    root.innerHTML = '';
    if(!Array.isArray(plans) || plans.length===0){
      root.appendChild(ce('div',{className:'muted', textContent:'No plans found.'}));
      return;
    }
    plans.forEach(function(p){
      var card = ce('div',{className:'plan-card'});
      card.appendChild(ce('div',{className:'plan-title', textContent: p.name || p.code || 'Plan'}));
      card.appendChild(ce('div',{className:'plan-meta',  textContent: (p.duration_days? (p.duration_days+' days • '):'') + money(p.price_cents||0)}));
      var btn = ce('button',{className:'buy-btn', textContent:'Buy ' + (p.name || p.code || '')});
      btn.addEventListener('click', async function(){
        var code = p.code || '';
        var typed = (window.MSISDN_RAW||'').trim();
        if(!typed){ alert('No number found from link.'); return; }
        if(!code){ alert('Invalid plan.'); return; }
        if(!confirm('Confirm purchase of '+(p.name||code)+'?')) return;
        var old=this.textContent; this.disabled=true; this.textContent='Buying...';
        try{
          var resp = await fetch('purchase.php', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ msisdn: typed, plan_code: code })
          });
          var j = await resp.json().catch(function(){ return {ok:false,error:'Invalid JSON'}; });
          if(!resp.ok || !j.ok) alert('Purchase failed: ' + (j.error||resp.statusText));
          else { alert('Purchase successful.'); callRefreshUser(typed); }
        }catch(e){ alert('Network error: '+e.message); }
        finally{ this.disabled=false; this.textContent=old; }
      });
      card.appendChild(btn);
      root.appendChild(card);
    });
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
      left.textContent = (L.type||'') + (L.created_at ? (' • '+L.created_at):'') + (L.ref? (' • '+L.ref):'');
      right.textContent = money(L.amount_cents||0);
      li.appendChild(left); li.appendChild(right);
      root.appendChild(li);
    });
  }
  function renderAll(msisdn, j){
    var who = $('#who') || $('#msisdn_label');
    if (who) who.textContent = (window.MSISDN_RAW||msisdn||'').trim();

    var bal = $('#balance_stat') || (($('#balance') && $('#balance .stat'))||$('.stat'));
    if (bal) bal.textContent = money(j.balance_cents||0);

    renderActive(j.active);
    renderPlans(msisdn, j.plans||[]);
    renderLedger(j.ledger||[]);
  }

  async function callRefreshUser(raw){
    window.MSISDN_RAW = (raw||'').trim();
    try{
      var j = await fetchMe(window.MSISDN_RAW);
      renderAll(window.MSISDN_RAW, j);
    }catch(e){
      console.error(e);
      alert('Failed to load account: '+e.message);
    }
  }
  window.callRefreshUser = callRefreshUser;

  // ---------- Top-Up UI ----------
  function ensureTopupUI(){
    if (document.querySelector('.nister-fab')) return;

    // ensure CSS
    if (!document.querySelector('link[href*="topup.css"]')) {
      var l=document.createElement('link'); l.rel='stylesheet'; l.href='assets/topup.css?v=6'; document.head.appendChild(l);
    }

    var fab = ce('div',{className:'nister-fab'});
    var bTop= ce('button',{className:'fab-topup', textContent:'Top Up Wallet'});
    var bWa = ce('button',{className:'fab-wa',    textContent:'💬 WhatsApp Support'});
    fab.appendChild(bTop); fab.appendChild(bWa); document.body.appendChild(fab);

    bWa.addEventListener('click', function(){
      var wa='https://wa.me/233598544768', alt='whatsapp://send?phone=233598544768';
      try{ window.open(wa,'_blank','noopener'); }catch(_){ window.location.href=alt; }
    });

    var bd = ce('div',{className:'nister-backdrop'}), md=ce('div',{className:'nister-modal'});
    bd.appendChild(md); document.body.appendChild(bd);

    md.innerHTML =
      '<h3 style="margin:0 0 8px">Top Up Wallet</h3>'
      + '<div class="nister-alert nister-ok" id="n_ok"></div>'
      + '<div class="nister-alert nister-err" id="n_err"></div>'
      + '<div class="muted" style="margin:6px 0 10px">Pay MTN MoMo to <b>0598544768</b>. After payment, submit the details below.</div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_msisdn" placeholder="Your number (auto)" autocomplete="tel"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_momo"   placeholder="MoMo number used (MTN only)"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_txid"   placeholder="Transaction ID / Reference"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_amount" placeholder="Amount (GHS) e.g. 20"></div>'
      + '<div class="nister-actions"><button class="nister-btn nister-ghost" id="n_cancel">Close</button><button class="nister-btn nister-primary" id="n_submit">Submit Top-Up</button></div>';

    function openModal(){
      var raw = (window.MSISDN_RAW||'').trim();
      var x = $('#in_msisdn'); if (x) x.value = raw;
      var ok=$('#n_ok'), err=$('#n_err'); if(ok) ok.style.display='none'; if(err){err.style.display='none'; err.textContent='';}
      show(bd);
    }
    function closeModal(){ hide(bd); }

    bTop.addEventListener('click', openModal);
    $('#n_cancel').addEventListener('click', closeModal);

    $('#n_submit').addEventListener('click', async function(){
      var msisdn = ($('#in_msisdn')&&$('#in_msisdn').value||'').trim();
      var momo   = ($('#in_momo')  &&$('#in_momo').value  ||'').trim();
      var txid   = ($('#in_txid')  &&$('#in_txid').value  ||'').trim();
      var amtStr = ($('#in_amount')&&$('#in_amount').value||'').trim();

      var ok=$('#n_ok'), err=$('#n_err');
      if(ok) ok.style.display='none';
      if(err){ err.style.display='none'; err.textContent=''; }

      if(!msisdn || !txid || !amtStr){ if(err){ err.textContent='Please fill MSISDN, TxID and Amount.'; err.style.display='block'; } return; }

      var amount_cents = Math.round(parseFloat(amtStr)*100);
      if(!(amount_cents>0)){ if(err){ err.textContent='Amount must be a number > 0.'; err.style.display='block'; } return; }

      var payload = {
        msisdn: msisdn,
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
        if(ok){ ok.textContent = 'Submitted! Request ID: '+ (res.request_id||'-'); ok.style.display='block'; }
        setTimeout(closeModal, 1000);
      }catch(e){
        if(err){ err.textContent = 'Submit failed: '+e.message; err.style.display='block'; }
      }finally{
        btn.disabled=false; btn.textContent=old;
      }
    });
  }

  // ---------- boot ----------
  window.addEventListener('DOMContentLoaded', function(){
    // auto-load from URL
    var qp = new URLSearchParams(window.location.search);
    var fromUrl = (qp.get('username')||qp.get('msisdn')||qp.get('user')||'').trim();

    var manualRow = $('#manual_row'), inp = $('#msisdn_in'), load = $('#load_btn');

    if (fromUrl){
      if (manualRow) hide(manualRow);
      if (inp) { inp.value = fromUrl; inp.disabled = true; }
      window.MSISDN_RAW = fromUrl;
      callRefreshUser(fromUrl);
    } else {
      if (load) load.addEventListener('click', function(){
        var raw = (inp && inp.value && inp.value.trim()) || '';
        if(!raw) return; window.MSISDN_RAW=raw; callRefreshUser(raw);
      });
      if (inp && inp.value && inp.value.trim()){
        window.MSISDN_RAW = inp.value.trim();
        callRefreshUser(inp.value.trim());
      }
    }

    ensureTopupUI();
  });
})();

// ===== Nister Top-Up Modal Shim (idempotent) =====
(function(){
  if (window.__NISTER_TOPUP_SHIM__) return;
  window.__NISTER_TOPUP_SHIM__ = true;

  var $ = function(s, r){ return (r||document).querySelector(s); };
  var ce = function(t, p){ var el=document.createElement(t); if(p){ for(var k in p){ try{ el[k]=p[k]; }catch(_){ el.setAttribute(k,p[k]); } } } return el; };
  var show = function(el){ if(el) el.style.display=''; };
  var hide = function(el){ if(el) el.style.display='none'; };

  function money(cents){ return 'GHS ' + (Number(cents||0)/100).toFixed(2); }
  function toDec2(v){ var a=parseFloat(String(v).replace(/[^\d.]/g,'')); return isNaN(a)?null:a.toFixed(2); }
  function digitsOnly(v){ return String(v||'').replace(/\D+/g,''); }

  // Ensure floating action button CSS
  (function ensureCss(){
    if (document.getElementById('nister-fab-css')) return;
    var s = ce('style', { id: 'nister-fab-css' });
    s.textContent = ".nister-fab{position:fixed;right:16px;bottom:16px;z-index:9999}"+
                    ".nister-fab button{appearance:none;border:0;border-radius:12px;padding:12px 14px;color:#fff;"+
                    "background:linear-gradient(180deg,#6366f1,#4f46e5);font-weight:700;cursor:pointer;box-shadow:0 10px 18px rgba(79,70,229,.35)}"+
                    ".nister-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:10000}"+
                    ".nister-card{max-width:520px;width:92%;background:#0b1326;color:#e5e7eb;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:16px}";
    document.head.appendChild(s);
  })();

  function ensureFab(){
    var fab = document.querySelector('.nister-fab');
    if (fab) return fab;
    fab = ce('div',{className:'nister-fab'});
    var btn = ce('button',{textContent:'Top Up Wallet'});
    btn.addEventListener('click', openModal);
    fab.appendChild(btn);
    document.body.appendChild(fab);
    return fab;
  }

  function openModal(){
    var overlay = ce('div',{className:'nister-modal'});
    var card = ce('div',{className:'nister-card'});
    var h = ce('h2',{textContent:'Manual Wallet Top-Up'});
    var instr = ce('div',{id:'nister-instructions', innerHTML:'Loading instructions…'});
    var form = ce('div');

    // Instructions from server (contains your fixed details)
    fetch('deposit_instructions.php',{cache:'no-store'}).then(function(r){return r.text();})
      .then(function(html){ instr.innerHTML = html; })
      .catch(function(){ instr.textContent = 'Send via MTN Ghana to Magna Cibus Ltd (0598544768).'; });

    // Fields: Sender phone, Amount, Transaction ID + WhatsApp helper
    form.innerHTML =
      '<div class="row" style="display:grid;gap:10px;margin-top:10px">' +
        '<input id="nd_sender" type="text" placeholder="Sender phone (the MTN number you sent from)" autocomplete="tel">' +
        '<input id="nd_amount" type="text" placeholder="Amount in GHS e.g. 10.00">' +
        '<input id="nd_ref"    type="text" placeholder="Transaction ID / Reference">' +
        '<div style="display:flex;gap:10px;align-items:center;justify-content:space-between">' +
          '<button id="nd_submit">Confirm Payment</button>' +
          '<button id="nd_cancel" class="ghost" type="button" style="background:transparent;border:1px solid rgba(148,163,184,.3);color:#e5e7eb">Cancel</button>' +
          '<a id="nd_whatsapp" target="_blank" rel="noopener" '+
             'style="text-decoration:none;border:1px solid rgba(148,163,184,.3);padding:10px;border-radius:10px;color:#e5e7eb">WhatsApp Support</a>' +
        '</div>' +
      '</div>';

    var foot = ce('div',{className:'muted', style:'margin-top:10px;font-size:12px',
      innerHTML:'Payments are reviewed by Admin. You will receive your wallet credit after approval.'});

    card.appendChild(h);
    card.appendChild(instr);
    card.appendChild(form);
    card.appendChild(foot);
    overlay.appendChild(card);
    overlay.addEventListener('click', function(e){ if(e.target===overlay) document.body.removeChild(overlay); });
    $('#nd_cancel', form)?.addEventListener('click', function(){ document.body.removeChild(overlay); });

    // Setup WhatsApp link (to 0598544768)
    var wa = $('#nd_whatsapp', form);
    var prefilled = encodeURIComponent("Hi, I need assistance with Nister Wifi");
    // Ghana +233, remove leading 0 -> 598544768
    wa.href = 'https://wa.me/233598544768?text='+prefilled;

    // Submit handler
    $('#nd_submit', form).addEventListener('click', async function(ev){
      ev.preventDefault();
      var accountMsisdn = (window.MSISDN_RAW||'').trim() || ($('#msisdn_in')&&$('#msisdn_in').value)||'';
      var sender = digitsOnly($('#nd_sender', form)?.value||'');
      var amountStr = toDec2($('#nd_amount', form)?.value||'');
      var ref = String(($('#nd_ref', form)?.value||'').trim());
      if (!accountMsisdn) { alert('No account number (MSISDN) detected. Load your number first.'); return; }
      if (!amountStr)     { alert('Enter a valid amount like 10.00'); return; }
      if (!ref)           { ref = 'MNL-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6).toUpperCase(); }

      var old = this.textContent; this.disabled = true; this.textContent = 'Submitting…';
      try{
        // EXACT keys Admin/backend expects
        var resp = await fetch('deposit_request.php', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            ref: ref,
            msisdn: digitsOnly(accountMsisdn),
            amount: amountStr,
            method: 'momo',
            payer_name: sender || digitsOnly(accountMsisdn),
            notes: 'Manual Top-up via Self-Service'
          })
        });
        var j = await resp.json().catch(function(){ return {ok:false,error:'invalid json'}; });
        if (!resp.ok || !j.ok) {
          alert('Submit failed: ' + (j.error || ('HTTP '+resp.status)));
        } else {
          alert('Submitted! Ref: '+(j.ref||ref)+'\nStatus: pending review.');
          if (typeof callRefreshUser === 'function') callRefreshUser(accountMsisdn);
          document.body.removeChild(overlay);
        }
      } catch(e){
        alert('Network error: ' + (e && e.message ? e.message : e));
      } finally {
        this.disabled = false; this.textContent = old;
      }
    });

    document.body.appendChild(overlay);
  }

  // Boot once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab);
  } else {
    ensureFab();
  }
})();
