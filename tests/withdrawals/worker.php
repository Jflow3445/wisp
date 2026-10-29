<?php
declare(strict_types=1);
require __DIR__.'/../spin/bootstrap.php';require __DIR__.'/../../pay-portal/lib/withdrawals.php';
try {
  $service=new WalletWithdrawals(spin_test_db());$task=json_decode($argv[1],true,16,JSON_THROW_ON_ERROR);
  if($task['kind']==='cycle') {
    echo "READY\n";flush();fgets(STDIN);
    for($i=0;$i<$task['cycles'];$i++) {
      $input=['account_number'=>'0201234567','name'=>'Snapshot Test','network'=>'MTN','amount'=>'100.00','request_key'=>bin2hex(random_bytes(16))];
      $r=$service->request($task['user'],$input);usleep(1000);
      $service->decide('operator',['action'=>'decline','id'=>$r['id'],'reason'=>'Snapshot consistency test']);
    }
    $result=['cycles'=>$task['cycles']];
  } else $result=$task['kind']==='request'?$service->request($task['user'],$task['input']):$service->decide('operator',$task['input']);
  echo json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR);
}catch(Throwable $e){echo json_encode(['ok'=>false,'error'=>$e instanceof WithdrawalError?$e->errorCode:get_class($e)]);}
