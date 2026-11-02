<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';
require_once __DIR__.'/radius.php';
require_once __DIR__.'/location.php';
require_once __DIR__.'/referrals.php';
require_once __DIR__.'/sms.php';
require_once __DIR__.'/registration.php';

/** Shared by the public pay form and canonical hotspot signup endpoint. */
function registration_submit(PDO $db,array $input,string $siteCode=''): array {
  if (!empty($input['contact_website'])) throw new InvalidArgumentException('invalid_name');
  $phone=(string)($input['phone'] ?? $input['username'] ?? '');
  $env=isset($GLOBALS['ENV']) && is_array($GLOBALS['ENV']) ? $GLOBALS['ENV'] : [];
  registration_limit_attempt($phone,nister_client_ip($env));
  $identity='SELECT CONCAT_WS(CHAR(58),@@hostname,@@port,DATABASE())';
  if ($db->query($identity)->fetchColumn()!==rdb_pdo()->query($identity)->fetchColumn()) throw new RuntimeException('registration_database_mismatch');
  $location=$siteCode!=='' ? location_find_by_code($siteCode) : location_find_by_id(location_default_id());
  if (!$location || empty($location['active'])) throw new InvalidArgumentException('invalid_location');
  $referral=trim((string)($input['referral_code'] ?? ''));
  if ($referral!=='' && referrals_resolve_referrer_msisdn($referral)===null) throw new InvalidArgumentException('invalid_referral_code');
  // DDL/bootstrap stays outside the account transaction. Token consumption rolls back with it.
  referrals_bootstrap_tables();
  $account=self_register_account($db,array_merge($input,['phone'=>$phone]),$location);
  try {
    referrals_ensure_profile($account['canonical']);
    if ($referral!=='') referrals_bind_referral($account['canonical'],$referral);
  } catch (Throwable $e) { error_log('[registration] referral_setup_pending'); }
  try {
    if (trim((string)sms_setting('SMS_WELCOME_TEXT',''))!=='') {
      sms_send_templated($account['canonical'],'SMS_WELCOME_TEXT','',
        ['NAME'=>$account['name'],'MSISDN'=>$account['username'],'LOGIN_URL'=>'https://pay.nister.org/login.php']);
    }
  } catch (Throwable $e) { error_log('[registration] welcome_unavailable'); }
  return $account;
}
