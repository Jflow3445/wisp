<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
// Destructive fixture test. bootstrap enforces the isolated database name.
$runtime=(string)getenv('SPIN_TEST_RUNTIME');
$settings=$runtime!==''?env_load($runtime.'/.env'):[];
if(($settings['PAY_DB_DSN']??'')!==getenv('SPIN_TEST_DSN'))throw new RuntimeException('Run web_setup.php in the same isolated runtime before this job test.');
$db=spin_test_db();spin_test_reset($db);$game=spin_test_activate($db);
flight_test_rules($db,['zero_bps'=>0,'min_move_pct'=>20,'max_move_pct'=>20,'steps'=>4,'step_ms'=>1000]);
spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();
$db->exec('SET timestamp='.($game->now()-10));
$round=$game->startFlight('233201234567',1000,bin2hex(random_bytes(16)));
$path=json_decode($db->query('SELECT path_json FROM flight_rounds')->fetchColumn(),true);$expected=$path[count($path)-1];
$db->exec('SET timestamp=0');
if($round['status']!=='ACTIVE')throw new RuntimeException('Expected an unobserved active flight');
$command=[PHP_BINARY,'-d','extension=pdo_mysql','-r','$_SERVER["DOCUMENT_ROOT"]=getenv("SPIN_TEST_RUNTIME"); require $argv[1];',realpath(__DIR__.'/../../pay-portal/cron/flight_settle.php')];
function run_job(array $command): array {
  $pipes=[];$process=proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);
  fclose($pipes[0]);$text=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($process);
  if($code!==0)throw new RuntimeException('Settlement CLI failed: '.$err);
  return json_decode($text,true,512,JSON_THROW_ON_ERROR);
}
$result=run_job($command);
$stored=$db->query('SELECT status,payout_cents FROM flight_rounds')->fetch();
if($result['evaluated']!==1 || $stored['status']!=='SETTLED' || (int)$stored['payout_cents']!==$expected)throw new RuntimeException('CLI did not settle the unattended flight');
if((int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='233201234567'")->fetchColumn()!==99000+$expected)throw new RuntimeException('Wrong unattended return');
if(run_job($command)['evaluated']!==0 || !$game->reconcile()['ok'])throw new RuntimeException('CLI duplicate settlement or audit failure');
echo "PASS settlement CLI: unattended final return, exact wallet credit, duplicate-job safety and reconciliation.\n";
