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
set_error_handler(static function(){throw new ErrorException('Malformed field emitted a PHP warning');});
foreach(['account_number','network','request_key'] as $field) foreach([[],true,123,null] as $badValue) {
  denied(fn()=>$service->request($user,array_replace(input(),[$field=>$badValue])),'invalid_field');
}
restore_error_handler();
$bad=input();$bad['name']=[];denied(fn()=>$service->request($user,$bad),'invalid_name');
$db->prepare("INSERT INTO wallet_promo_grants(msisdn,remaining_cents,status,expires_at) VALUES(?,95000,'active',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))")->execute([$user]);
denied(fn()=>$service->request($user,input()),'insufficient_funds');$db->exec('DELETE FROM wallet_promo_grants');
$request=input();$r=$service->request($user,$request);verify($r['status']==='pending'&&balance($db)===90000,'request atomically holds funds');
set_error_handler(static function(){throw new ErrorException('Malformed admin field emitted a PHP warning');});
foreach(['id','action','reason','payout_ref'] as $field) denied(fn()=>$service->decide('operator',array_replace(['id'=>$r['id'],'action'=>'approve'],[$field=>[]])),'invalid_field');
restore_error_handler();
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

// A deleted account's retained audit receipts must not become a new account's history.
spin_test_reset($db);$service=new WalletWithdrawals($db);$oldBody=input();$old=$service->request($user,$oldBody);
$service->decide('operator',['id'=>$old['id'],'action'=>'approve']);$service->decide('operator',['id'=>$old['id'],'action'=>'paid','payout_ref'=>'PURGE-PAID-001']);
$declined=$service->request($user,input());$service->decide('operator',['id'=>$declined['id'],'action'=>'decline','reason'=>'Before account deletion']);
$db->exec("CREATE TRIGGER withdrawal_purge_failure BEFORE DELETE ON accounts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected purge failure'");
try{account_access_purge($db,$db,$user);throw new LogicException('expected_purge_failure');}catch(PDOException $e){}
$db->exec('DROP TRIGGER withdrawal_purge_failure');
verify(count($service->snapshot($user)['withdrawals'])===2&&(int)$db->query("SELECT COUNT(*) FROM wallet_withdrawal_events WHERE event='account_purged'")->fetchColumn()===0,'failed purge rolls back customer history archival');
account_access_purge($db,$db,$user);
verify($service->decide('operator',['id'=>$old['id'],'action'=>'paid','payout_ref'=>'PURGE-PAID-001'])['status']==='paid','paid receipt retries survive account deletion');
verify($service->decide('operator',['id'=>$declined['id'],'action'=>'decline','reason'=>'Before account deletion'])['status']==='declined','refund receipt retries survive account deletion');
$db->prepare('INSERT INTO accounts(msisdn,balance_cents) VALUES(?,50000)')->execute([$user]);
verify($service->snapshot($user)['withdrawals']===[],'new registration cannot see a deleted account history');
denied(fn()=>$service->request($user,$oldBody),'request_conflict');
$new=$service->request($user,input());verify(balance($db)===40000&&count($service->snapshot($user)['withdrawals'])===1,'new registration can create its own withdrawal');
verify($service->queue('all','',0)['total']===3,'administration retains archived payout and refund receipts');

// Every snapshot must describe one committed state while another process holds/refunds.
spin_test_reset($db);$service=new WalletWithdrawals($db);$pipes=[];
$process=proc_open([PHP_BINARY,'-d','extension=pdo_mysql',__DIR__.'/worker.php',json_encode(['kind'=>'cycle','user'=>$user,'cycles'=>35])],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
if(!is_resource($process)||trim((string)fgets($pipes[1]))!=='READY')throw new RuntimeException('snapshot_worker_failed');
fwrite($pipes[0],"GO\n");fclose($pipes[0]);$consistent=true;
for($i=0;$i<100;$i++) {
  $snapshot=$service->snapshot($user);$consistent=$consistent&&$snapshot['wallet']['balance_cents']+$snapshot['wallet']['held_cents']===100000;
  $queue=$service->queue('all','',0);$sum=array_sum(array_map(fn($v)=>in_array($v['status'],['pending','approved'],true)?$v['amount_cents']:0,$queue['rows']));
  $consistent=$consistent&&$sum===$queue['held_cents']&&count($queue['rows'])===$queue['total'];
}
$result=json_decode(stream_get_contents($pipes[1]),true,16,JSON_THROW_ON_ERROR);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);
verify(proc_close($process)===0&&$result['ok']&&$consistent,'wallet and queue snapshots stay consistent during concurrent holds and refunds');
verify(balance($db)===100000,'snapshot stress test conserves the full wallet balance');
spin_test_reset($db);$game=spin_test_activate($db);spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);flight_test_rules($db,['zero_bps'=>0,'step_ms'=>3000]);$db->exec('SET timestamp=0');$game->watchdog();$game->monitor();
$flight=$game->startFlight($user,5000,bin2hex(random_bytes(16)));
try{account_access_purge($db,$db,$user);throw new LogicException('expected_game_guard');}catch(RuntimeException $e){verify($e->getMessage()==='game_financial_history_prevents_purge','active Flight funds prevent account deletion');}
verify(balance($db)===95000&&$game->monitor()['ok'],'blocked account deletion preserves active Flight wallet and audit');
$game->collectFlight($user,$flight['id'],$flight['offer']['id'],bin2hex(random_bytes(16)));
try{account_access_purge($db,$db,$user);throw new LogicException('expected_game_guard');}catch(RuntimeException $e){verify($e->getMessage()==='game_financial_history_prevents_purge','completed Flight receipts keep their reconciliation ledger');}
verify($game->monitor()['ok'],'account administration cannot invalidate settled Flight reconciliation');
echo "Withdrawal integration checks passed ($checks).\n";
