<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;
function verify(bool $ok,string $label): void {global $checks;if(!$ok)throw new RuntimeException('FAIL '.$label);$checks++;}
function ref(): string{return bin2hex(random_bytes(16));}
$r=FlightMath::rules(FlightMath::defaults());
verify($r['movement_model']==='balanced' && !array_key_exists('up_bps',$r),'new profiles derive direction rather than stacking a fixed downward bias');
// Prove each actual integer draw preserves expectation, including clipped offers and zero events.
// Numerator + down*survival = current*10000; denominator = (up-down)*survival.
// These identities imply E(next | current, chosen movement) = current exactly.
foreach([0,150,2500,10000] as $hazard)foreach([2,99,2000,2147483647] as $cap) {
  $rules=array_replace($r,['zero_bps'=>$hazard]);
  $values=array_unique([1,min(2,$cap-1),intdiv($cap,2),$cap-1]);
  if($cap===2000)$values=array_merge($values,range(1,1999,7));
  foreach($values as $value)foreach([1,2,10,25,40,99,100] as $pct) {
    $t=FlightMath::balancedTransition($value,$cap,$pct,$rules);$survival=10000-$t['zero_bps'];
    verify($t['up']>$value && $t['down']<$value && $t['up']<=$cap && $t['down']>=0,'ordinary outcomes genuinely move within the envelope');
    verify($survival>0 && $t['up_numerator']>=0 && $t['up_numerator']<=$t['up_denominator'],'up/down probability is feasible after the funded zero hazard');
    verify($t['up_numerator']+$t['down']*$survival===$value*10000 && $t['up_denominator']===($t['up']-$t['down'])*$survival,'exact integer expected value survives clipping and zero compensation');
  }
  $peak=FlightMath::balancedTransition($cap,$cap,40,$rules);
  verify($peak['up']===$cap-1 && $peak['down']===$cap-1 && $peak['zero_bps']===0,'a ceiling rebound loses one pesewa without a second hazard charge');
}
// Default completion must stay close to the selected edge, with tiny currency-sized ceiling costs.
foreach([100,1000,5000] as $stake) {
  $p=FlightMath::preview($stake,2*$stake,$r,30000);$auto=$p['automatic_finish'];
  verify(abs($p['opening_return_pct']-93.575)<1e-8,'opening edge is preserved');
  verify($auto['estimated_return_pct']>($stake===100?92.5:93.4) && $auto['estimated_return_pct']<=93.575,'automatic completion no longer returns roughly 63 percent');
  verify(abs($auto['estimated_edge_pct']+$auto['estimated_return_pct']-100)<1e-8,'admin preview distinguishes the actual completion edge');
  $sample=$p['policies']['wait_to_end'];
  verify(abs($sample['estimated_return_pct']-$auto['estimated_return_pct'])<=6*($sample['standard_error_pct']+$auto['standard_error_pct']),'independent payout average agrees with drift-cost calibration');
  foreach($p['policies'] as $policy)verify($policy['estimated_return_pct']<=93.575+6*$policy['standard_error_pct'],'early/first-profit/target/end policies respect the opening bound statistically');
  verify($auto['expected_ceiling_cost_cents']<1,'default expected additional loss is below one pesewa per round');
}
foreach([0,50000,100000,250000,990000] as $edge) {
  $p=FlightMath::preview(1000,2000,array_replace($r,['min_house_edge_ppm'=>$edge]),5000);
  verify($p['automatic_finish']['estimated_edge_pct']+1e-8>=$edge/10000,'changing the selected edge preserves the stopping bound');
}
$up=static fn(int $lo,int $hi):int=>$hi===10000?$hi:$lo;
$peakRules=array_replace($r,['zero_bps'=>0,'min_move_pct'=>40,'max_move_pct'=>40]);
$f=FlightMath::flight(1000,2000,$peakRules,$up);$sawPeak=false;
foreach($f['path'] as $i=>$value)if($value===2000) {
  $sawPeak=true;verify(($f['offsets'][$i+1]??12000)-$f['offsets'][$i]<=1000,'peak offer lasts at most one second');
  if(isset($f['path'][$i+1]))verify($f['path'][$i+1]===1999,'2x dips by one pesewa instead of a percentage cliff');
}
verify($sawPeak && $f['offsets'][0]===0 && max($f['offsets'])<12000,'same nominal flight length with reachable peaks');
// A signed legacy configuration upgrades once, without rewriting accepted rounds or moving money.
$db=spin_test_db();spin_test_reset($db);$game=spin_test_activate($db);
flight_test_rules($db,['zero_bps'=>0,'step_ms'=>3000]);
spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();
$v=$game->startFlight('233201234567',1000,ref());
$old=$db->query("SELECT * FROM flight_rounds WHERE id='".$v['id']."'")->fetch();
$legacy=array_replace($r,['movement_model'=>'legacy','min_house_edge_ppm'=>50000,'zero_bps'=>0,'up_bps'=>4500]);
// Simulates a legitimately signed historical profile, not a rewritten hash/audit fixture.
$save=new ReflectionMethod($game,'saveFlightRules');
$db->beginTransaction();$save->invoke($game,'migration',$legacy,'Legacy-profile upgrade fixture',$game->now(),true);$db->commit();
$legacyConfig=$db->query('SELECT * FROM flight_configs ORDER BY id DESC LIMIT 1')->fetch();
$before=$db->query('SELECT pool_cents,last_admin_login FROM spin_state')->fetch();
$game->upgradeBalancedFlights();$game->upgradeBalancedFlights();
$state=$db->query('SELECT * FROM spin_state')->fetch();$current=json_decode($db->query('SELECT rules_json FROM flight_configs WHERE id='.(int)$state['flight_config_id'])->fetchColumn(),true);
verify($current['movement_model']==='balanced' && $current['min_house_edge_ppm']===50000 && !isset($current['up_bps']),'upgrade preserves selected edge and retires compounded directional odds');
verify((int)$state['flight_config_id']===(int)$legacyConfig['id']+1,'upgrade is idempotent');
verify($state['pool_cents']===$before['pool_cents'] && $state['last_admin_login']===$before['last_admin_login'],'upgrade changes neither money nor qualifying login clock');
verify($db->query('SELECT rules_json FROM flight_configs WHERE id='.(int)$legacyConfig['id'])->fetchColumn()===$legacyConfig['rules_json'],'legacy configuration remains immutable');
$same=$db->query("SELECT * FROM flight_rounds WHERE id='".$v['id']."'")->fetch();
verify($same===$old,'accepted flight path, offers, deadlines and commitment are untouched');
$paid=$game->collectFlight('233201234567',$v['id'],$v['offer']['id'],ref());
verify($paid['wallet_cents']===99950 && $game->reconcile()['ok'],'original offer still pays principal recovery exactly and audits reconcile');
echo "PASS $checks balance checks; fair integer draws, completion calibration, stopping policies, peaks and immutable upgrades.\n";
