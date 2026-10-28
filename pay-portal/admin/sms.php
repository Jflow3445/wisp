<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/admin_auth.php';
$ENV=admin_boot(); admin_require_login();
require_once __DIR__.'/../lib/sms.php';
header('Cache-Control: no-store');
$notice=''; $error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
  admin_require_csrf_post();
  try {
    $action=(string)($_POST['action'] ?? '');
    if ($action==='pause' || $action==='resume') {
      settings_set('SMS_ENABLED',$action==='resume' ? '1' : '0');
      $notice=$action==='resume' ? 'SMS delivery resumed.' : 'All SMS delivery paused. OTP requests cannot complete while delivery is paused.';
    } elseif ($action==='save') {
      sms_admin_save_gateways($_POST); $notice='Gateway settings saved.';
    } elseif ($action==='probe') {
      $probe=sms_probe_gateway((string)($_POST['provider'] ?? ''));
      $notice=$probe['ok'] ? 'Gateway balance check passed. This does not send an SMS or confirm handset delivery.' : 'Gateway check failed: '.($probe['error'] ?? 'unknown');
      if ($probe['ok'] && isset($probe['balance'])) $notice.=' Reported balance: '.$probe['balance'].'.';
    } else { throw new InvalidArgumentException('Unknown action.'); }
    $_SESSION['sms_notice']=$notice;
    header('Location: /admin/sms.php',true,303); exit;
  } catch (InvalidArgumentException $e) { $error=$e->getMessage(); }
    catch (Throwable $e) { $error='Unable to save or check SMS settings. Please try again.'; error_log('[sms] admin_action_failed'); }
}
$notice=(string)($_SESSION['sms_notice'] ?? $notice); unset($_SESSION['sms_notice']);
$status=sms_admin_status(); $csrf=admin_csrf_token();
function sms_h($s): string { return htmlspecialchars((string)$s,ENT_QUOTES,'UTF-8'); }
function sms_admin_time(int $epoch): string { return $epoch>0 ? gmdate('Y-m-d H:i:s',$epoch).' UTC' : '—'; }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SMS gateways · Nister Admin</title><link rel="stylesheet" href="/assets/admin-operations.css"></head><body><main>
<nav><a href="/admin/">← Admin portal</a><a href="/admin/register.php">Register a user</a></nav>
<h1>SMS delivery</h1>
<?php if ($notice): ?><p class="notice" role="status"><?=sms_h($notice)?></p><?php endif; ?>
<?php if ($error): ?><p class="error" role="alert"><?=sms_h($error)?></p><?php endif; ?>
<section><h2><?= $status['enabled'] ? 'Delivery is on' : 'Delivery is paused' ?></h2>
<p>Pause stops new SMS attempts everywhere: signup, password reset, payments, quota alerts and admin messages. Messages already accepted by a provider cannot be recalled. Paused messages are skipped and are not queued for later delivery.</p>
<form method="post"><input type="hidden" name="_csrf" value="<?=sms_h($csrf)?>"><button name="action" value="<?=$status['enabled'] ? 'pause' : 'resume'?>"><?=$status['enabled'] ? 'Pause all SMS' : 'Resume SMS delivery'?></button></form></section>
<h2>Gateways</h2><p>Enable the gateways to use and set their priority (1 goes first). A rejected request falls back to the next available gateway. Failures temporarily put a gateway on cooldown; it is retried automatically afterward. A timeout has an uncertain outcome, so that message is not resent through another gateway. Later messages can use the backup.</p>
<form method="post" autocomplete="off"><input type="hidden" name="_csrf" value="<?=sms_h($csrf)?>"><input type="hidden" name="action" value="save">
<div class="cards">
<?php foreach ($status['gateways'] as $g): $id=$g['id']; ?>
<section><h3><?=sms_h(['pilosms'=>'PiloSMS','mnotify'=>'mNotify','arkesel'=>'Arkesel'][$id])?></h3>
<label class="check"><input type="checkbox" name="enabled_<?=sms_h($id)?>" value="1" <?=$g['enabled'] ? 'checked' : ''?>> Enable this gateway</label>
<p class="state"><?=sms_h(ucfirst($g['state']))?></p>
<label for="priority_<?=sms_h($id)?>">Priority</label><input id="priority_<?=sms_h($id)?>" name="priority_<?=sms_h($id)?>" type="number" min="1" max="99" value="<?=$g['priority']?>" required>
<label for="sender_<?=sms_h($id)?>">Sender ID (up to 11 characters)</label><input id="sender_<?=sms_h($id)?>" name="sender_<?=sms_h($id)?>" maxlength="11" value="<?=sms_h($g['sender'])?>">
<label for="key_<?=sms_h($id)?>">API key</label><input id="key_<?=sms_h($id)?>" name="key_<?=sms_h($id)?>" type="password" autocomplete="new-password" maxlength="512" placeholder="<?=$g['has_key'] ? 'Saved — leave blank to keep' : 'Enter API key'?>">
<label class="check"><input type="checkbox" name="clear_key_<?=sms_h($id)?>" value="1"> Remove saved API key</label>
<dl><dt>Last check</dt><dd><?=sms_h(sms_admin_time($g['last_checked']))?></dd><dt>Last accepted SMS</dt><dd><?=sms_h(sms_admin_time($g['last_accepted']))?></dd><dt>Last issue</dt><dd><?=sms_h($g['last_error'] ?? '—')?></dd><dt>Retry after</dt><dd><?=sms_h(sms_admin_time($g['retry_after']))?></dd></dl>
</section><?php endforeach; ?></div><button type="submit">Save gateways</button></form>
<section><h2>Check gateway connections</h2><p>Balance checks use saved settings and do not send SMS. Only enabled, configured gateways are checked. Gateway acceptance does not guarantee delivery to the recipient.</p>
<?php foreach ($status['gateways'] as $g): ?><form method="post" class="inline"><input type="hidden" name="_csrf" value="<?=sms_h($csrf)?>"><input type="hidden" name="provider" value="<?=sms_h($g['id'])?>"><button name="action" value="probe" <?=!$g['enabled'] || !$g['configured'] ? 'disabled' : ''?>>Check <?=sms_h($g['id'])?></button></form><?php endforeach; ?></section>
</main></body></html>
