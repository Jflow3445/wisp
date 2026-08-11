<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';

$ENV = owner_boot();
owner_noindex_headers();

function owner_logout_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
  owner_require_same_origin_post();
  owner_require_csrf_post();
  owner_logout();
  header('Location: /owner/login.php?msg=logged_out');
  exit;
}

$owner = owner_current();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Logout</title>
  <link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/owner.css?v=20260811-owner1">
</head>
<body class="owner-page">
  <main class="owner-shell">
    <header class="owner-topbar">
      <a class="owner-brand" href="https://nister.org/" aria-label="Nister Wi-Fi home">
        <span class="owner-mark"><span></span></span>
        <span><strong>Nister Wi-Fi</strong><small>Owner portal</small></span>
      </a>
      <nav class="owner-nav" aria-label="Owner navigation">
        <a href="/owner/login.php">Owner login</a>
        <a href="/owner/lead.php">New request</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Logout</span>
        <h1>Close the owner portal session.</h1>
        <p>This action only clears the isolated owner session cookie named nister_owner. It does not destroy resident or admin sessions.</p>
      </div>

      <section class="owner-card">
        <h1>Confirm logout</h1>
        <?php if (is_array($owner)): ?>
          <p class="owner-muted">You are signed in as <?=owner_logout_e((string)($owner['display_name'] ?? ''))?>, <?=owner_logout_e(msisdn_display((string)($owner['msisdn'] ?? '')))?>.</p>
          <form class="owner-form" method="post" action="/owner/logout.php">
            <input type="hidden" name="_csrf" value="<?=owner_logout_e(owner_csrf_token())?>">
            <div class="owner-button-row">
              <button class="owner-button" type="submit">Log out</button>
              <a class="owner-link-button" href="/owner/dashboard.php">Return to dashboard</a>
            </div>
          </form>
        <?php else: ?>
          <p class="owner-muted">There is no active owner session in this browser.</p>
          <div class="owner-button-row">
            <a class="owner-button" href="/owner/login.php">Go to owner login</a>
          </div>
        <?php endif; ?>
      </section>
    </section>
  </main>
</body>
</html>
