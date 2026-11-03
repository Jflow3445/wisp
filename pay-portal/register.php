<?php
declare(strict_types=1);
require_once __DIR__.'/lib/user_auth.php';
$ENV=user_boot();
require_once __DIR__.'/lib/registration_runtime.php';
header('Cache-Control: no-store, private'); header('X-Robots-Tag: noindex');
if (empty($_SESSION['registration_csrf'])) $_SESSION['registration_csrf']=bin2hex(random_bytes(32));
$error=''; $policy=['otp_required'=>true];
try { $policy=registration_policy(); } catch (Throwable $e) { $error='Registration is temporarily unavailable. Please try again.'; }
$siteCode=location_normalize_code((string)($_POST['location_code'] ?? $_GET['location_code'] ?? location_session_get_code() ?? ''));
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')==='POST') {
  try {
    if (!hash_equals((string)$_SESSION['registration_csrf'],(string)($_POST['_csrf'] ?? ''))) throw new InvalidArgumentException('csrf_invalid');
    if (!nister_is_same_origin_request()) throw new InvalidArgumentException('csrf_invalid');
    $account=registration_submit($PDO,$_POST,$siteCode);
    unset($_SESSION['registration_csrf']);
    header('Location: /login.php?msg=registered&username='.rawurlencode($account['username']),true,303); exit;
  } catch (Throwable $e) {
    $error=registration_error_message($e->getMessage());
    if (!($e instanceof InvalidArgumentException) && $e->getMessage()!=='account_exists') error_log('[registration] public_creation_failed class='.get_class($e).' code='.(string)$e->getCode());
  }
} elseif (isset($_GET['err'])) $error=registration_error_message((string)$_GET['err']);
$locations=location_list(true);
function signup_h($v): string { return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8'); }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Create an account | Nister Wi-Fi</title><link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">


<link rel="stylesheet" href="/assets/signup.css?v=20261103"><script src="/assets/signup.js?v=20261103" defer></script></head>
<body class="signup-page"><main class="signup-layout">
<section class="signup-panel"><nav><a href="/">Manage Access</a><a href="/login.php">Sign in ↗</a></nav><div class="signup-form-wrap"><a class="signup-brand" href="https://nister.org/">Nister Wi-Fi</a><h1>Create account</h1>
<div id="banner" class="signup-banner" role="alert" <?=$error===''?'hidden':''?>><span id="banner-text"><?=signup_h($error)?></span></div>
<form id="signup_form" data-signup-form data-otp-required="<?=$policy['otp_required']?'1':'0'?>" action="/register.php" method="post">
<input type="hidden" name="_csrf" value="<?=signup_h($_SESSION['registration_csrf'])?>"><input type="hidden" id="otp_token" name="otp_token" value="">
<label for="name">Full name</label><input id="name" name="name" autocomplete="name" minlength="2" maxlength="80" required value="<?=signup_h($_POST['name'] ?? $_GET['name'] ?? '')?>">
<label for="user">Ghana phone number</label><div class="signup-phone"><span>GH</span><input id="user" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="0241234567" maxlength="24" required value="<?=signup_h($_POST['phone'] ?? $_GET['username'] ?? '')?>"></div>

<fieldset id="otp_fields" <?=$policy['otp_required']?'':'hidden'?>><legend>Verify your number</legend><button id="otp_send_btn" class="signup-secondary" type="button">Send code</button><label for="otp_code">SMS verification code</label><div class="signup-otp"><input id="otp_code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code"><button id="otp_verify_btn" class="signup-secondary" type="button">Verify</button></div><p id="otp_status" class="signup-hint" role="status"></p></fieldset>
<label for="pass">Password (6+ characters)</label><div class="signup-password"><input id="pass" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required><button id="toggle_pass" type="button" aria-controls="pass" aria-pressed="false">Show</button></div>
<?php if (count($locations)>1): ?><label for="location_code">Your Nister location</label><select id="location_code" name="location_code"><?php foreach($locations as $loc): ?><option value="<?=signup_h($loc['code'])?>" <?=$siteCode===$loc['code']?'selected':''?>><?=signup_h($loc['name'])?></option><?php endforeach; ?></select><?php else: ?><input type="hidden" name="location_code" value="<?=signup_h($siteCode)?>"><?php endif; ?>
<details class="signup-referral"><summary>Have a referral code?</summary><label for="referral_code">Referral code <span>(optional)</span></label><input id="referral_code" name="referral_code" maxlength="32" autocomplete="off" value="<?=signup_h($_POST['referral_code'] ?? $_GET['ref'] ?? '')?>"></details>
<div class="signup-trap" aria-hidden="true"><label for="contact_website">Leave this field empty</label><input id="contact_website" name="contact_website" tabindex="-1" autocomplete="off"></div>
<button class="signup-primary" type="submit">Create account <span aria-hidden="true">→</span></button><p class="signup-terms">Internet access requires a paid plan.</p></form><p class="signup-signin">Already with Nister? <a href="/login.php">Sign in</a></p></div></section>
</main></body></html>
