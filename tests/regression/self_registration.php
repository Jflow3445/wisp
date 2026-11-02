<?php
declare(strict_types=1);
require_once __DIR__.'/../../pay-portal/lib/registration.php';
$checks=0;
function signup_check(string $name,bool $ok): void {
  global $checks; if (!$ok) throw new RuntimeException($name); $checks++; echo "PASS self_registration_$name\n";
}
function signup_fixture(): PDO {
  $db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
  foreach (['radcheck','radreply'] as $table) $db->exec("CREATE TABLE $table(username TEXT,attribute TEXT,op TEXT,value TEXT)");
  $db->exec('CREATE TABLE radusergroup(username TEXT,groupname TEXT,priority INTEGER,UNIQUE(username,groupname))');
  $db->exec('CREATE TABLE accounts(msisdn TEXT PRIMARY KEY,balance_cents INTEGER)');
  $db->exec('CREATE TABLE userinfo(username TEXT,firstname TEXT,lastname TEXT)');
  $db->exec('CREATE TABLE user_location_profiles(msisdn TEXT PRIMARY KEY,location_id INTEGER,signup_location_id INTEGER,last_location_code TEXT)');
  $db->exec('CREATE TABLE signup_otp_sessions(token TEXT PRIMARY KEY,msisdn TEXT,expires_at TEXT,consumed_at TEXT)');
  $db->exec('CREATE TABLE app_settings(k TEXT PRIMARY KEY,v TEXT)');
  $db->exec("CREATE TRIGGER default_unpaid AFTER INSERT ON radcheck WHEN NEW.attribute='Cleartext-Password'
    AND NOT EXISTS (SELECT 1 FROM radusergroup WHERE username IN (NEW.username,'0'||substr(NEW.username,4)))
    BEGIN INSERT INTO radusergroup VALUES(NEW.username,'HS_NOPAID',1); END");
  return $db;
}
function signup_expect_error(PDO $db,array $input,array $site,callable $switch,string $expected): void {
  try { self_register_account($db,$input,$site,$switch); throw new LogicException('expected_failure'); }
  catch (InvalidArgumentException $e) { signup_check($expected,$e->getMessage()===$expected); }
}
$site=['id'=>1,'code'=>'TEST','active'=>1];
$input=['phone'=>'0190000011','name'=>'Fixture Customer','password'=>'fixture-password'];
foreach (['1','true','on','',null,'unrecognized'] as $switch) signup_check('requires_otp_by_default_'.($switch ?? 'null'),registration_otp_required($switch));
foreach (['0','false','off','no','disabled'] as $switch) signup_check('explicit_pause_'.$switch,!registration_otp_required($switch));
$db=signup_fixture();$enabled='0';$read=static function() use (&$enabled){return $enabled;};
$result=self_register_account($db,$input,$site,$read);
signup_check('paused_sms_creates_new_account_without_otp',$result['canonical']==='233190000011');
signup_check('paused_registration_is_unpaid_and_zero_balance',(int)$db->query('SELECT balance_cents FROM accounts')->fetchColumn()===0 && (int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE groupname='HS_NOPAID'")->fetchColumn()===2);
signup_check('two_devices_on_both_aliases',(int)$db->query("SELECT COUNT(*) FROM radcheck WHERE attribute='Simultaneous-Use' AND value='2'")->fetchColumn()===2);
try { self_register_account($db,array_merge($input,['password'=>'different-password']),$site,$read); throw new LogicException('expected_duplicate'); }
catch (RuntimeException $e) { signup_check('paused_signup_cannot_claim_existing_account',$e->getMessage()==='account_exists' && $db->query("SELECT value FROM radcheck WHERE attribute='Cleartext-Password' LIMIT 1")->fetchColumn()==='fixture-password'); }
$input['phone']='0190000012';$input['otp_required']=false;$enabled='1';
signup_expect_error($db,$input,$site,$read,'otp_required');
signup_check('resume_rechecks_current_policy_and_leaves_no_account',(int)$db->query('SELECT COUNT(*) FROM accounts')->fetchColumn()===1 && !$db->inTransaction());
$input['otp_token']=str_repeat('a',64);
signup_expect_error($db,$input,$site,$read,'otp_invalid_or_expired');
$db->prepare('INSERT INTO signup_otp_sessions VALUES (?,?,?,NULL)')->execute([$input['otp_token'],'233190000012',gmdate('Y-m-d H:i:s',time()+600)]);
$result=self_register_account($db,$input,$site,$read);
signup_check('resumed_sms_accepts_verified_signup',$result['canonical']==='233190000012' && $db->query('SELECT consumed_at FROM signup_otp_sessions')->fetchColumn()!==null);
$input['phone']='0190000013';
signup_expect_error($db,$input,$site,$read,'otp_invalid_or_expired');
$input['otp_token']=str_repeat('b',64);
$db->prepare('INSERT INTO signup_otp_sessions VALUES (?,?,?,NULL)')->execute([$input['otp_token'],'233190000013',gmdate('Y-m-d H:i:s',time()-60)]);
signup_expect_error($db,$input,$site,$read,'otp_invalid_or_expired');
$input['otp_token']=str_repeat('c',64);
$db->prepare('INSERT INTO signup_otp_sessions VALUES (?,?,?,NULL)')->execute([$input['otp_token'],'233190000099',gmdate('Y-m-d H:i:s',time()+600)]);
signup_expect_error($db,$input,$site,$read,'otp_invalid_or_expired');
$input['otp_token']=str_repeat('d',64);
$db->prepare('INSERT INTO signup_otp_sessions VALUES (?,?,?,NULL)')->execute([$input['otp_token'],'233190000013',gmdate('Y-m-d H:i:s',time()+600)]);
$db->exec("CREATE TRIGGER fail_signup_profile BEFORE INSERT ON user_location_profiles WHEN NEW.msisdn='233190000013' BEGIN SELECT RAISE(ABORT,'fixture late failure'); END");
try { self_register_account($db,$input,$site,$read); throw new LogicException('expected_late_failure'); } catch (PDOException $e) {}
$token=$db->prepare('SELECT consumed_at FROM signup_otp_sessions WHERE token=?');$token->execute([$input['otp_token']]);
signup_check('failed_creation_restores_verification_token',$token->fetchColumn()===null);
signup_check('late_failure_rolls_back_all_account_state',(int)$db->query('SELECT COUNT(*) FROM accounts')->fetchColumn()===2 && (int)$db->query('SELECT COUNT(*) FROM radcheck')->fetchColumn()===12 && (int)$db->query('SELECT COUNT(*) FROM radusergroup')->fetchColumn()===4);
try { self_register_account($db,$input,$site,static function(){throw new RuntimeException('settings_unavailable');}); throw new LogicException('expected_policy_failure'); }
catch (RuntimeException $e) { signup_check('settings_failure_never_bypasses_verification',$e->getMessage()==='settings_unavailable' && !$db->inTransaction()); }
signup_check('pay_signup_origin_allowed',registration_origin_allowed('https://pay.nister.org'));
signup_check('untrusted_origins_rejected',!registration_origin_allowed('https://pay.nister.org.evil.example') && !registration_origin_allowed('http://pay.nister.org') && !registration_origin_allowed('https://pay.nister.org:444'));
$db->exec("INSERT INTO app_settings VALUES('SMS_ENABLED','0')");$input['phone']='0190000014';unset($input['otp_token']);
$result=self_register_account($db,$input,$site);
signup_check('database_policy_pause_is_read_at_creation',$result['canonical']==='233190000014');
$db->exec("UPDATE app_settings SET v='1' WHERE k='SMS_ENABLED'");$input['phone']='0190000015';
try { self_register_account($db,$input,$site); throw new LogicException('expected_current_policy'); }
catch (InvalidArgumentException $e) { signup_check('database_policy_resume_requires_otp',$e->getMessage()==='otp_required'); }
echo "Self-registration checks passed ($checks).\n";
