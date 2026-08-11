<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();

if (owner_logged_in()) {
  header('Location: /owner/dashboard.php');
  exit;
}

function owner_login_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_login_retry_message(string $rawMsisdn): string {
  $gate = nister_rate_limit_allow('owner_login', owner_login_rate_limit_key($rawMsisdn), 6, 600, 900);
  $retry = (int)($gate['retry_after'] ?? 0);
  if (!($gate['allowed'] ?? true) && $retry > 0) {
    if ($retry < 60) return 'Too many attempts. Try again in ' . $retry . ' seconds.';
    return 'Too many attempts. Try again in ' . (int)ceil($retry / 60) . ' minute(s).';
  }
  return 'Login failed. Check the phone number and owner password, then try again.';
}

$err = '';
$msg = (string)($_GET['msg'] ?? '');
$prefill = (string)($_POST['msisdn'] ?? $_GET['msisdn'] ?? '');
$displayPrefill = $prefill !== '' ? (msisdn_display(normalize_msisdn($prefill)) ?: $prefill) : '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  owner_require_same_origin_post();
  owner_require_csrf_post();

  $msisdn = (string)($_POST['msisdn'] ?? '');
  $password = (string)($_POST['password'] ?? '');
  $displayPrefill = msisdn_display(normalize_msisdn($msisdn)) ?: $msisdn;
  if (trim($msisdn) === '' || $password === '') {
    $err = 'Enter your owner phone number and password.';
  } else {
    try {
      if (owner_do_login($msisdn, $password)) {
        header('Location: /owner/dashboard.php');
        exit;
      }
      $err = owner_login_retry_message($msisdn);
    } catch (Throwable $e) {
      $err = 'Owner login is not available right now. Try again shortly or contact support.';
    }
  }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Login</title>
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
        <a href="/owner/lead.php">New request</a>
        <a href="https://pay.nister.org/">Manage access</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Owner login</span>
        <h1>Open your owner workspace.</h1>
        <p>Use the phone number verified during owner onboarding and the owner password you created or confirmed.</p>
        <div class="owner-status-list" aria-label="Owner access notes">
          <span>Pending owners can track submitted requests after approval features are added.</span>
          <span>Approved owners can use the dashboard when Task 5 adds authenticated request pages.</span>
          <span>Suspended owner accounts must contact Nister support or an administrator.</span>
        </div>
      </div>

      <section class="owner-card">
        <h1>Sign in</h1>
        <?php if ($msg === 'logged_out'): ?>
          <div class="owner-message owner-message-ok">You have logged out of the owner portal.</div>
        <?php endif; ?>
        <?php if ($err !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_login_e($err)?></div>
        <?php endif; ?>
        <form class="owner-form" method="post" action="/owner/login.php" autocomplete="off">
          <input type="hidden" name="_csrf" value="<?=owner_login_e(owner_csrf_token())?>">
          <div class="owner-field">
            <label for="msisdn">Owner phone number</label>
            <input id="msisdn" name="msisdn" type="tel" inputmode="tel" value="<?=owner_login_e($displayPrefill)?>" required autofocus>
          </div>
          <div class="owner-field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <div class="owner-button-row">
            <button class="owner-button" type="submit">Sign in</button>
            <a class="owner-link-button" href="/owner/lead.php">Submit installation request</a>
          </div>
        </form>
      </section>
    </section>
  </main>
</body>
</html>
