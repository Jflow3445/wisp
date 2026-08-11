<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_leads.php';
require_once __DIR__ . '/../lib/owner_otp.php';
require_once __DIR__ . '/../lib/property_requests.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();

function owner_register_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_register_support_href(array $env): string {
  $raw = (string)($env['WHATSAPP_SUPPORT'] ?? getenv('WHATSAPP_SUPPORT') ?: '233530488905');
  $digits = preg_replace('/\D+/', '', $raw);
  if ($digits === '') $digits = '233530488905';
  return 'https://wa.me/' . $digits;
}

function owner_register_otp_error(string $error): string {
  $messages = [
    'otp_invalid' => "That code doesn't look right. Check it and try again.",
    'otp_locked' => 'Too many incorrect OTP attempts. Send a new code before trying again.',
    'otp_expired' => 'That code has expired. Request a new one to continue.',
    'otp_not_requested' => 'Send a verification code before submitting the form.',
    'rate_limited' => 'Too many verification attempts. Wait a few minutes and try again.',
    'sms_send_failed' => 'The request was saved, but the SMS could not be sent. Try sending a new code or contact support.',
    'cooldown_active' => 'A code was sent recently. Wait briefly before sending another one.',
  ];
  return $messages[$error] ?? 'Phone verification could not be completed. Try again or contact support.';
}

function owner_register_conversion_error(Throwable $e): string {
  $message = $e->getMessage();
  $messages = [
    'password_too_short' => 'Use a password with at least 8 characters.',
    'owner_password_invalid' => 'The owner account password is incorrect.',
    'owner_suspended' => 'This owner account is suspended. Contact Nister support or an administrator.',
    'lead_not_found' => 'The property assessment request could not be found. Request the assessment again.',
    'lead_phone_invalid' => 'The request phone number is not a valid Ghana phone number.',
    'lead_owner_phone_mismatch' => 'The request phone does not match this owner account.',
  ];
  return $messages[$message] ?? 'The owner account could not be updated. Review the details and try again.';
}

function owner_register_password_mode(?array $owner): string {
  if (!is_array($owner)) return 'new';
  if ((string)($owner['status'] ?? '') === 'suspended') return 'suspended';
  $hash = trim((string)($owner['password_hash'] ?? ''));
  return $hash === '' ? 'new' : 'existing';
}

function owner_register_precheck(?array $owner, string $password, string $confirm, string $existingPassword): ?string {
  $mode = owner_register_password_mode($owner);
  if ($mode === 'suspended') {
    return 'This owner account is suspended. Contact Nister support or an administrator.';
  }
  if ($mode === 'new') {
    if (strlen($password) < 8) return 'Use a password with at least 8 characters.';
    if (!hash_equals($password, $confirm)) return 'The password confirmation does not match.';
    return null;
  }
  if ($existingPassword === '') return 'Enter the password for this owner account.';
  $hash = trim((string)($owner['password_hash'] ?? ''));
  if ($hash === '' || !password_verify($existingPassword, $hash)) {
    return 'The owner account password is incorrect.';
  }
  return null;
}

owner_schema_bootstrap($PDO);

$leadId = (int)($_POST['lead_id'] ?? $_GET['lead_id'] ?? 0);
$lead = $leadId > 0 ? property_lead_find($PDO, $leadId) : null;
$owner = null;
$mode = 'new';
$err = '';
$msg = '';
$supportHref = owner_register_support_href($ENV);

if (isset($_GET['otp']) && $_GET['otp'] !== '') {
  $err = owner_register_otp_error((string)$_GET['otp']);
}

if (is_array($lead)) {
  $owner = owner_find_by_msisdn($PDO, (string)($lead['contact_phone'] ?? ''));
  $mode = owner_register_password_mode($owner);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  owner_require_same_origin_post();
  owner_require_csrf_post();
  $action = (string)($_POST['action'] ?? 'verify');

  if (!is_array($lead)) {
    $err = 'The property assessment request could not be found. Request the assessment again.';
  } elseif ($mode === 'suspended') {
    $err = 'This owner account is suspended. Contact Nister support or an administrator.';
  } elseif ($action === 'resend') {
    $otp = owner_otp_create($PDO, (string)$lead['contact_phone'], (int)$lead['id'], $ENV, $_SERVER);
    if (($otp['ok'] ?? false) === true) {
      $msg = 'A new verification code was sent to ' . msisdn_display((string)$lead['contact_phone']) . '.';
      $err = '';
    } else {
      $err = owner_register_otp_error((string)($otp['error'] ?? 'sms_send_failed'));
    }
  } else {
    $otpCode = (string)($_POST['otp'] ?? '');
    $password = (string)($_POST['password'] ?? '');
    $confirm = (string)($_POST['password_confirm'] ?? '');
    $existingPassword = (string)($_POST['existing_password'] ?? '');
    $precheck = owner_register_precheck($owner, $password, $confirm, $existingPassword);
    if ($precheck !== null) {
      $err = $precheck;
    } else {
      $otp = owner_otp_verify($PDO, (string)$lead['contact_phone'], $otpCode);
      if (($otp['ok'] ?? false) !== true) {
        $err = owner_register_otp_error((string)($otp['error'] ?? 'otp_invalid'));
      } else {
        try {
          $primaryPassword = $password !== '' ? $password : $existingPassword;
          $converted = property_owner_convert_lead_after_otp($PDO, (int)$lead['id'], $primaryPassword, $existingPassword !== '' ? $existingPassword : null);
          if (($converted['ok'] ?? false) === true) {
            header('Location: /owner/dashboard.php');
            exit;
          }
          $err = (string)($converted['message'] ?? 'This owner account cannot submit a request right now.');
          $mode = 'suspended';
        } catch (Throwable $e) {
          $err = owner_register_conversion_error($e);
        }
      }
    }
  }

  if (is_array($lead)) {
    $owner = owner_find_by_msisdn($PDO, (string)($lead['contact_phone'] ?? ''));
    $mode = owner_register_password_mode($owner);
  }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Verify Owner Phone</title>
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
        <a href="/owner/login.php">Owner login</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Phone verification</span>
        <h1>Let's confirm it's you.</h1>
        <p>We've got your property details. Next, verify your phone number so you can create your Nister owner account and track the request.</p>
        <?php if (is_array($lead)): ?>
          <div class="owner-status-list" aria-label="Request summary">
            <span><?=owner_register_e((string)$lead['property_name'])?></span>
            <span><?=owner_register_e(msisdn_display((string)$lead['contact_phone']))?></span>
            <span><?=owner_register_e((string)$lead['town'])?>, <?=owner_register_e((string)$lead['region'])?></span>
          </div>
        <?php endif; ?>
      </div>

      <section class="owner-card">
        <h1><?=$mode === 'new' ? 'Create your owner account.' : "Let's confirm it's you."?></h1>
        <?php if ($err !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_register_e($err)?></div>
        <?php endif; ?>
        <?php if ($msg !== ''): ?>
          <div class="owner-message owner-message-ok"><?=owner_register_e($msg)?></div>
        <?php endif; ?>

        <?php if (!is_array($lead)): ?>
          <p class="owner-muted">No property assessment request was found for this verification step.</p>
          <div class="owner-button-row">
            <a class="owner-button" href="/owner/lead.php">Request My Property Assessment</a>
          </div>
        <?php elseif ($mode === 'suspended'): ?>
          <p class="owner-muted">The owner account for <?=owner_register_e(msisdn_display((string)$lead['contact_phone']))?> is suspended. Nister must review the account before another request can be submitted.</p>
          <div class="owner-button-row">
            <a class="owner-button" href="<?=owner_register_e($supportHref)?>" target="_blank" rel="noopener">Contact support</a>
          </div>
        <?php else: ?>
          <form class="owner-form" method="post" action="/owner/register.php?lead_id=<?=(int)$lead['id']?>" autocomplete="off">
            <input type="hidden" name="_csrf" value="<?=owner_register_e(owner_csrf_token())?>">
            <input type="hidden" name="lead_id" value="<?=(int)$lead['id']?>">

            <div class="owner-field">
              <label for="otp">Verification code</label>
              <input id="otp" name="otp" type="text" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="one-time-code" required>
              <small>We sent a verification code to <?=owner_register_e(msisdn_display((string)$lead['contact_phone']))?>.</small>
            </div>

            <?php if ($mode === 'new'): ?>
              <div class="owner-field">
                <label for="password">Create owner password</label>
                <input id="password" name="password" type="password" minlength="8" autocomplete="new-password" required>
              </div>
              <div class="owner-field">
                <label for="password_confirm">Confirm password</label>
                <input id="password_confirm" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required>
              </div>
            <?php else: ?>
              <div class="owner-field">
                <label for="existing_password">Owner account password</label>
                <input id="existing_password" name="existing_password" type="password" autocomplete="current-password" required>
                <small>This protects approved and pending owner accounts from public password changes.</small>
              </div>
            <?php endif; ?>

            <div class="owner-button-row">
              <button class="owner-button" name="action" value="verify" type="submit"><?=$mode === 'new' ? 'Create My Account' : 'Verify My Number'?></button>
              <button class="owner-button owner-button-secondary" name="action" value="resend" type="submit" formnovalidate>Send a new code</button>
            </div>
          </form>
        <?php endif; ?>
      </section>
    </section>
  </main>
</body>
</html>
