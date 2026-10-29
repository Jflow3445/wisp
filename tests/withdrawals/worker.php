<?php
declare(strict_types=1);
require __DIR__.'/../spin/bootstrap.php';require __DIR__.'/../../pay-portal/lib/withdrawals.php';
try {
  $service=new WalletWithdrawals(spin_test_db());$task=json_decode($argv[1],true,16,JSON_THROW_ON_ERROR);
  $result=$task['kind']==='request'?$service->request($task['user'],$task['input']):$service->decide('operator',$task['input']);
  echo json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR);
}catch(Throwable $e){echo json_encode(['ok'=>false,'error'=>$e instanceof WithdrawalError?$e->errorCode:get_class($e)]);}
