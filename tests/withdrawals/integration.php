<?php
declare(strict_types=1);
require __DIR__.'/../spin/bootstrap.php';require __DIR__.'/../../pay-portal/lib/withdrawals.php';require_once __DIR__.'/../../pay-portal/lib/account_access.php';
$db=spin_test_db();spin_test_reset($db);$service=new WalletWithdrawals($db);$user='233201234567';$checks=0;
function verify(bool $condition,string $label): void {global $checks;if(!$condition)throw new RuntimeException($label);$checks++;echo "PASS $label\n";}
function denied(callable $fn,string $code): void {try{$fn();throw new LogicException('expected_'.$code);}catch(WithdrawalError $e){verify($e->errorCode===$code,$code);}}
function input(string $phone='0201234567',string $amount='100.00'): array {return ['account_number'=>$phone,'amount'=>$amount,'name'=>'Test Customer','network'=>'MTN','request_key'=>bin2hex(random_bytes(16))];}
function balance(PDO $db,string $user='233201234567'): int {$s=$db->prepare('SELECT balance_cents FROM accounts WHERE msisdn=?');$s->execute([$user]);return (int)$s->fetchColumn();}
function parallel(array $tasks): array {
  $jobs=[];foreach($tasks as $task){$pipes=[];$process=proc_open([PHP_BINARY,'-d','extension=pdo_mysql',__DIR__.'/worker.php',json_encode($task,JSON_THROW_ON_ERROR)],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);if(!is_resource($process))throw new RuntimeException('worker_start_failed');fclose($pipes[0]);$jobs[]=[$process,$pipes];}
  $out=[];foreach($jobs as [$process,$pipes]){$raw=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($process)!==0)throw new RuntimeException('worker_failed '.$error);$out[]=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}return $out;
}
verify($service->snapshot($user)['minimum_cents']===10000,'initial minimum is GHS 100');
verify($service->snapshot($user)['wallet']['available_cents']===100000,'existing wallet is withdrawable');
denied(fn()=>$service->request($user,input('0201234568')),'account_mismatch');
denied(fn()=>$service->request($user,array_replace(input(),['name'=>''])),'invalid_name');
foreach(['0','-1','1.001','1e4','100,00',10000,[],null] as $bad)denied(fn()=>withdrawal_amount($bad),'invalid_amount');
denied(fn()=>$service->request($user,input('0201234567','99.99')),'minimum_amount');
denied(fn()=>$service->request($user,input('0201234567','1000.01')),'insufficient_funds');
verify(balance($db)===100000,'rejected requests never debit wallet');
$bad=input();$bad['name']=[];denied(fn()=>$service->request($user,$bad),'invalid_name');
$db->prepare("INSERT INTO wallet_promo_grants(msisdn,remaining_cents,status,expires_at) VALUES(?,95000,'active',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))")->execute([$user]);
denied(fn()=>$service->request($user,input()),'insufficient_funds');$db->exec('DELETE FROM wallet_promo_grants');
$request=input();$r=$service->request($user,$request);verify($r['status']==='pending'&&balance($db)===90000,'request atomically holds funds');
verify($service->snapshot($user)['wallet']['held_cents']===10000,'held amount visible separately');
verify($service->request($user,$request)['id']===$r['id']&&balance($db)===90000,'same request retries exactly once');
$conflict=$request;$conflict['amount']='101.00';denied(fn()=>$service->request($user,$conflict),'request_conflict');
denied(fn()=>$service->request($user,input()),'withdrawal_pending');
verify(count($service->snapshot('233201234568')['withdrawals'])===0,'customer histories stay private');
try{account_access_purge($db,$db,$user);throw new LogicException('expected_purge_block');}catch(RuntimeException $e){verify($e->getMessage()==='withdrawal_pending_complete_before_purge','pending withdrawal blocks account deletion');}
verify(balance($db)===90000&&!$db->inTransaction(),'blocked purge preserves funds and transaction state');
denied(fn()=>$service->decide('operator',['id'=>$r['id'],'action'=>'paid','payout_ref'=>'MOMO-TEST-001']),'state_conflict');
$service->configure('operator','150.00');verify($service->minimum()===15000,'admin minimum changes persist');
denied(fn()=>$service->request('233201234568',input('0201234568')),'minimum_amount');
verify($service->request($user,$request)['amount_cents']===10000,'existing request survives minimum change');
$service->decide('operator',['id'=>$r['id'],'action'=>'approve']);$service->decide('operator',['id'=>$r['id'],'action'=>'approve']);
verify(balance($db)===90000&&$service->snapshot($user)['wallet']['held_cents']===10000,'approval and retries never debit again');
denied(fn()=>$service->decide('operator',['id'=>$r['id'],'action'=>'decline','reason'=>'No longer payable']),'state_conflict');
denied(fn()=>$service->decide('operator',['id'=>$r['id'],'action'=>'paid']),'reference_required');
$service->decide('operator',['id'=>$r['id'],'action'=>'paid','payout_ref'=>'momo-test-001']);$service->decide('operator',['id'=>$r['id'],'action'=>'paid','payout_ref'=>'MOMO-TEST-001']);
verify(balance($db)===90000&&$service->snapshot($user)['wallet']['held_cents']===0,'manual payment finalizes hold without a second debit');
verify($service->request($user,$request)['status']==='paid'&&balance($db)===90000,'late retry cannot create a second paid request');
$db->exec("UPDATE app_settings SET v='0' WHERE k='WITHDRAWALS_ENABLED'");denied(fn()=>$service->request($user,input()),'withdrawals_paused');
verify(!$service->snapshot($user)['enabled']&&$service->request($user,$request)['status']==='paid','pausing new requests preserves accepted receipts');$db->exec("UPDATE app_settings SET v='1' WHERE k='WITHDRAWALS_ENABLED'");
verify((int)$db->query("SELECT COUNT(*) FROM wallet_withdrawal_events WHERE withdrawal_id IS NOT NULL")->fetchColumn()===3,'one durable event per transition');
denied(fn()=>$service->decide('operator',['id'=>$r['id'],'action'=>'paid','payout_ref'=>'DIFFERENT']),'state_conflict');
$service->configure('operator','100.00');
$second=$service->request('233201234568',input('0201234568'));$service->decide('operator',['id'=>$second['id'],'action'=>'approve']);
denied(fn()=>$service->decide('operator',['id'=>$second['id'],'action'=>'paid','payout_ref'=>'MOMO-TEST-001']),'reference_used');
verify($service->snapshot('233201234568')['withdrawals'][0]['status']==='approved','duplicate MoMo reference leaves payout held');
$refund=$service->request($user,input());$service->decide('operator',['id'=>$refund['id'],'action'=>'decline','reason'=>'Name does not match MoMo']);$service->decide('operator',['id'=>$refund['id'],'action'=>'decline','reason'=>'Name does not match MoMo']);
verify(balance($db)===90000&&$service->snapshot($user)['wallet']['held_cents']===0,'decline refunds exactly once');
verify((int)$db->query("SELECT SUM(amount_cents) FROM ledger WHERE ref IN ('{$refund['id']}','{$refund['id']}-REFUND')")->fetchColumn()===0,'hold and refund ledger balance to zero');
$db->exec("CREATE TRIGGER withdrawal_fail_event BEFORE INSERT ON wallet_withdrawal_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected withdrawal journal failure'");
$count=(int)$db->query('SELECT COUNT(*) FROM wallet_withdrawals')->fetchColumn();
try{$service->request($user,input());throw new LogicException('expected_failure');}catch(PDOException $e){}
verify(balance($db)===90000&&(int)$db->query('SELECT COUNT(*) FROM wallet_withdrawals')->fetchColumn()===$count&&!$db->inTransaction(),'journal failure rolls back request and wallet debit');$db->exec('DROP TRIGGER withdrawal_fail_event');
$capacity=$service->request($user,input());$db->prepare('UPDATE accounts SET balance_cents=2147483647 WHERE msisdn=?')->execute([$user]);
denied(fn()=>$service->decide('operator',['id'=>$capacity['id'],'action'=>'decline','reason'=>'Capacity retry test']),'wallet_capacity');
verify($service->snapshot($user)['withdrawals'][0]['status']==='pending','capacity failure retains accepted hold');$db->prepare('UPDATE accounts SET balance_cents=80000 WHERE msisdn=?')->execute([$user]);$service->decide('operator',['id'=>$capacity['id'],'action'=>'decline','reason'=>'Capacity now available']);
$same=input();$jobs=parallel([['kind'=>'request','user'=>$user,'input'=>$same],['kind'=>'request','user'=>$user,'input'=>$same]]);
verify($jobs[0]['ok']&&$jobs[1]['ok']&&$jobs[0]['result']['id']===$jobs[1]['result']['id']&&balance($db)===80000,'concurrent retries create one hold');
$id=$jobs[0]['result']['id'];$tasks=array_fill(0,2,['kind'=>'decide','input'=>['action'=>'decline','id'=>$id,'reason'=>'Concurrent refund test']]);$jobs=parallel($tasks);
verify($jobs[0]['ok']&&$jobs[1]['ok']&&balance($db)===90000,'concurrent declines refund once');
$jobs=parallel([['kind'=>'request','user'=>$user,'input'=>input()],['kind'=>'request','user'=>$user,'input'=>input()]]);
verify(count(array_filter($jobs,fn($v)=>$v['ok']))===1&&balance($db)===80000,'concurrent distinct requests cannot reserve twice');
$active=$service->snapshot($user)['withdrawals'][0];$service->decide('operator',['id'=>$active['id'],'action'=>'decline','reason'=>'Concurrency test complete']);
$game=spin_test_activate($db);spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);flight_test_rules($db,['zero_bps'=>0]);$db->exec('SET timestamp=0');$game->watchdog();$game->monitor();
$flight=$game->startFlight($user,5000,bin2hex(random_bytes(16)));$service->request($user,input());verify($game->monitor()['ok'],'withdrawal hold coexists with flight reconciliation');
$game->collectFlight($user,$flight['id'],$flight['offer']['id'],bin2hex(random_bytes(16)));verify($game->monitor()['ok'],'flight settlement remains valid after withdrawal hold');
echo "Withdrawal integration checks passed ($checks).\n";
