<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
$ENV=admin_boot(); admin_require_login();
require_once __DIR__.'/../views/admin-shell.php';
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/location.php';
require_once __DIR__.'/../lib/referrals.php';
require_once __DIR__.'/../lib/admin_registration.php';
require_once __DIR__.'/../lib/sms.php';
require_once __DIR__.'/../lib/alerts.php';
header('Cache-Control: no-store');
location_bootstrap(); $locations=location_list(true); $error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
  admin_require_csrf_post();
  try {
    $location=location_find_by_id((int)($_POST['location_id'] ?? 0));
    if (!$location || empty($location['active'])) throw new InvalidArgumentException('invalid_location');
    $radius=rdb_pdo();
    $identity='SELECT CONCAT_WS(CHAR(58),@@hostname,@@port,DATABASE())';
    if ($PDO->query($identity)->fetchColumn()!==$radius->query($identity)->fetchColumn()) throw new RuntimeException('registration_database_mismatch');
    // Use one connection so credentials, wallet, name and location commit together.
    $account=admin_register_account($PDO,$_POST,$location);
    $sms=null;
    if (!empty($_POST['welcome_sms'])) {
      $sms=sms_send_templated($account['canonical'],'SMS_WELCOME_TEXT','Hi {NAME}, your NISTER account is ready. Login: {LOGIN_URL}',[
        'NAME'=>$account['name'],'MSISDN'=>$account['username'],'LOGIN_URL'=>sms_setting('SMS_LOGIN_URL','https://wifi.nister.org')]);
    }
    // Ancillary setup cannot turn a committed registration into an apparent failure.
    try { referrals_ensure_profile($account['canonical']); } catch (Throwable $e) { error_log('[admin_registration] referral_setup_pending'); }
    try { alerts_insert($PDO,gmdate('Y-m-d H:i:s'),'admin_registration',$account['canonical'],'Account registered by '.(string)$_SESSION['admin_user'],(string)($_SERVER['REMOTE_ADDR'] ?? '')); } catch (Throwable $e) { error_log('[admin_registration] audit_unavailable'); }
    $_SESSION['registration_notice']='Account '.$account['username'].' created. It starts unpaid and allows up to two devices. Ask the user to log in and buy a plan.';
    if ($sms!==null) $_SESSION['registration_notice'].=$sms['sent'] ? ' Welcome SMS accepted by the gateway.' : ' Welcome SMS was not sent ('.($sms['error'] ?? 'unavailable').'). The account was created successfully.';
    header('Location: /admin/register.php',true,303); exit;
  } catch (InvalidArgumentException $e) { $error=str_replace('_',' ',$e->getMessage()); }
    catch (Throwable $e) { $error=$e->getMessage()==='account_exists' ? 'This account already exists. No changes were made.' : 'Registration could not be completed. Please try again.'; error_log('[admin_registration] creation_failed'); }
}
$notice=(string)($_SESSION['registration_notice'] ?? ''); unset($_SESSION['registration_notice']);
function reg_h($s): string { return htmlspecialchars((string)$s,ENT_QUOTES,'UTF-8'); }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Register user · Nister Admin</title><link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/premium.css?v=20260603-premium9"><link rel="stylesheet" href="/assets/admin-shell.css?v=20261102"></head><body class="admin-console ops-page ops-register"><?php admin_shell_start('register','Register a user','Create an unpaid account when assisting a customer, using the same access and billing rules.',$ENV); ?>
<?php if ($notice): ?><p class="notice" role="status"><?=reg_h($notice)?></p><?php endif; ?>
<?php if ($error): ?><p class="error" role="alert"><?=reg_h($error)?></p><?php endif; ?>
<p>Create an account directly when assisting a customer. Admin registration does not require an SMS OTP. The account starts unpaid with a zero balance; normal plan and payment rules apply.</p>
<section class="ops-form-grid"><form method="post"><input type="hidden" name="_csrf" value="<?=reg_h(admin_csrf_token())?>">
<label for="name">Full name</label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="80" value="<?=reg_h($_POST['name'] ?? '')?>">
<label for="phone">Ghana phone number</label><input id="phone" name="phone" type="tel" autocomplete="tel" required placeholder="0241234567" value="<?=reg_h($_POST['phone'] ?? '')?>">
<label for="password">Wi-Fi password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="128"><p class="hint">Give this password to the user securely. Passwords are never included in welcome SMS.</p>
<label for="location_id">Site</label><select id="location_id" name="location_id" required><?php foreach ($locations as $loc): if (empty($loc['active'])) continue; ?><option value="<?=(int)$loc['id']?>" <?=((int)($_POST['location_id'] ?? location_default_id())===(int)$loc['id']) ? 'selected' : ''?>><?=reg_h($loc['name'])?></option><?php endforeach; ?></select>
<label class="check"><input type="checkbox" name="welcome_sms" value="1" <?=!empty($_POST['welcome_sms']) ? 'checked' : ''?>> Send a welcome SMS using the enabled gateways</label>
<p class="hint">SMS pause and gateway controls also apply here. A failed or paused welcome SMS does not cancel registration.</p><button type="submit">Create unpaid account</button></form><aside><h3>Ready for their first connection</h3><p>The customer uses this phone number and password for Wi-Fi and their Nister account.</p><h3>Access starts unpaid</h3><p>The wallet starts at GHS 0.00. A plan purchase is still required for internet access, with up to two devices per account.</p><h3>Welcome message</h3><p>An optional welcome SMS follows your delivery settings. A paused or failed message never cancels the new account.</p></aside></section>
<?php admin_shell_end(); ?></body></html>
