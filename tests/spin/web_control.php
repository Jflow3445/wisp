<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$db=spin_test_db();$game=new SpinService($db,spin_test_env());$action=$argv[1]??'';
if($action==='balances') echo json_encode($db->query("SELECT (SELECT balance_cents FROM accounts WHERE msisdn='233201234567') cash,(SELECT balance_cents FROM spin_credit_accounts WHERE msisdn='233201234567') credit,(SELECT pool_cents FROM spin_state) pool")->fetch());
elseif($action==='login-events') echo json_encode((int)$db->query("SELECT COUNT(*) FROM spin_audit WHERE event='interactive_login'")->fetchColumn());
elseif($action==='consents') echo json_encode((int)$db->query("SELECT COUNT(*) FROM spin_consents WHERE msisdn='233201234567'")->fetchColumn());
elseif($action==='existing-user') {
  if((int)$db->query('SELECT COUNT(*) FROM flight_rounds')->fetchColumn()!==0)throw new RuntimeException('Existing-user fixture must precede play');
  $db->exec("DELETE FROM spin_players WHERE msisdn='233201234567'");echo '{}';
}
elseif($action==='account-integration') echo json_encode($db->query("SELECT (SELECT COUNT(*) FROM accounts) wallets,(SELECT COUNT(*) FROM radcheck) credentials,(SELECT birth_date FROM spin_players WHERE msisdn='233201234567') game_birth_date,(SELECT verified_at FROM spin_players WHERE msisdn='233201234567') game_verified")->fetch());
elseif($action==='ghost') { spin_test_admin($game,$db,['action'=>'state','state'=>'GHOSTED']);echo '{}'; }
elseif($action==='exhaust-game-reads-starts') {
  // Deterministic quota fixture: avoid browser connection-pool timing as a rate-limit oracle.
  if($game->now()%60===59)usleep((1000-$game->nowMs()%1000)*1000+10000);
  $window=intdiv($game->now(),60)*60;
  $st=$db->prepare('INSERT INTO spin_security_limits(bucket,window_start,hits) VALUES(?,?,?) ON DUPLICATE KEY UPDATE window_start=VALUES(window_start),hits=VALUES(hits)');
  foreach(['flight-read:233201234567'=>600,'flight-write:start:233201234567'=>30] as $bucket=>$hits)$st->execute([hash('sha256',$bucket),$window,$hits]);
  echo '{}';
}
else {
  if($action==='reset') {
    spin_test_reset($db,false);$game=spin_test_activate($db);spin_test_rules($db,['win_bps'=>10000]);
    spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
    $db->exec('SET timestamp=0');
  }
  $db->exec("UPDATE spin_state SET state='ACTIVE' WHERE id=1");$game->interactiveLogin('operator');$game->watchdog();
  spin_test_rules($db,['win_bps'=>$action==='loss'?0:10000]);
  flight_test_rules($db,['zero_bps'=>$action==='loss'?10000:0,'min_move_pct'=>$action==='partial'?2:20,'max_move_pct'=>$action==='partial'?2:20,'steps'=>$action==='auto'?4:8,'step_ms'=>$action==='limits'?3000:($action==='auto'?1000:2000)]);
  $db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();$game->monitor();
  echo '{}';
}
