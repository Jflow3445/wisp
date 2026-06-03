<?php
declare(strict_types=1);

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
ini_set('display_errors', '0');

require_once __DIR__.'/lib/paystack.php';

$reference = trim((string)($_GET['reference'] ?? $_GET['trxref'] ?? ''));
$state = 'error';
$title = 'Payment not confirmed';
$message = 'We could not confirm this Paystack payment. Please return to your wallet and try again.';
$amount = '';
$detail = '';

if ($reference !== '') {
  try {
    $result = paystack_verify_and_credit($reference);
    $gatewayStatus = strtolower((string)($result['gateway_status'] ?? ''));
    if (!empty($result['credited'])) {
      $state = 'success';
      $title = 'Top-up complete';
      $message = !empty($result['credited_now'])
        ? 'Your wallet has been credited.'
        : 'This payment was already credited earlier.';
      $amount = isset($result['amount_cents']) ? number_format(((int)$result['amount_cents']) / 100, 2) : '';
      $detail = 'Reference: ' . (string)($result['reference'] ?? $reference);
    } elseif (in_array($gatewayStatus, ['pending','ongoing','processing','abandoned'], true)) {
      $state = 'pending';
      $title = 'Payment still pending';
      $message = 'Paystack has not marked this transaction successful yet. You can refresh this page or return to the portal.';
      $detail = 'Reference: ' . (string)($result['reference'] ?? $reference);
    } else {
      $detail = 'Reference: ' . (string)($result['reference'] ?? $reference);
      if (!empty($result['message'])) $message = (string)$result['message'];
    }
  } catch (Throwable $e) {
    error_log('[paystack_callback] ref=' . $reference . ' err=' . $e->getMessage());
    $detail = 'Reference: ' . $reference;
  }
} else {
  $message = 'Paystack did not return a transaction reference.';
}

$e = static fn($v): string => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nister WiFi | Paystack</title>
  <link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Sora:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f4f1ea;--card:#fffdfa;--ink:#1c2329;--muted:#5f6a76;--line:#e2d6c8;--teal:#0f766e;--gold:#b45309;--red:#991b1b}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:"Sora",sans-serif;color:var(--ink);background:linear-gradient(180deg,var(--bg),#efe8de)}
    body::before{content:"";position:fixed;inset:0;background:radial-gradient(900px 420px at 10% 0%,rgba(15,118,110,.18),transparent 60%),radial-gradient(760px 420px at 95% 8%,rgba(180,83,9,.16),transparent 60%);z-index:-1}
    .panel{width:min(560px,100%);background:linear-gradient(180deg,#fffdf8,#fff8ee);border:1px solid rgba(226,214,200,.92);border-radius:22px;padding:28px;box-shadow:0 30px 90px rgba(27,35,42,.18)}
    .mark{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;margin-bottom:18px;background:linear-gradient(135deg,var(--teal),var(--gold));box-shadow:0 16px 32px rgba(15,118,110,.2)}
    .mark span{width:24px;height:24px;border-radius:999px;background:#fffdfa;display:block}
    h1{font-family:"Fraunces",serif;font-size:clamp(2rem,5vw,3rem);line-height:1;margin:0 0 10px}
    p{margin:0 0 14px;color:var(--muted);line-height:1.6}
    .amount{font-size:1.4rem;font-weight:800;margin:14px 0;color:var(--teal)}
    .detail{font-size:.9rem;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:14px 0 18px;word-break:break-word}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:12px 16px;text-decoration:none;font-weight:800;border:1px solid var(--line);color:var(--ink);background:#fff}
    .btn.primary{border-color:transparent;color:#fff;background:linear-gradient(135deg,var(--teal),#13a091)}
    .success h1{color:var(--teal)}
    .pending h1{color:var(--gold)}
    .error h1{color:var(--red)}
  </style>
</head>
<body>
  <main class="panel <?=$e($state)?>">
    <div class="mark"><span></span></div>
    <h1><?=$e($title)?></h1>
    <p><?=$e($message)?></p>
    <?php if ($amount !== ''): ?><div class="amount">GHS <?=$e($amount)?></div><?php endif; ?>
    <?php if ($detail !== ''): ?><div class="detail"><?=$e($detail)?></div><?php endif; ?>
    <div class="actions">
      <a class="btn primary" href="/portal.php">Back to wallet</a>
      <?php if ($reference !== ''): ?><a class="btn" href="/paystack_callback.php?reference=<?=$e(rawurlencode($reference))?>">Refresh status</a><?php endif; ?>
    </div>
  </main>
</body>
</html>
