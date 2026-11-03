<?php if ($spinVisible): ?>
<section class="flight-promo" data-spin-discovery aria-labelledby="flight-promo-title">
  <div class="flight-promo-copy"><p class="flight-promo-label">18+</p><h2 id="flight-promo-title">Flight</h2><small>Optional paid play. You can lose your stake.</small></div>
  <div class="flight-promo-action"><a href="/spin.php">Explore Flight <span aria-hidden="true">↗</span></a><span class="flight-availability"><?=!empty($spinCanPlay)?'Ready when you are':'New flights temporarily paused'?></span></div>
</section>
<?php endif; ?>
