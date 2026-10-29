<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/spin/service.php';
require_once __DIR__.'/../lib/spin/migrations.php';
if(PHP_SAPI!=='cli') {http_response_code(404);exit;}
try {
  $env=app_boot();$db=db_pdo($env);
  $db->exec("SET time_zone='+00:00'");
  spin_apply_migrations($db);
  if(strlen(spin_env($env,'SPIN_AUDIT_KEY'))>=32) { $game=new SpinService($db,$env);$game->upgradeWalletExperience();$game->upgradeFlightExperience();$game->upgradeHouseEdgeControl();$game->upgradeBalancedFlights(); }
  echo "Flight migration installed. Current state: ".$db->query('SELECT state FROM spin_state WHERE id=1')->fetchColumn().". A game manager must log in and explicitly restore/activate play.\n";
}catch(Throwable $e){fwrite(STDERR,"Spin migration failed. Inspect the database using the migration-owner account; re-run after resolving the error.\n");exit(1);}
