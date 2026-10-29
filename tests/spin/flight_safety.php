<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;$user='233201234567';$other='233201234568';
function verify(bool $yes,string $label): void {global $checks;if(!$yes)throw new RuntimeException('FAIL '.$label);$checks++;}
function denied(callable $fn,string $code): void {try{$fn();}catch(SpinError $e){verify($e->errorCode===$code,$code.' got '.$e->errorCode);return;}throw new RuntimeException('Expected '.$code);}
function ref(): string{return bin2hex(random_bytes(16));}
function at(PDO $db,int $ms): void {$db->exec('SET timestamp='.number_format($ms/1000,3,'.',''));}
function fresh(array $overrides=[]): array {
  $db=spin_test_db();spin_test_reset($db);$game=spin_test_activate($db);
  flight_test_rules($db,$overrides+['zero_bps'=>0,'min_move_pct'=>2,'max_move_pct'=>2]);
  spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
  $db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();return [$db,$game];
}
$r=FlightMath::defaults();
verify(abs(FlightMath::openingExpectation(5000,10000,$r)-4678.75)<1e-8,'default first-offer expectation is 93.575%');
// Exact drift check covers integer rounding, weighted movements, upper clipping and peak rebounds.
foreach([
  array_replace($r,['zero_bps'=>0]),
  array_replace($r,['zero_bps'=>0,'distribution'=>'weighted','weights'=>[10=>7,40=>1]]),
  array_replace($r,['zero_bps'=>150])
] as $rules) {
  FlightMath::assertSafeRules($rules);
  for($value=1;$value<=2000;$value++)verify(FlightMath::transitionExpectation($value,2000,2000,$rules)<=$value+1e-8,'no positive expected gain after any revealed value');
}
denied(fn()=>FlightMath::assertSafeRules(array_replace($r,['movement_model'=>'legacy','up_bps'=>5001])),'unsafe_rules');
// Deliberately always-up RNG for the model only: peaks still cannot plateau.
$up=static fn(int $lo,int $hi):int=>$hi===10000?1:$lo;
$peakRules=array_replace($r,['zero_bps'=>0,'min_move_pct'=>40,'max_move_pct'=>40,'steps'=>8]);
foreach([1000,1500,3000] as $step) {
  $peakRules['step_ms']=$step;$f=FlightMath::flight(1000,2000,$peakRules,$up);$found=false;
  foreach($f['path'] as $index=>$value) {
    if($value!==2000)continue;$found=true;
    $expiry=$f['offsets'][$index+1]??$peakRules['steps']*$step;
    verify($expiry-$f['offsets'][$index]<=1000,'peak dwell at most one second');
    if(isset($f['path'][$index+1]))verify($f['path'][$index+1]<2000,'the next return falls from 2x');
  }
  verify($found && $f['path'][0]===FlightMath::openingAmount(1000,2000,$peakRules),'2x remains reachable after a below-stake opening');
}
for($stake=1;$stake<=1000;$stake++)verify(FlightMath::path($stake,2*$stake,$r,$up)[0]<$stake,'no opening tie or profit for any integer stake');
[$db,$game]=fresh();$before=(int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn();
denied(fn()=>flight_test_rules($db,['up_bps'=>10000]),'invalid_rules');
verify((int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn()===$before,'unsafe admin change fully rolls back');
// Full commitment binds timing, ownership and all financial terms, not just the amounts.
foreach(['start_ms','return_cap_cents','schedule_json','msisdn'] as $field) {
  [$db,$game]=fresh();$v=$game->startFlight($user,1000,ref());$original=$db->query("SELECT * FROM flight_rounds WHERE id='".$v['id']."'")->fetch();
  $changed=match($field){'start_ms'=>(int)$original[$field]-1000,'return_cap_cents'=>(int)$original[$field]+1,'schedule_json'=>'[0,100,200,300]','msisdn'=>$other};
  $st=$db->prepare('UPDATE flight_rounds SET '.$field.'=? WHERE id=?');$st->execute([$changed,$v['id']]);
  denied(fn()=>$game->activeFlight($field==='msisdn'?$other:$user,$v['id']),'round_integrity');
  verify((int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$user'")->fetchColumn()===99000,'tampering cannot produce any payment');
}
// Lazy polling and a repeated start never extend an issued offer.
[$db,$game]=fresh();$key=ref();$v=$game->startFlight($user,1000,$key);$expiry=$v['offer']['expires_ms'];
at($db,$v['start_ms']+200);$again=$game->startFlight($user,1000,$key);
verify($again['offer']['expires_ms']===$expiry && $again['offer']['id']===$v['offer']['id'],'poll/replay cannot renew price');
at($db,$expiry);denied(fn()=>$game->collectFlight($user,$v['id'],$v['offer']['id'],ref()),'offer_expired');
// Find a real peak under approved RNG/rules; settle neither early nor at a clipped substitute value.
[$db,$game]=fresh(['min_move_pct'=>40,'max_move_pct'=>40,'steps'=>8,'step_ms'=>3000]);
$peak=false;
for($attempt=0;$attempt<128;$attempt++) {
  $v=$game->startFlight($user,1000,ref());$row=$db->query("SELECT * FROM flight_rounds WHERE id='".$v['id']."'")->fetch();
  $path=json_decode($row['path_json'],true);$offsets=json_decode($row['schedule_json'],true);$peak=array_search(2000,$path,true);
  if($peak!==false && $offsets[$peak]+1100<24000)break;
  at($db,$v['end_ms']+100);$game->settleExpiredFlights();$game->watchdog();$game->monitor();
}
verify($peak!==false,'actual RNG can reach 2x under safe rules');
at($db,$v['start_ms']+$offsets[$peak]+20);$top=$game->activeFlight($user,$v['id']);
verify($top['offer']['amount_cents']===2000 && $top['offer']['expires_ms']===$v['start_ms']+$offsets[$peak]+1000,'peak is a real one-second offer');
verify(count($top['history'])===$peak+1 && count($top['history_ms'])===$peak+1,'future rebounds/timings stay private');
at($db,$top['offer']['expires_ms']);denied(fn()=>$game->collectFlight($user,$v['id'],$top['offer']['id'],ref()),'offer_expired');
$dip=$game->activeFlight($user,$v['id']);verify($dip['offer']['amount_cents']<2000,'2x offer ends even if nobody polls');
verify($dip['end_ms']===$v['end_ms'],'future peaks cannot be inferred from a shortened deadline');
$settled=$game->collectFlight($user,$v['id'],$dip['offer']['id'],ref());
verify((int)$settled['receipt']['payout_cents']===$dip['offer']['amount_cents'],'only the selected current offer pays');
verify($game->reconcile()['ok'],'peak schedule and collection audit reconcile');
// Pending-capacity retries must not starve overdue ordinary settlements.
[$db,$game]=fresh();$a=$game->startFlight($user,1000,ref());
$db->exec("UPDATE accounts SET balance_cents=2147483647 WHERE msisdn='$user'");
$pending=$game->collectFlight($user,$a['id'],$a['offer']['id'],ref());
verify($pending['status']==='PAYOUT_PENDING','pending capacity fixture');
$b=$game->startFlight($other,1000,ref());at($db,$b['end_ms']+100);
$game->settleExpiredFlights(1);
verify($db->query("SELECT status FROM flight_rounds WHERE id='".$b['id']."'")->fetchColumn()==='SETTLED','overdue flight precedes old pending-capacity retry');
verify($game->reconcile()['ok'],'pending/overdue scheduling remains balanced');
echo "PASS $checks safety checks; exact drift, peak deadlines, tampering, nonrenewable offers and settlement priority.\n";
