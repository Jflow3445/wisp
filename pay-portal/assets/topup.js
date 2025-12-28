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
      el.textContent = label + (active.expires_at? (' | Expires '+active.expires_at):'');
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
      card.appendChild(ce('div',{className:'plan-meta',  textContent: (p.duration_days? (p.duration_days+' days | '):'') + money(p.price_cents||0)}));
      var code = p.code || '';
      var btn = ce('button',{className:'buy-btn', textContent:'Buy ' + (p.name || p.code || '')});
      if (code) btn.dataset.code = code;
      btn.addEventListener('click', async function(){
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
      left.textContent = (L.type||'') + (L.created_at ? (' | '+L.created_at):'') + (L.ref? (' | '+L.ref):'');
      right.textContent = money(L.amount_cents||0);
      li.appendChild(left); li.appendChild(right);
      root.appendChild(li);
    });
  }
  window.renderPlans = renderPlans;
  window._renderLedger = renderLedger;
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
    window.__NISTER_TOPUP_UI__ = true;
    if (document.querySelector('.nister-fab')) return;

    // ensure CSS
    if (!document.querySelector('link[href*="topup.css"]')) {
      var l=document.createElement('link'); l.rel='stylesheet'; l.href='assets/topup.css?v=7'; document.head.appendChild(l);
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

    md.innerHTML =
      '<h3 style="margin:0 0 8px">Top up wallet</h3>'
      + '<div class="nister-alert nister-ok" id="n_ok"></div>'
      + '<div class="nister-alert nister-err" id="n_err"></div>'
      + '<div id="n_instr" class="muted" style="margin:6px 0 10px">Loading instructions...</div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_msisdn" placeholder="Your number (auto)" autocomplete="tel"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_momo"   placeholder="MoMo number used (MTN only)"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_txid"   placeholder="Transaction ID / Reference"></div>'
      + '<div class="nister-row" style="margin:10px 0"><input class="nister-input" id="in_amount" placeholder="Amount (GHS) e.g. 20"></div>'
      + '<div class="nister-actions"><button class="nister-btn nister-ghost" id="n_cancel">Close</button><button class="nister-btn nister-primary" id="n_submit">Submit Top-Up</button></div>';

    var instr = $('#n_instr');
    if (instr) {
      fetch('deposit_instructions.php', {cache:'no-store'}).then(function(r){ return r.text(); })
        .then(function(html){ instr.innerHTML = html; })
        .catch(function(){ instr.textContent = 'Send MTN MoMo to 0598544768. After payment, submit the details below.'; });
    }

    function openModal(){
      var raw = (window.MSISDN_RAW||'').trim();
      var x = $('#in_msisdn'); if (x) x.value = raw;
      var ok=$('#n_ok'), err=$('#n_err'); if(ok) ok.style.display='none'; if(err){err.style.display='none'; err.textContent='';}
      show(bd);
    }
    function closeModal(){ hide(bd); }

    bTop.addEventListener('click', openModal);
    var topupNow = document.getElementById('topup_now');
    if (topupNow) topupNow.addEventListener('click', openModal);
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
        if(ok){ ok.textContent = 'Submitted. Request ID: '+ (res.request_id||res.ref||'-'); ok.style.display='block'; }
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
