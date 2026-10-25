<?php
declare(strict_types=1);
require_once __DIR__.'/../../pay-portal/lib/account_access.php';
require_once __DIR__.'/../../pay-portal/lib/radius.php';
$checks = 0;
function check_access(string $name, bool $condition): void {
  global $checks;
  if (!$condition) throw new RuntimeException($name);
  $checks++; echo 'PASS account_access_'.$name.PHP_EOL;
}
function fixture(): PDO {
  $p = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
  account_access_bootstrap($p);
  $p->exec('CREATE TABLE radcheck(id INTEGER PRIMARY KEY, username TEXT, attribute TEXT, op TEXT, value TEXT)');
  foreach (['radreply','radusergroup','radpostauth','radacct','radippool','userinfo','userbillinfo','nister_wallet','nister_data_promos','nister_topup_log','admin_alerts'] as $t) $p->exec("CREATE TABLE $t(username TEXT)");
  foreach (['accounts','user_location_profiles','wallet_promo_grants','signup_otp_sessions','signup_otp_challenges','auto_renew_settings','payments','purchases','ledger','referral_profiles'] as $t) $p->exec("CREATE TABLE $t(msisdn TEXT)");
  foreach (['referral_rewards','referral_links'] as $t) $p->exec("CREATE TABLE $t(referrer_msisdn TEXT,referred_msisdn TEXT)");
  return $p;
}
function credential(PDO $p, string $user, string $attribute='Cleartext-Password', string $value='old-test-password'): void {
  $p->prepare('INSERT INTO radcheck(username,attribute,op,value) VALUES (?, ?, ?, ?)')->execute([$user,$attribute,':=',$value]);
}
$target='233190000001';$local='0190000001';$other='233190000002';
$p=fixture();
check_access('aliases_are_canonical_and_local',account_access_users($local)===[$target,$local]);
check_access('named_username_preserved',account_access_users('codex_admin')===['codex_admin']);
check_access('long_numeric_username_preserved',account_access_users('20260506011033')===['20260506011033']);
check_access('numeric_id_with_phone_suffix_is_not_normalized',account_access_users('2026233190000001')===['2026233190000001']);
check_access('digits_in_named_username_are_not_subscriber_aliases',account_access_users('codex_233190000001')===['codex_233190000001']);
check_access('radius_aliases_preserve_named_identity',nister_username_variants('codex_233190000001')===['codex_233190000001']);
check_access('radius_aliases_preserve_numeric_id',nister_username_variants('20260506011033')===['20260506011033']);
try { account_access_users('bad";account');throw new LogicException('expected_invalid_username'); }
catch (InvalidArgumentException $expected) {}
check_access('router_script_metacharacters_rejected',true);
check_access('unknown_lookup_is_read_only',!account_access_portal_exists($p,$p,$target) && (int)$p->query('SELECT COUNT(*) FROM accounts')->fetchColumn()===0);
credential($p,$target);credential($p,$local,'NT-Password','obsolete-hash');credential($p,$target,'Simultaneous-Use','2');credential($p,$other);
check_access('legacy_session_preserved_before_change',account_access_session_valid($p,$target,0));
$p->beginTransaction();account_access_replace_password($p,$target,'new-test-password');account_access_record($p,$target,'password_change');$p->commit();
check_access('old_password_and_hash_removed',(int)$p->query("SELECT COUNT(*) FROM radcheck WHERE username IN ('$target','$local') AND value IN ('old-test-password','obsolete-hash')")->fetchColumn()===0);
check_access('both_aliases_receive_new_password',(int)$p->query("SELECT COUNT(*) FROM radcheck WHERE username IN ('$target','$local') AND attribute='Cleartext-Password' AND value='new-test-password'")->fetchColumn()===2);
check_access('device_cap_preserved',(int)$p->query("SELECT COUNT(*) FROM radcheck WHERE username='$target' AND attribute='Simultaneous-Use' AND value='2'")->fetchColumn()===1);
check_access('old_session_revoked',!account_access_session_valid($p,$target,0));
check_access('new_session_and_other_account_valid',account_access_session_valid($p,$target,1) && account_access_session_valid($p,$other,0));
$result=account_access_dispatch($p,$target,[],static fn()=>['exit'=>0,'output'=>'status=skipped reason=missing_router_key']);
check_access('skip_is_never_false_success',$result['pending']===true);
$called=0;
$ok=static function(array $users) use (&$called,$target,$local):array { $called++;if($users!==[$target,$local])throw new RuntimeException('wrong_scope');return ['exit'=>0,'output'=>'status=ok action=hotspot_session_revoke remaining=0']; };
check_access('pending_request_retries_and_succeeds',account_access_dispatch($p,$target,[],$ok)['pending']===false);
account_access_dispatch($p,$target,[],$ok);
check_access('completed_request_is_not_replayed',$called===1);
$p->beginTransaction();account_access_record($p,$target,'password_reset');$p->commit();
account_access_dispatch($p,$target,[],static fn()=>['exit'=>255,'output'=>'Permission denied (publickey).']);
account_access_dispatch($p,$target,[],$ok);
check_access('authentication_failure_stops_automatic_retries',$called===1);

// Every active account store is populated, together with an unrelated account.
$p=fixture();credential($p,$target);credential($p,$local);credential($p,$other);
$radius=['radreply','radusergroup','radpostauth','radacct','radippool','userinfo','userbillinfo','nister_wallet','nister_data_promos','nister_topup_log','admin_alerts'];
$portal=['accounts','user_location_profiles','wallet_promo_grants','signup_otp_sessions','signup_otp_challenges','auto_renew_settings','payments','purchases','ledger','referral_profiles'];
foreach ($radius as $t) foreach ([$target,$local,$other] as $u) $p->prepare("INSERT INTO $t(username) VALUES (?)")->execute([$u]);
foreach ($portal as $t) foreach ([$target,$local,$other] as $u) $p->prepare("INSERT INTO $t(msisdn) VALUES (?)")->execute([$u]);
foreach (['referral_rewards','referral_links'] as $t) {
  $p->prepare("INSERT INTO $t VALUES (?,?)")->execute([$other,$target]);
  $p->prepare("INSERT INTO $t VALUES (?,?)")->execute([$other,$other]);
}
account_access_purge($p,$p,$local);
check_access('purge_removes_login_and_profile',!account_access_portal_exists($p,$p,$target));
foreach (array_merge($radius,$portal,['radcheck','referral_rewards','referral_links']) as $t) check_access('purge_scopes_'.$t,(int)$p->query("SELECT COUNT(*) FROM $t")->fetchColumn()===1);
check_access('purge_invalidates_old_portal_session',!account_access_session_valid($p,$target,0));
credential($p,$target,'Cleartext-Password','fresh-registration');
check_access('fresh_registration_cannot_reuse_old_session',!account_access_session_valid($p,$target,0) && account_access_session_valid($p,$target,1));

$p=fixture();credential($p,$target);$p->exec("INSERT INTO wallet_promo_grants VALUES ('$target')");
$p->exec("CREATE TRIGGER refuse_test_delete BEFORE DELETE ON wallet_promo_grants BEGIN SELECT RAISE(ABORT, 'test failure'); END");
try { account_access_purge($p,$p,$target);throw new LogicException('expected_failure'); }
catch (PDOException $expected) {}
check_access('failed_purge_rolls_back_auth_and_revocation',account_access_credentials_exist($p,$target) && account_access_revision($p,$target)===0 && !$p->inTransaction());

// Admin rows include legacy names and numeric IDs, including group-only orphans.
foreach (['codex_admin','20260506011033','codex_233190000001'] as $named) {
  $p=fixture();credential($p,$target);
  $p->prepare('INSERT INTO radusergroup(username) VALUES (?)')->execute([$named]);
  $result=account_access_purge($p,$p,$named);
  check_access('purge_exact_legacy_'.$named,$result['targets']===[$named]
    && (int)$p->query('SELECT COUNT(*) FROM radusergroup')->fetchColumn()===0
    && account_access_credentials_exist($p,$target));
  $called=[];
  account_access_dispatch($p,$named,[],static function(array $users) use (&$called):array {
    $called=$users;return ['exit'=>0,'output'=>'status=ok action=hotspot_session_revoke remaining=0'];
  });
  check_access('revoke_exact_legacy_'.$named,$called===[$named]);
}
echo 'Account access checks passed ('.$checks.').'.PHP_EOL;
