<?php if ($spinVisible): ?>
<section class="flight-promo" data-spin-discovery aria-labelledby="flight-promo-title">
  <div class="flight-promo-art" aria-hidden="true"><svg viewBox="0 0 200 120" fill="none"><path d="M5 105C55 108 65 30 132 46" stroke="currentColor" stroke-opacity=".4" stroke-width="1.5" stroke-dasharray="4 6"/><path d="m119 44 44-20-20 45-7-20-17-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m136 49 27-25" stroke="currentColor" stroke-width="2"/></svg></div>
  <div class="flight-promo-copy"><p class="flight-promo-label">EXPLORE NISTER <span>18+</span></p><h2 id="flight-promo-title">Your next Flight is here.</h2><p>Choose a stake, follow your flight and decide when to collect. Play from your existing Nister account.</p><small>Optional paid play. You can lose your stake.</small></div>
  <div class="flight-promo-action"><a href="/spin.php">Explore Flight <span aria-hidden="true">↗</span></a><span class="flight-availability"><?=!empty($spinCanPlay)?'Ready when you are':'New flights temporarily paused'?></span></div>
</section>
<?php endif; ?>
