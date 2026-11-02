<?php
declare(strict_types=1);
if (strpos((string)getenv('SPIN_TEST_DSN'),'mysql:host=127.0.0.1;port=33079;dbname=nister_spin_test;')!==0) throw new RuntimeException('Loopback portal fixture required');
$_SERVER['DOCUMENT_ROOT']=(string)getenv('SPIN_TEST_RUNTIME');
require __DIR__.'/../spin/bootstrap.php';
$db=spin_test_db();
require_once __DIR__.'/../../pay-portal/lib/location.php';
require_once __DIR__.'/../../pay-portal/lib/referrals.php';
$GLOBALS['PDO']=$db;
$action=$argv[1] ?? 'prepare';
if ($action==='prepare') {
  location_bootstrap(); referrals_bootstrap_tables();
  foreach (['SMS_ENABLED','SMS_PILOSMS_ENABLED','SMS_MNOTIFY_ENABLED','SMS_ARKESEL_ENABLED'] as $key) settings_set($key,'0');
  nister_rate_limit_clear('signup_ip','127.0.0.1');
  for ($i=1;$i<=9;$i++) nister_rate_limit_clear('signup_phone','23319000000'.$i);
  $db->exec("CREATE TRIGGER fixture_default_unpaid AFTER INSERT ON radcheck FOR EACH ROW
    BEGIN
      IF NEW.attribute='Cleartext-Password' AND NOT EXISTS (SELECT 1 FROM radusergroup WHERE username IN (NEW.username,CONCAT('0',SUBSTRING(NEW.username,4)))) THEN
        INSERT INTO radusergroup(username,groupname,priority) VALUES(NEW.username,'HS_NOPAID',1);
      END IF;
    END");
  echo "{}\n";
} elseif ($action==='pause' || $action==='resume') {
  settings_set('SMS_ENABLED',$action==='resume'?'1':'0');echo "{}\n";
} elseif ($action==='token') {
  $token=str_repeat('e',64);$user=$argv[2] ?? '';
  if (!preg_match('/^23319000000[1-9]$/D',$user)) throw new RuntimeException('Fixture phone required');
  $db->prepare('INSERT INTO signup_otp_sessions(token,msisdn,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE consumed_at=NULL,msisdn=VALUES(msisdn),expires_at=VALUES(expires_at)')->execute([$token,$user]);
  echo json_encode(['token'=>$token]);
} elseif ($action==='account') {
  $user=$argv[2] ?? '';if (!preg_match('/^23319000000[1-9]$/D',$user)) throw new RuntimeException('Fixture phone required');
  $variants=[$user,'0'.substr($user,3)];$counts=[];
  foreach (['radcheck'=>'username','radusergroup'=>'username','accounts'=>'msisdn'] as $table=>$column) {
    $st=$db->prepare('SELECT COUNT(*) FROM '.$table.' WHERE '.$column.' IN (?,?)');$st->execute($variants);$counts[$table]=(int)$st->fetchColumn();
  }
  $st=$db->prepare('SELECT balance_cents FROM accounts WHERE msisdn=?');$st->execute([$user]);$counts['balance']=$st->fetchColumn();
  $counts['otp_challenges']=(int)$db->query('SELECT COUNT(*) FROM signup_otp_challenges')->fetchColumn();
  echo json_encode($counts);
} else throw new RuntimeException('Unknown fixture action');
