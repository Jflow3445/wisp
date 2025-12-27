<?php declare(strict_types=1);
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

/**
 * Canonical values (can be overridden via ENV in config.php if desired)
 */
$network = $ENV['TOPUP_NETWORK'] ?? 'MTN Ghana';
$name    = $ENV['TOPUP_NAME']    ?? 'Magna Cibus Ltd';
$number  = $ENV['TOPUP_NUMBER']  ?? '0598544768';
$waText  = $ENV['TOPUP_WA_TEXT'] ?? 'Hi, I need assistance with Nister Wifi';

/**
 * Build WhatsApp deep link:
 *  - Strip non-digits
 *  - Convert Ghana local leading 0 -> +233 format for wa.me
 */
$waDigits = preg_replace('/\D+/', '', $number ?? '');
if ($waDigits !== '' && $waDigits[0] === '0') {
  $waDigits = '233' . substr($waDigits, 1);
}
$waHref = 'https://wa.me/' . $waDigits . '?text=' . rawurlencode($waText);

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<div>
  <p class="muted" style="margin:0 0 6px">Send funds to:</p>
  <ul style="margin:0 0 8px 18px">
    <li><b>Network:</b> <?=h($network)?></li>
    <li><b>Name:</b> <?=h($name)?></li>
    <li><b>Number:</b> <?=h($number)?></li>
  </ul>

  <p style="margin:0 0 10px">
    After payment, enter the <b>sender phone</b>, <b>amount</b>, and the <b>Transaction ID</b> from your MoMo/SMS receipt.
  </p>

  <div style="margin-top:10px">
    <a href="<?=$waHref?>" target="_blank" rel="noopener"
       class="nister-wa-btn"
       style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;padding:10px 14px;border:1px solid rgba(148,163,184,.35);border-radius:12px;">
      <span>💬 WhatsApp Support</span>
      <span style="opacity:.75">(<?=h($number)?>)</span>
    </a>
  </div>
</div>
