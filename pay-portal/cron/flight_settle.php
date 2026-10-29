<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/spin/service.php';
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
try{
  $env=app_boot();$game=new SpinService(db_pdo($env),$env);
  echo json_encode(['module'=>'flight','event'=>'settlement_job','evaluated'=>$game->settleExpiredFlights(200)],JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $e){error_log(json_encode(['module'=>'flight','event'=>'settlement_job_failed','class'=>get_class($e)]));exit(1);}
