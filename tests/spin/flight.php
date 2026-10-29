<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;$u='233201234567';$other='233201234568';
function check(bool $yes,string $why): void {global $checks;if(!$yes)throw new RuntimeException('FAIL '.$why);$checks++;}
function rejects(callable $fn,string $code): void {try{$fn();}catch(SpinError $e){check($e->errorCode===$code,'expected '.$code.', got '.$e->errorCode);return;}throw new RuntimeException('Expected '.$code);}
function keyref(): string{return bin2hex(random_bytes(16));}
function fixture(array $rules=[],int $pool=100000): array {
  $db=spin_test_db();spin_test_reset($db);$game=spin_test_activate($db);
  flight_test_rules($db,$rules+['zero_bps'=>0,'min_move_pct'=>2,'max_move_pct'=>2]);
  if($pool)spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>$pool]);
  $db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();return [$db,$game];
}
function concurrent(array $tasks): array {
  $jobs=[];foreach($tasks as $task){$pipes=[];$p=proc_open([PHP_BINARY,'-d','extension=pdo_mysql',__DIR__.'/worker.php',json_encode($task)], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);fclose($pipes[0]);$jobs[]=[$p,$pipes];}
  $out=[];foreach($jobs as [$p,$pipes]){$out[]=json_decode(stream_get_contents($pipes[1]),true,512,JSON_THROW_ON_ERROR);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);proc_close($p);if($err)fwrite(STDERR,$err);}return $out;
}
// Integer ceilings and mathematically bounded paths, including upward/downward reversals.
$rules=FlightMath::rules(FlightMath::defaults());
check(FlightMath::returnAmounts(5000,9306)===['stake_cents'=>5000,'stake_returned_cents'=>5000,'profit_cents'=>4306,'loss_cents'=>0,'total_return_cents'=>9306],'50 stake plus 43.06 profit returns 93.06');
check(FlightMath::returnAmounts(5000,2491)===['stake_cents'=>5000,'stake_returned_cents'=>2491,'profit_cents'=>0,'loss_cents'=>2509,'total_return_cents'=>2491],'24.91 return is a 25.09 loss, not a win');
check(FlightMath::walletMovement(57218,5000,2491,54709)['other_activity_cents']===0,'reported loss receipt balances exactly');
check(FlightMath::walletMovement(34821,5000,9306,39127)['other_activity_cents']===0,'recorded 43.06 profit increases the pre-stake wallet by 43.06');
check(FlightMath::walletMovement(57218,5000,9306,61524)['after_cents']===57218+4306,'stake principal is included in the total return, never deducted twice');
check(FlightMath::walletMovement(57218,5000,9306,59524)['other_activity_cents']===-2000,'other wallet purchases are shown separately from game profit/loss');
foreach([0,2491,5000,9306,10000] as $return) {
  $parts=FlightMath::returnAmounts(5000,$return);
  check($parts['stake_returned_cents']+$parts['profit_cents']===$return,'principal plus profit equals total paid back');
  check($parts['stake_returned_cents']+$parts['loss_cents']===5000,'recovered stake plus loss equals original stake');
}
check(FlightMath::cap(15000,100000,0,1000)===10000,'10% caps entire return on a high stake');
check(FlightMath::cap(1000,100000,0,1000)===2000,'2x cap');
check(FlightMath::cap(1000,999,0,1000)===99,'pool cap floors to pesewa');
rejects(fn()=>FlightMath::rules(array_replace($rules,['pool_bps'=>1001])),'invalid_input');
for($i=0;$i<200;$i++) {
  $stake=random_int(1,1000000);$cap=random_int(0,2*$stake);$path=FlightMath::path($stake,$cap,$rules);
  check(min($path)>=0 && max($path)<=$cap && count($path)<=2*$rules['steps'],'all generated movements respect gross envelope');
  check($path[0]<$stake,'opening never grants an instant profit or tie');
}
$r=array_replace($rules,['zero_bps'=>0]);
for($x=1;$x<=300;$x++)check(FlightMath::openingExpectation($x,2*$x,$r)<=$x+1e-8,'rounding preserves nonpositive conditional drift');
$analysis=FlightMath::preview(1000,2000,$rules,2000);
check($analysis['opening_return_pct']<100 && count($analysis['policies'])===4,'stopping policy preview, not a false fixed win rate');
// 150 held, collect the new 95 opening, wallet 945, pool gains 55.
[$db,$game]=fixture();$key=keyref();$view=$game->startFlight($u,15000,$key);
check($view['wallet_cents']===85000 && $view['held_cents']===15000,'immediate hold outside spendable wallet');
check((int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn()===100000,'held stake not prematurely pooled');
check($view['offer']['amount_cents']===9500,'displayed payable partial return');
check(!array_intersect_key($view,array_flip(['path_json','schedule_json','schedule_hash','path_hash','terminal_ms','return_cap_cents'])) && count($view['history'])===1 && $view['history_ms']===[0],'no future path, schedule or zero deadline disclosed');
$repeat=$game->startFlight($u,15000,$key);check($repeat['id']===$view['id'],'start retry same round');
rejects(fn()=>$game->startFlight($u,15001,$key),'idempotency_conflict');
rejects(fn()=>$game->startFlight($u,1000,keyref()),'flight_in_progress');
rejects(fn()=>$game->activeFlight($other,$view['id']),'round_not_found');
rejects(fn()=>$game->collectFlight($other,$view['id'],$view['offer']['id'],keyref()),'round_not_found');
$collectKey=keyref();$settled=$game->collectFlight($u,$view['id'],$view['offer']['id'],$collectKey);
check($settled['status']==='SETTLED' && $settled['wallet_cents']===94500 && $settled['held_cents']===0,'only total return credited');
check((int)$settled['receipt']['pool_after_cents']===105500,'pool receives only actual loss 55');
check($settled['receipt']['end_reason']==='collected' && count($settled['history'])===1,'collection locks value and hides unused future path');
$again=$game->collectFlight($u,$view['id'],$view['offer']['id'],$collectKey);
check($again['receipt']===$settled['receipt'],'collection idempotent');
check((int)$db->query("SELECT COUNT(*) FROM ledger WHERE type='flight_return'")->fetchColumn()===1,'one return ledger entry');
check($game->reconcile()['ok'],'partial-return audit reconciles');
// Expired offer is rejected rather than accepting a different value.
[$db,$game]=fixture();$v=$game->startFlight($u,1000,keyref());
$db->exec('SET timestamp='.(intdiv($v['offer']['expires_ms'],1000)+1));
rejects(fn()=>$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref()),'offer_expired');
$next=$game->activeFlight($u,$v['id']);check($next['offer']['id']!==$v['offer']['id'] && $next['offer']['amount_cents']<980,'new quote is a separate deliberate choice');
check($game->reconcile()['ok'],'expired collect makes no financial change');
// Closed browser: final nonzero value auto settles once; ghosting cannot block obligations.
spin_test_admin($game,$db,['action'=>'state','state'=>'GHOSTED']);
$db->exec('SET timestamp='.(intdiv($v['end_ms'],1000)+1));
check($game->settleExpiredFlights()===1,'background settles abandoned flight');
$end=$game->activeFlight($u,$v['id']);check($end['status']==='SETTLED' && $end['receipt']['end_reason']==='completed','automatic ending pays final value while ghosted');
check($game->settleExpiredFlights()===0 && $game->reconcile()['ok'],'automatic settlement exactly once');
// Zero ends immediately and only then sends all the held stake to the pool.
[$db,$game]=fixture(['zero_bps'=>10000]);$v=$game->startFlight($u,1000,keyref());
check($v['status']==='SETTLED' && $v['wallet_cents']===99000 && (int)$v['receipt']['payout_cents']===0,'zero is full loss');
check((int)$v['receipt']['pool_after_cents']===101000 && $game->reconcile()['ok'],'full loss goes to pool');
[$db,$game]=fixture([],0);$v=$game->startFlight($u,15000,keyref());
check($v['status']==='SETTLED' && $v['wallet_cents']===85000 && (int)$v['receipt']['pool_after_cents']===15000,'empty pool does not reject high stake or invent a return');
// Find an actual funded 2x peak under safe rules, without substituting a production RNG.
[$db,$game]=fixture(['min_move_pct'=>100,'max_move_pct'=>100,'steps'=>4,'step_ms'=>1000]);
for($attempt=0;$attempt<64;$attempt++) {
  $beforeCash=(int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn();
  $beforePool=(int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn();
  $v=$game->startFlight($u,1000,keyref());$row=$db->query("SELECT path_json,schedule_json FROM flight_rounds WHERE id='".$v['id']."'")->fetch();
  $path=json_decode($row['path_json'],true);$offsets=json_decode($row['schedule_json'],true);$peak=array_search(2000,$path,true);
  if($peak!==false)break;
  $db->exec('SET timestamp='.(intdiv($v['end_ms'],1000)+1));$game->settleExpiredFlights();$game->watchdog();$game->monitor();
}
check($peak!==false,'2x remains reachable under safe probabilities');
$db->exec('SET timestamp='.number_format(($v['start_ms']+$offsets[$peak]+100)/1000,3,'.',''));
$v=$game->activeFlight($u,$v['id']);check($v['status']==='ACTIVE' && $v['offer']['amount_cents']===2000,'2x displayed and collectable');
$s=$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref());check($s['wallet_cents']===$beforeCash+1000 && (int)$s['receipt']['pool_after_cents']===$beforePool-1000,'profit funded from pool');
check($s['amounts']['stake_returned_cents']===1000 && $s['amounts']['profit_cents']===1000 && $s['amounts']['total_return_cents']===2000,'real 2x payment returns the full stake and profit');
check($s['wallet_movement']['before_cents']===$beforeCash && $s['wallet_movement']['after_cents']===$beforeCash+1000 && $s['wallet_movement']['other_activity_cents']===0,'receipt shows the complete real-money movement for a win');
// Transactions roll back a failed settlement after wallet and receipt writes.
[$db,$game]=fixture();$v=$game->startFlight($u,1000,keyref());
$db->exec("CREATE TRIGGER flight_failure BEFORE INSERT ON spin_pool_movements FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected settlement failure'");
$failed=false;try{$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref());}catch(PDOException $e){$failed=true;}
check($failed,'injected settlement failed');$db->exec('DROP TRIGGER flight_failure');
$after=$game->activeFlight($u,$v['id']);check($after['status']==='ACTIVE' && $after['wallet_cents']===99000,'failed settlement preserves hold and offer');
check((int)$db->query('SELECT COUNT(*) FROM flight_collect_requests')->fetchColumn()===0,'failed collect request rolled back');
$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref());check($game->reconcile()['ok'],'retry completes after write failure');
// Multiple real PHP processes serialize reservations and duplicate collections.
[$db,$game]=fixture();$tasks=[];foreach([$u,$other] as $user)$tasks[]=['kind'=>'flight_start','user'=>$user,'stake'=>1000,'key'=>keyref()];
$started=concurrent($tasks);check($started[0]['ok'] && $started[1]['ok'],'concurrent starts both funded');
check((int)$db->query("SELECT SUM(return_cap_cents) FROM flight_rounds WHERE status='ACTIVE'")->fetchColumn()===4000,'shared reservations accounted');
rejects(fn()=>spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>-70000]),'pool_reserved');
$v=$started[0]['result'];$task=['kind'=>'flight_collect','user'=>$u,'id'=>$v['id'],'offer'=>$v['offer']['id'],'key'=>keyref()];
$out=concurrent([$task,$task]);check($out[0]['ok'] && $out[1]['ok'] && $out[0]['result']['receipt']===$out[1]['result']['receipt'],'duplicate concurrent Stop pays once');
check($game->reconcile()['ok'],'concurrent active/settled balances reconcile');
[$db,$game]=fixture();$started=concurrent([
 ['kind'=>'flight_start','user'=>$u,'stake'=>15000,'key'=>keyref()],
 ['kind'=>'flight_start','user'=>$other,'stake'=>15000,'key'=>keyref()]]);
check(count(array_filter($started,fn($r)=>$r['ok']))===2,'funding ceiling never rejects an otherwise valid stake');
check(count(array_filter($started,fn($r)=>$r['result']['status']==='SETTLED' && (int)$r['result']['receipt']['payout_cents']===0))===1,'occupied allowance permits a zero return without overreserving');
check($game->reconcile()['ok'],'zero-envelope admission preserves pool and escrow');
// Wallet receives other deposits during flight: exact return is held, never truncated/lost.
[$db,$game]=fixture();$v=$game->startFlight($u,1000,keyref());
$db->exec("UPDATE accounts SET balance_cents=2147483647 WHERE msisdn='$u'");
$s=$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref());check($s['status']==='PAYOUT_PENDING' && (int)$s['receipt']['payout_cents']===950,'capacity keeps accepted full return');
check($game->reconcile()['ok'],'pending payout retains funded envelope and stake');
$db->exec("UPDATE accounts SET balance_cents=100000 WHERE msisdn='$u'");$game->settleExpiredFlights();
$s=$game->activeFlight($u,$v['id']);check($s['status']==='SETTLED' && $s['wallet_cents']===100950,'capacity retry credits exact accepted amount');
check($game->reconcile()['ok'],'deferred capacity payout reconciles');
// Stored paths cannot be replaced even if an attacker recomputes their plain hash.
[$db,$game]=fixture();$v=$game->startFlight($u,1000,keyref());$game->collectFlight($u,$v['id'],$v['offer']['id'],keyref());
$db->exec("UPDATE spin_postings SET account='unexpected_account' WHERE journal_ref LIKE 'FLT-%' AND account='customer_cash_liability'");
check(in_array('flight_journal_mismatch',$game->reconcile()['errors'],true),'balanced but relabeled posting is detected');
[$db,$game]=fixture();$v=$game->startFlight($u,1000,keyref());$changed='[1,1,1,1,1,1,1,1]';
$st=$db->prepare('UPDATE flight_rounds SET path_json=?,path_hash=? WHERE id=?');$st->execute([$changed,hash('sha256',$changed),$v['id']]);
check(!$game->reconcile()['ok'],'HMAC commitment detects rehashed path tampering');
echo "PASS $checks flight checks; real escrow, integer caps, exact offers, concurrency, rollback and recovery.\n";
