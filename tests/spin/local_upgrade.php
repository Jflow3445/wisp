<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$db=spin_test_db();spin_apply_migrations($db);$game=new SpinService($db,spin_test_env());$game->upgradeWalletExperience();$game->upgradeFlightExperience();$game->upgradeHouseEdgeControl();$game->upgradeBalancedFlights();
// Reverse only the original development preset, preserving the user's test spins and cash balance.
$user='233201234567';$seed=$db->prepare("SELECT 1 FROM spin_credit_entries WHERE msisdn=? AND kind='correction' AND amount_cents=3850 AND notes='Automated integration verification' LIMIT 1");$seed->execute([$user]);
if($seed->fetchColumn() && $game->creditBalance($user)>=3850) {
  spin_test_admin($game,$db,['action'=>'credit_correction','msisdn'=>$user,'amount_cents'=>-3850,'request_key'=>'local-remove-preset-credits-v2','reason'=>'Remove the original development-only preloaded credit balance.']);
}
$db->exec('SET timestamp=0');$game->consolidateCredits($user);$game->watchdog();$report=$game->monitor();
echo json_encode(['ok'=>$report['ok'],'wallet_cents'=>(int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='233201234567'")->fetchColumn(),'legacy_credit_cents'=>$game->creditBalance($user),'errors'=>$report['errors']]).PHP_EOL;
