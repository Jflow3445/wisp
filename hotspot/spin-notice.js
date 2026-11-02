(function(){
  'use strict';
  var context=document.getElementById('nister-spin-notice-context');
  if(!context) return;
  var user=context.getAttribute('data-user')||'', logged=context.getAttribute('data-logged-in')||'', logout=context.getAttribute('data-logout')||'';
  if(!user || user.indexOf('$(')!==-1 || (logged!=='yes' && (!logout || logout.indexOf('$(')!==-1))) return;
  var card=null, timer=null;
  function base(){return 'https://pay.nister.org';}
  function hide(){if(card){card.remove();card=null;}}
  function show(feature){
    if(card) return;
    var style=document.getElementById('nister-flight-entry-style');
    if(!style){style=document.createElement('style');style.id='nister-flight-entry-style';
      style.textContent='.nister-flight-entry{margin:18px 0;padding:18px 19px;border:1px solid #315c48;border-radius:15px;background:#153d32;color:#fffaf0;font-family:system-ui,sans-serif}.nister-flight-entry small{display:block;font-size:9px;letter-spacing:.12em;color:#c9d8bd}.nister-flight-entry h2{font:400 25px Georgia,serif;margin:9px 0;color:#fffaf0}.nister-flight-entry p{font-size:12px;line-height:1.7;color:#d0ddc9;margin:0 0 15px}.nister-flight-entry a{display:flex;justify-content:space-between;align-items:center;min-height:43px;background:#eddfb6;color:#244b33;border-radius:8px;padding:10px 14px;text-decoration:none;font-size:12px;font-weight:600}.nister-flight-entry a:focus-visible{outline:3px solid white;outline-offset:3px}.nister-flight-entry .nister-flight-risk{margin:11px 0 0;font-size:9px;color:#aebfa5}';document.head.appendChild(style);}
    card=document.createElement('section');card.className='nister-flight-entry';card.setAttribute('aria-label','Explore Flight');
    var label=document.createElement('small'),title=document.createElement('h2'),copy=document.createElement('p'),link=document.createElement('a'),risk=document.createElement('p');
    label.textContent='IN YOUR NISTER ACCOUNT · 18+';title.textContent='Explore Flight';copy.textContent=feature.can_play?'Choose a stake, follow the flight and decide when to collect. Use your existing Nister account.':'New flights are temporarily paused. Your account and wallet remain available.';
    link.href=base()+'/spin.php';link.target='_blank';link.rel='noopener';link.textContent='Open Flight ↗';risk.className='nister-flight-risk';risk.textContent='Optional paid play. You can lose your stake.';
    [label,title,copy,link,risk].forEach(function(node){card.appendChild(node);});
    var container=document.querySelector('.card')||context.parentNode, logo=container.querySelector('.logo');
    if(logo) logo.insertAdjacentElement('afterend',card);else container.insertBefore(card,container.firstChild);
  }
  function check(){
    if(document.hidden) return;
    var request=new XMLHttpRequest();request.open('GET',base()+'/spin-feature.php',true);request.timeout=5000;
    request.onload=function(){try{var feature=JSON.parse(request.responseText);if(request.status===200 && feature.visible){show(feature);return;}}catch(e){}hide();};
    request.onerror=request.ontimeout=hide;request.send();
  }
  window.addEventListener('nister-config-ready',check);document.addEventListener('visibilitychange',check);
  function resume(){check();if(!timer)timer=setInterval(check,30000);}
  window.addEventListener('pageshow',resume);window.addEventListener('pagehide',function(){clearInterval(timer);timer=null;});resume();
})();
