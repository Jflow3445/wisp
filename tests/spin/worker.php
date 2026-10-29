<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
try {
  $db=spin_test_db(); $game=new SpinService($db,spin_test_env()); $task=json_decode($argv[1],true,512,JSON_THROW_ON_ERROR);
  if($task['kind']==='flight_start') $out=$game->startFlight($task['user'],$task['stake'],$task['key']);
  elseif($task['kind']==='flight_collect') $out=$game->collectFlight($task['user'],$task['id'],$task['offer'],$task['key']);
  elseif($task['kind']==='flight_settle') $out=$game->activeFlight($task['user'],$task['id']);
  elseif($task['kind']==='spin') $out=$game->spin($task['user'],$task['quote'],$task['key']);
  elseif($task['kind']==='pool') $out=$game->admin('operator',$task['input']);
  else $out=$game->redeem($task['user'],$task['plan'],1,$task['key']);
  echo json_encode(['ok'=>true,'result'=>$out],JSON_THROW_ON_ERROR);
} catch(Throwable $e) { echo json_encode(['ok'=>false,'error'=>$e instanceof SpinError?$e->errorCode:get_class($e),'message'=>$e->getMessage()]); }
