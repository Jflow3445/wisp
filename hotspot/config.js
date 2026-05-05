(function(){
  var CFG_URL = 'https://pay.nister.org/config_public.php';
  var DEFAULT_API_BASE = 'https://api.nister.org';
  var DEFAULT_PAY_BASE = 'https://pay.nister.org';
  var TRUSTED_API_HOSTS = ['api.nister.org'];
  var TRUSTED_PAY_HOSTS = ['pay.nister.org'];
  var readySignaled = false;

  function normalizeTrustedBase(raw, allowedHosts){
    var v = String(raw || '').trim();
    if (!v) return '';
    try {
      var u = new URL(v, window.location.href);
      if (u.protocol !== 'https:') return '';
      var h = String(u.hostname || '').toLowerCase();
      if (allowedHosts.indexOf(h) === -1) return '';
      if (/\/checkout\/?$/i.test(u.pathname || '')) u.pathname = '';
      var p = (u.pathname && u.pathname !== '/') ? u.pathname.replace(/\/+$/,'') : '';
      return u.origin + p;
    } catch(e) {
      return '';
    }
  }

  function setSupportLink(wa){
    var links = document.querySelectorAll('a.support-link');
    if (!links || !links.length) return;
    var href = wa ? ('https://wa.me/' + wa.replace(/\D+/g,'')) : '';
    if (!href) return;
    links.forEach(function(a){ a.href = href; });
  }
  function setApiActions(apiBase){
    if (!apiBase) return;
    apiBase = apiBase.replace(/\/+$/,'');
    document.querySelectorAll('form[data-api-path]').forEach(function(f){
      var p = f.getAttribute('data-api-path');
      if (!p) return;
      if (p.charAt(0) !== '/') p = '/' + p;
      f.action = apiBase + p;
    });
  }
  function setPayLinks(payBase){
    if (!payBase) return;
    payBase = payBase.replace(/\/+$/,'');
    document.querySelectorAll('[data-pay-link]').forEach(function(a){
      var p = a.getAttribute('data-pay-link') || '';
      if (p && p.charAt(0) !== '/') p = '/' + p;
      a.href = payBase + p;
    });
  }
  function apply(cfg){
    if (!cfg) return;
    var safeApi = normalizeTrustedBase(cfg.api_base, TRUSTED_API_HOSTS) || DEFAULT_API_BASE;
    var safePay = normalizeTrustedBase(cfg.pay_base, TRUSTED_PAY_HOSTS) || DEFAULT_PAY_BASE;
    window.NISTER_CFG = cfg;
    window.NISTER_CFG.api_base = safeApi;
    window.NISTER_CFG.pay_base = safePay;
    if (cfg.whatsapp_support) setSupportLink(cfg.whatsapp_support);
    setApiActions(safeApi);
    setPayLinks(safePay);
  }
  function signalReady(ok){
    if (readySignaled) return;
    readySignaled = true;
    try {
      window.dispatchEvent(new CustomEvent('nister-config-ready', { detail: { ok: !!ok } }));
    } catch (e) {
      var ev = document.createEvent('Event');
      ev.initEvent('nister-config-ready', true, true);
      window.dispatchEvent(ev);
    }
  }
  try{
    fetch(CFG_URL, {cache:'no-store', mode:'cors'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (j && j.ok) {
          apply(j);
          signalReady(true);
          return;
        }
        signalReady(false);
      })
      .catch(function(){ signalReady(false); });
  }catch(e){ signalReady(false); }
})();
