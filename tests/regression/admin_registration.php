<?php
declare(strict_types=1);
require_once __DIR__.'/../../pay-portal/lib/admin_registration.php';
$p=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
foreach (['radcheck','radreply'] as $t) $p->exec("CREATE TABLE $t(username TEXT,attribute TEXT,op TEXT,value TEXT)");
$p->exec('CREATE TABLE radusergroup(username TEXT,groupname TEXT,priority INTEGER)');
$p->exec('CREATE TABLE accounts(msisdn TEXT PRIMARY KEY,balance_cents INTEGER)');
$p->exec('CREATE TABLE userinfo(username TEXT,firstname TEXT,lastname TEXT)');
$p->exec('CREATE TABLE user_location_profiles(msisdn TEXT PRIMARY KEY,location_id INTEGER,signup_location_id INTEGER,last_location_code TEXT)');
$loc=['id'=>1,'code'=>'test','active'=>1];$input=['phone'=>'0190000001','name'=>'Test Customer','password'=>'test-only-password'];$checks=0;
function registration_check(string $name,bool $pass): void {global $checks;if(!$pass)throw new RuntimeException($name);$checks++;echo "PASS registration_$name\n";}
$r=admin_register_account($p,$input,$loc);
registration_check('two_aliases_created',(int)$p->query("SELECT COUNT(*) FROM radcheck WHERE attribute='Cleartext-Password'")->fetchColumn()===2 && $r['canonical']==='233190000001');
registration_check('two_device_limit_on_each_alias',(int)$p->query("SELECT COUNT(*) FROM radcheck WHERE attribute='Simultaneous-Use' AND value='2'")->fetchColumn()===2);
registration_check('unpaid_only',(int)$p->query("SELECT COUNT(*) FROM radusergroup WHERE groupname='HS_NOPAID'")->fetchColumn()===2 && (int)$p->query("SELECT COUNT(*) FROM radreply WHERE value='HS_NOPAID'")->fetchColumn()===2);
registration_check('zero_balance_and_location',(int)$p->query('SELECT balance_cents FROM accounts')->fetchColumn()===0 && $p->query('SELECT last_location_code FROM user_location_profiles')->fetchColumn()==='test');
registration_check('name_saved',$p->query('SELECT firstname FROM userinfo')->fetchColumn()==='Test');
try {admin_register_account($p,$input+[],$loc);throw new LogicException('expected_duplicate');}catch(RuntimeException $e){registration_check('duplicate_does_not_overwrite',$e->getMessage()==='account_exists');}
registration_check('duplicate_keeps_counts',(int)$p->query('SELECT COUNT(*) FROM accounts')->fetchColumn()===1 && (int)$p->query('SELECT COUNT(*) FROM radcheck')->fetchColumn()===6);
foreach (['phone'=>'name233190000002','password'=>'123','name'=>'X'] as $key=>$bad) {
  $candidate=$input;$candidate['phone']='0190000002';$candidate[$key]=$bad;
  try {admin_register_account($p,$candidate,$loc);throw new LogicException('expected_invalid');}catch(InvalidArgumentException $e){registration_check('invalid_'.$key.'_rejected',true);}
}
$p->exec("CREATE TRIGGER fail_profile BEFORE INSERT ON user_location_profiles WHEN NEW.msisdn='233190000002' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
$input['phone']='0190000002';
try{admin_register_account($p,$input,$loc);throw new LogicException('expected_failure');}catch(PDOException $e){}
registration_check('failure_rolls_back_credentials_wallet_and_name',(int)$p->query('SELECT COUNT(*) FROM radcheck')->fetchColumn()===6 && (int)$p->query('SELECT COUNT(*) FROM accounts')->fetchColumn()===1 && (int)$p->query('SELECT COUNT(*) FROM userinfo')->fetchColumn()===1 && !$p->inTransaction());
echo "Admin registration checks passed ($checks).\n";
