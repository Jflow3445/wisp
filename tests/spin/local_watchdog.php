<?php
declare(strict_types=1);
// Local test process, never a production scheduler or an administrator-login heartbeat.
if(PHP_SAPI!=='cli') { http_response_code(404);exit; }
require __DIR__.'/bootstrap.php';
$db=spin_test_db();$game=new SpinService($db,spin_test_env());$lastReconcile=0;$lastWatchdog=0;
while(true) {
  try {
    $now=$game->now();$game->settleExpiredFlights();
    if($now-$lastWatchdog>=30){$state=$game->watchdog();$lastWatchdog=$now;}
    if($now-$lastReconcile>=600) {
      $report=$game->monitor();$lastReconcile=$now;
      echo json_encode(['local'=>true,'state'=>$state['state'],'reconciliation_ok'=>$report['ok']]).PHP_EOL;
    }
  } catch(Throwable $e) {
    fwrite(STDERR,'Local watchdog error: '.get_class($e).PHP_EOL);
  }
  sleep(1);
}
