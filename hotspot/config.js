(function(){
  var CFG_URL = 'https://pay.nister.org/config_public.php';
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
    window.NISTER_CFG = cfg;
    if (cfg.whatsapp_support) setSupportLink(cfg.whatsapp_support);
    if (cfg.api_base) setApiActions(cfg.api_base);
    if (cfg.pay_base) setPayLinks(cfg.pay_base);
  }
  try{
    fetch(CFG_URL, {cache:'no-store', mode:'cors'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if (j && j.ok) apply(j); });
  }catch(e){}
})();
