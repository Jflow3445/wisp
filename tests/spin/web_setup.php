<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$winBps=getenv('SPIN_TEST_WIN_BPS');
$winBps=$winBps===false?10000:filter_var($winBps,FILTER_VALIDATE_INT);
if($winBps===false || $winBps<0 || $winBps>10000) throw new RuntimeException('SPIN_TEST_WIN_BPS must be an integer from 0 to 10000.');
$db=spin_test_db();spin_test_reset($db,false);$game=spin_test_activate($db);spin_test_rules($db,['win_bps'=>$winBps]);
spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();
$runtime=(string)getenv('SPIN_TEST_RUNTIME');
if($runtime==='' || !is_dir($runtime)) throw new RuntimeException('Create SPIN_TEST_RUNTIME outside the repository first.');
$env=spin_test_env()+['PAY_DB_DSN'=>getenv('SPIN_TEST_DSN'),'PAY_DB_USER'=>getenv('SPIN_TEST_USER'),'PAY_DB_PASS'=>getenv('SPIN_TEST_PASS'),
  'RADIUS_DSN'=>getenv('SPIN_TEST_DSN'),'RADIUS_USER'=>getenv('SPIN_TEST_USER'),'RADIUS_PASS'=>getenv('SPIN_TEST_PASS'),
  'APP_ADMIN_USER'=>'operator','APP_ADMIN_PASS_HASH'=>password_hash('test-operator-password',PASSWORD_DEFAULT),'APP_TIMEZONE'=>'UTC',
  'PAYSTACK_ENABLED'=>'0','PAYSTACK_SECRET_KEY'=>'','PAYSTACK_SECRET'=>'','TOPUP_MANUAL_ENABLED'=>'0',
  'COA_PORT'=>'0','COA_SECRET'=>'','COA_SECRET_FILE'=>''];
$lines=[];foreach($env as $k=>$v)$lines[]=$k.'='.$v;
file_put_contents($runtime.'/.env',implode("\n",$lines));
echo "Web fixture ready. Test-only accounts and permissions; no external services.\n";
