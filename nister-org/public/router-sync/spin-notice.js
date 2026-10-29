(function(){
  'use strict';
  var context=document.getElementById('nister-spin-notice-context');
  if(!context) return;
  var user=context.getAttribute('data-user')||'';
  var logged=context.getAttribute('data-logged-in')||'';
  var logout=context.getAttribute('data-logout')||'';
  if(!user || user.indexOf('$(')!==-1 || (logged!=='yes' && (!logout || logout.indexOf('$(')!==-1))) return;
  var key='nister.flight.notice.v3.'+user, shown=false, overlay=null, previousFocus=null, timer=null;
  try{if(localStorage.getItem(key)) return;}catch(e){return;}
  function close(){
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay=null;clearInterval(timer);
    document.removeEventListener('keydown',keys);
    if(previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function keys(e){
    if(e.key==='Escape'){close();return;}
    if(e.key!=='Tab' || !overlay) return;
    var controls=overlay.querySelectorAll('a,button'), first=controls[0], last=controls[controls.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
  function base(){
    var raw=window.NISTER_CFG && window.NISTER_CFG.pay_base;
    return /^https:\/\/pay\.nister\.org\/?$/.test(String(raw||''))?String(raw).replace(/\/$/,''):'https://pay.nister.org';
  }
  function show(){
    if(shown) return;shown=true;
    try{localStorage.setItem(key,String(Date.now()));}catch(e){return;}
    var style=document.createElement('style');
    style.textContent='.nister-spin-notice{position:fixed;inset:0;z-index:10000;background:rgba(23,32,37,.48);display:flex;align-items:center;justify-content:center;padding:20px}.nister-spin-notice section{width:100%;max-width:390px;background:#fffdfa;color:#1c2329;border:1px solid #e2d6c8;border-radius:20px;padding:29px;box-shadow:0 20px 60px #17202530;font-family:system-ui,sans-serif}.nister-spin-notice small{color:#0f766e;font-size:10px;letter-spacing:1.6px;font-weight:700}.nister-spin-notice h2{font-family:Georgia,serif;font-size:34px;font-weight:400;margin:13px 0}.nister-spin-notice p{font-size:14px;color:#5f6a76;line-height:1.7;margin:0 0 22px}.nister-spin-notice a,.nister-spin-notice button{display:block;width:100%;min-height:46px;border-radius:10px;font:600 13px system-ui;text-align:center;padding:13px 15px;box-sizing:border-box;text-decoration:none;cursor:pointer}.nister-spin-notice a{background:#0f766e;color:white;border:1px solid #0f766e}.nister-spin-notice button{margin-top:9px;background:transparent;color:#355249;border:1px solid #d5d9cc}.nister-spin-notice a:focus-visible,.nister-spin-notice button:focus-visible{outline:3px solid #ba8d46;outline-offset:3px}';
    document.head.appendChild(style);
    overlay=document.createElement('div');overlay.className='nister-spin-notice';
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','nister-spin-notice-title');
    var card=document.createElement('section'), eyebrow=document.createElement('small'), title=document.createElement('h2'), copy=document.createElement('p'), link=document.createElement('a'), dismiss=document.createElement('button');
    eyebrow.textContent='YOU\u2019RE ONLINE';title.id='nister-spin-notice-title';title.textContent='Flight';
    copy.textContent='Watch your return rise or fall. Stop & Collect up to 2x your stake, or lose it. Returns go to your regular wallet.';
    link.href=base()+'/spin.php';link.target='_blank';link.rel='noopener';link.textContent='Try Flight';
    dismiss.type='button';dismiss.textContent='Keep browsing';dismiss.addEventListener('click',close);
    card.appendChild(eyebrow);card.appendChild(title);card.appendChild(copy);card.appendChild(link);card.appendChild(dismiss);overlay.appendChild(card);
    previousFocus=document.activeElement;document.body.appendChild(overlay);document.addEventListener('keydown',keys);dismiss.focus();
    timer=setInterval(check,15000);
  }
  function check(){
    var request=new XMLHttpRequest();request.open('GET',base()+'/spin-feature.php',true);request.timeout=4000;
    request.onload=function(){
      try{var feature=JSON.parse(request.responseText);if(request.status===200 && feature.visible && feature.can_play){show();return;}}catch(e){}
      if(overlay) close();
    };
    request.onerror=request.ontimeout=function(){if(overlay) close();};
    request.send();
  }
  window.addEventListener('nister-config-ready',check);
  check();
})();
