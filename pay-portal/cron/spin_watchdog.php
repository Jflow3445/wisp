<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/spin/service.php';
if(PHP_SAPI!=='cli') { http_response_code(404); exit; }
try {
  $env=app_boot(); $db=db_pdo($env); $game=new SpinService($db,$env);
  $state=$game->watchdog();
  $game->settleExpiredFlights();
  // Quotes are not financial records. Keep every quote referenced by a committed receipt.
  $db->exec("DELETE q FROM spin_quotes q LEFT JOIN spin_spins s ON s.quote_id=q.id WHERE s.id IS NULL AND q.expires_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)");
  $health=in_array('--reconcile',$argv,true)?$game->monitor():null;
  $metric=['module'=>'spin','event'=>'watchdog','state'=>$state['state'],'healthy'=>$health['ok']??null,
    'pool_cents'=>$state['pool_cents'],'reconciliation'=>$health];
  echo json_encode($metric,JSON_THROW_ON_ERROR).PHP_EOL;
  if($health!==null && !$health['ok']) {
    require_once __DIR__.'/../lib/alerts.php';
    alerts_insert($db,gmdate('Y-m-d H:i:s'),'spin_reconciliation',null,'Spin reconciliation failed: '.implode(',',$health['errors']),null);
    exit(1);
  }
} catch(Throwable $e) {
  error_log(json_encode(['module'=>'spin','event'=>'watchdog_failed','class'=>get_class($e)])); exit(1);
}
