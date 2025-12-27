(function(){
  window.NISTER = window.NISTER || {}; window.NISTER.plansByCode = window.NISTER.plansByCode || {};
  function $(s){ return document.querySelector(s); }
  function formatCents(c){ return 'GHS ' + (Number(c||0)/100).toFixed(2); }
  function getInitialMsisdn(){
    const urlMsisdn = new URLSearchParams(location.search).get('username') || '';
    const inputVal  = ($('#msisdn')?.value || '').trim();
    const stored    = (localStorage.getItem('nister.msisdn') || '').trim();
    return (urlMsisdn || inputVal || stored).trim();
  }

  (function patchRenderPlans(){
    if (typeof window.renderPlans !== 'function') { setTimeout(patchRenderPlans, 200); return; }
    const orig = window.renderPlans;
    window.renderPlans = function(msisdn, plans){
      const map={}; if(Array.isArray(plans)) for(const p of plans) if(p&&p.code) map[p.code]=p;
      window.NISTER.plansByCode = map; return orig(msisdn, plans);
    };
  })();

  document.addEventListener('DOMContentLoaded', function(){
    const root = $('#plans'); if(!root || root.dataset.bound==='1') return;
    root.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.buy-btn'); if(!btn) return;
      const code = btn.dataset.code || ''; if(!code) return;
      const msisdn = ($('#who')?.textContent || '').trim();
      const plan = window.NISTER.plansByCode[code] || {};
      const label = plan.name || code;
      const price = (typeof plan.price_cents==='number') ? formatCents(plan.price_cents) : '';
      if(!msisdn) return alert('Load your phone number first.');
      if(!confirm(`Confirm purchase:\n\nPlan: ${label}\nPrice: ${price}\n\nProceed?`)) return;
      try{
        const r = await fetch('purchase.php',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({msisdn:msisdn,plan_code:code})});
        const j = await r.json().catch(()=>({ok:false,error:'Invalid JSON from server'}));
        if(!r.ok || !j.ok) return alert('Purchase failed: '+(j.error||r.statusText||r.status));
        alert('Purchase successful.'+(j.expires_at?`\nExpires: ${j.expires_at}`:'')+(j.ref?`\nRef: ${j.ref}`:''));
        if(window.refreshUser) window.refreshUser(msisdn);
      }catch(err){ alert('Purchase error: '+err); }
    }, {passive:true});
    root.dataset.bound='1';
  });

  window.refreshUser = async function(u){
    try{
      const r = await fetch('me.php?msisdn='+encodeURIComponent(u));
      if(!r.ok) return; const j = await r.json().catch(()=>({}));
      const who=$('#who'), bal=$('#bal'), active=$('#active');
      if(who) who.textContent = j.msisdn || u;
      if(bal && typeof j.balance_cents==='number') bal.textContent = formatCents(j.balance_cents);
      const arr = Array.isArray(j.plans)?j.plans:[];
      const map={}; for(const p of arr) if(p&&p.code) map[p.code]=p; window.NISTER.plansByCode=map;

      let code=null; if(j.active){ code = (typeof j.active==='string')? j.active : (j.active.groupname||j.active.code||j.active.plan_code||null); }
      if(active){ active.textContent = code ? ((map[code]?.name)||code) : '—'; }

      if(typeof window.renderPlans==='function') window.renderPlans(j.msisdn||u, arr);
      if(Array.isArray(j.ledger) && typeof window._renderLedger==='function') window._renderLedger(j.ledger);
    }catch(_e){}
  };

  document.addEventListener('DOMContentLoaded', function(){
    const init = getInitialMsisdn();
    if(init){
      const input=$('#msisdn'); if(input) input.value=init;
      setTimeout(function(){
        if(window.refreshUser) window.refreshUser(init);
        localStorage.setItem('nister.msisdn', init);
      }, 0);
    }
  });
})();
