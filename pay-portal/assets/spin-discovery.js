'use strict';
(() => {
  const links = document.querySelectorAll('[data-spin-discovery]'); if (!links.length) return;
  async function update() {
    if (document.hidden) return;
    try { const response = await fetch('/spin-feature.php', { cache: 'no-store', credentials: 'same-origin' }); const feature = await response.json(); if (!feature.visible) { links.forEach(link => link.remove()); clearInterval(timer); } }
    catch (_) { links.forEach(link => link.remove()); clearInterval(timer); }
  }
  const timer = setInterval(update, 15000);
  document.addEventListener('visibilitychange', update);
})();
