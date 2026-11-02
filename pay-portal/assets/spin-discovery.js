(function(){
  'use strict';
  var nodes=document.querySelectorAll('[data-spin-discovery]');if(!nodes.length)return;
  function update(){
    if(document.hidden)return;
    fetch('/spin-feature.php',{cache:'no-store',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error('unavailable');return r.json();}).then(function(feature){
      nodes.forEach(function(node){node.hidden=!feature.visible;});
      document.querySelectorAll('.flight-availability').forEach(function(node){node.textContent=feature.can_play?'Ready when you are':'New flights temporarily paused';});
    }).catch(function(){nodes.forEach(function(node){node.hidden=true;});});
  }
  var timer=null;
  function resume(){update();if(!timer)timer=setInterval(update,15000);}
  document.addEventListener('visibilitychange',update);window.addEventListener('pageshow',resume);window.addEventListener('pagehide',function(){clearInterval(timer);timer=null;});resume();
})();
