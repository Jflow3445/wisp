<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;$user='233201234567';$other='233201234568';
function verify(bool $condition,string $label): void {global $checks;if(!$condition)throw new RuntimeException('FAIL '.$label);$checks++;}
function denied(callable $fn,string $code): void {try{$fn();}catch(SpinError $e){verify($e->errorCode===$code,'expected '.$code.' got '.$e->errorCode);return;}throw new RuntimeException('Expected '.$code);}
function ref(): string{return bin2hex(random_bytes(16));}
function at(PDO $db,int $ms): void {$db->exec('SET timestamp='.number_format($ms/1000,3,'.',''));}
$defaults=FlightMath::defaults();
verify(FlightMath::openingPpm($defaults)===950000,'legacy default preserved by explicit 6.425% minimum');
$ten=FlightMath::rules(array_replace($defaults,['min_house_edge_ppm'=>100000]));
verify(FlightMath::openingPpm($ten)===913705,'10% derives 91.3705%, not a hardcoded 95%');
verify(FlightMath::openingAmount(1000,2000,$ten)===913,'pesewa rounding always rounds opening down');
verify(FlightMath::edgeModel($ten)['model_min_edge_pct']>=10,'calculated bound satisfies the selected minimum');
foreach([-1,1000000,100000.0,'100000'] as $bad)denied(fn()=>FlightMath::rules(array_replace($defaults,['min_house_edge_ppm'=>$bad])),'invalid_input');
$legacy=$defaults;unset($legacy['min_house_edge_ppm'],$legacy['movement_model']);$legacy['up_bps']=4500;$original=$legacy;
denied(fn()=>FlightMath::rules($legacy),'invalid_rules');
verify(FlightMath::rules($legacy,true)['min_house_edge_ppm']===64250 && $legacy===$original,'legacy read normalizes without editing the historical payload');
foreach([0,1,150,500,9999,10000] as $zero) {
  $old=array_replace($legacy,['zero_bps'=>$zero]);$converted=FlightMath::rules($old,true);
  verify($zero===10000?FlightMath::openingPpm($converted)===0:FlightMath::openingPpm($converted)===950000,'every legacy hazard preserves the old opening when survival is possible');
}
// Cross-multiplied integer inequalities avoid rounding a simulated return into a guarantee.
$edges=[0,1,10,1000,50000,64250,100000,250000,500000,999999];
$hazards=[0,1,150,500,2500,9999,10000];
foreach($edges as $edge)foreach($hazards as $zero) {
  $r=FlightMath::rules(array_replace($defaults,['min_house_edge_ppm'=>$edge,'zero_bps'=>$zero]));$opening=FlightMath::openingPpm($r);
  verify($opening*(10000-$zero)<=(1000000-$edge)*10000,'global stopping bound holds exactly');
  foreach([1,2,99,100,1000,SpinMath::MAX_WALLET] as $stake)foreach([0,intdiv($stake,2),$stake,2*$stake] as $cap) {
    $amount=FlightMath::openingAmount($stake,$cap,$r);
    verify($amount<$stake && $amount*1000000<=min($stake,$cap)*$opening,'all stakes and pool ceilings preserve the bound and no initial profit/tie');
  }
}
for($i=0;$i<1000;$i++) {
  $edge=random_int(0,999999);$zero=random_int(0,10000);$r=array_replace($defaults,['min_house_edge_ppm'=>$edge,'zero_bps'=>$zero]);
  verify(FlightMath::openingPpm($r)*(10000-$zero)<=(1000000-$edge)*10000,'random rule pairs satisfy the integer guarantee');
}
$preview=FlightMath::preview(1000,2000,$ten,1000);
verify($preview['edge_model']['selected_min_edge_ppm']===100000 && $preview['stake_min_edge_pct']>=10,'preview reports selected and actual stake-adjusted edge');
$high=array_replace($defaults,['min_house_edge_ppm'=>990000]);
verify(!FlightMath::preview(1000,2000,$high,100)['profit_reachable'],'high edge warns when profit is unreachable');
verify(!FlightMath::preview(15000,10000,$ten,100)['profit_reachable'],'pool-limited stake is reported accurately');
// Real admin save, accepted round isolation and idempotent application upgrade.
$db=spin_test_db();spin_test_reset($db);$game=spin_test_activate($db);
flight_test_rules($db,['zero_bps'=>0,'step_ms'=>3000,'min_move_pct'=>2,'max_move_pct'=>2]);
spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();
$old=$game->startFlight($user,1000,ref());
verify($old['offer']['amount_cents']===950,'existing active round starts with its accepted 5% profile');
$state=$db->query('SELECT * FROM spin_state')->fetch();$oldConfig=$db->query('SELECT * FROM flight_configs WHERE id='.(int)$state['flight_config_id'])->fetch();
$draft=json_decode($oldConfig['rules_json'],true);$draft['min_house_edge_ppm']=100000;
$head=$state['audit_head'];$beforeCount=(int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn();
$p=$game->flightPreview(1000,$draft);
verify($p['opening_amount_cents']===900 && $p['stake_min_edge_pct']>=10,'unsaved draft preview applies the proposed target');
verify((int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn()===$beforeCount && $db->query('SELECT audit_head FROM spin_state')->fetchColumn()===$head,'preview changes no config, money or audit history');
spin_test_admin($game,$db,['action'=>'flight_rules','rules'=>$draft]);at($db,$old['start_ms']+100);
$new=$game->startFlight($other,1000,ref());$same=$game->activeFlight($user,$old['id']);
verify($new['offer']['amount_cents']===900,'only subsequent starts use the new edge');
verify($same['offer']['amount_cents']===950 && $same['offer']['expires_ms']===$old['offer']['expires_ms'],'accepted price and deadline remain unchanged');
verify($db->query('SELECT rules_json FROM flight_configs WHERE id='.(int)$oldConfig['id'])->fetchColumn()===$oldConfig['rules_json'],'the previous configuration is immutable');
$paidOld=$game->collectFlight($user,$old['id'],$old['offer']['id'],ref());
$paidNew=$game->collectFlight($other,$new['id'],$new['offer']['id'],ref());
verify($paidOld['wallet_cents']===99950 && $paidNew['wallet_cents']===99900,'both rounds settle according to their own accepted edge');
verify($game->reconcile()['ok'],'edge changes preserve financial and HMAC reconciliation');
$count=(int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn();$login=$db->query('SELECT last_admin_login FROM spin_state')->fetchColumn();
$game->upgradeHouseEdgeControl();$game->upgradeHouseEdgeControl();
verify((int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn()===$count && $db->query('SELECT last_admin_login FROM spin_state')->fetchColumn()===$login,'upgrade is idempotent and never refreshes admin inactivity');
$current=$db->query('SELECT * FROM flight_configs ORDER BY id DESC LIMIT 1')->fetch();
$db->prepare('UPDATE flight_configs SET rules_json=? WHERE id=?')->execute([$current['rules_json'].' ',$current['id']]);
try {denied(fn()=>$game->upgradeHouseEdgeControl(),'config_integrity');}
finally {$db->prepare('UPDATE flight_configs SET rules_json=? WHERE id=?')->execute([$current['rules_json'],$current['id']]);}
verify((int)$db->query('SELECT COUNT(*) FROM flight_configs')->fetchColumn()===$count,'an upgrade cannot sign a new version from corrupted settings');
verify($game->reconcile()['ok'],'restored records reconcile after rejecting the corrupt upgrade');
echo "PASS $checks house-edge checks; integer calibration, draft previews, legacy profiles and accepted-round isolation.\n";
