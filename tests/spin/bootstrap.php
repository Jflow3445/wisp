<?php
declare(strict_types=1);
require_once __DIR__.'/../../pay-portal/lib/spin/service.php';
require_once __DIR__.'/../../pay-portal/lib/spin/migrations.php';
require_once __DIR__.'/../../pay-portal/lib/common.php';
function spin_test_db(): PDO {
  $dsn=(string)getenv('SPIN_TEST_DSN');
  if(!preg_match('/^mysql:.*dbname=nister_spin_test(?:;|$)/D',$dsn)) throw new RuntimeException('Set SPIN_TEST_DSN to an isolated MySQL database named nister_spin_test. Tests reset ONLY that database.');
  $db=new NisterPDO($dsn,(string)getenv('SPIN_TEST_USER'),(string)getenv('SPIN_TEST_PASS'),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
  if($db->query('SELECT DATABASE()')->fetchColumn()!=='nister_spin_test') throw new RuntimeException('Unsafe test database');
  $db->exec("SET time_zone='+00:00'"); return $db;
}
function spin_test_env(): array {
  return ['SPIN_GAME_MANAGERS'=>'operator','SPIN_AUDIT_KEY'=>str_repeat('test-key-',8),
    'SPIN_PAID_PLAY_ENABLED'=>'1','SPIN_OPERATIONS_APPROVED'=>'1'];
}
// The production routine still operates on the real test RADIUS tables through this connection.
// No payment, game outcome, balance, or provisioning handler is simulated.
if(!function_exists('rdb_pdo')) { function rdb_pdo(): PDO { return spin_test_db(); } }
function spin_test_reset(PDO $db, bool $acceptTerms=true): void {
  $db->exec('SET FOREIGN_KEY_CHECKS=0');
  foreach($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
    if(!preg_match('/^[a-z0-9_]+$/D',$table)) throw new RuntimeException('Unsafe fixture table');
    $db->exec('DROP TABLE `'.$table.'`');
  }
  $db->exec('SET FOREIGN_KEY_CHECKS=1');
  foreach([__DIR__.'/fixture.sql'] as $path) {
    foreach(preg_split('/;\s*(?:\r?\n|$)/',file_get_contents($path)) as $sql) if(trim($sql)!=='') $db->exec($sql);
  }
  spin_apply_migrations($db);
  $game=new SpinService($db,spin_test_env());$game->upgradeWalletExperience();$game->upgradeFlightExperience();$game->upgradeHouseEdgeControl();$game->upgradeBalancedFlights();
  $GLOBALS['PDO']=$db;
  foreach(['233201234567','233201234568','233201234569'] as $u) {
    $db->prepare('INSERT INTO accounts(msisdn,balance_cents) VALUES(?,100000)')->execute([$u]);
    $db->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(?,'deposit',100000,?,'Verified test deposit')")->execute([$u,'TEST-DEPOSIT-'.$u]);
    $db->prepare("INSERT INTO spin_players(msisdn,birth_date,verified_at,verified_by,verification_ref) VALUES(?,'1990-01-01',UTC_TIMESTAMP(),'test','test-verification')")->execute([$u]);
    if($acceptTerms) $game->preferences($u,['accept_terms'=>true]);
    $db->prepare("INSERT INTO radcheck(username,attribute,op,value) VALUES(?,'Cleartext-Password',':=','test-customer-password')")->execute([$u]);
  }
}
function spin_test_rules(PDO $db, array $change=[]): array {
  $rules=json_decode($db->query('SELECT rules_json FROM spin_configs ORDER BY id DESC LIMIT 1')->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
  $rules=SpinMath::rules(array_merge($rules,$change));
  spin_test_admin(new SpinService($db,spin_test_env()),$db,['action'=>'rules','rules'=>$rules]); return $rules;
}
function flight_test_rules(PDO $db,array $change=[]): array {
  $rules=json_decode($db->query('SELECT rules_json FROM flight_configs ORDER BY id DESC LIMIT 1')->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
  if(isset($change['zero_bps']) && !array_key_exists('min_house_edge_ppm',$change))$change['min_house_edge_ppm']=min(999999,1000000-95*(10000-$change['zero_bps']));
  $rules=FlightMath::rules(array_merge($rules,$change));
  spin_test_admin(new SpinService($db,spin_test_env()),$db,['action'=>'flight_rules','rules'=>$rules]);return $rules;
}
function spin_test_activate(PDO $db): SpinService {
  $game=new SpinService($db,spin_test_env()); $game->interactiveLogin('operator'); $game->watchdog();
  $db->exec("UPDATE spin_state SET state='ACTIVE' WHERE id=1"); $game->monitor(); return $game;
}
function spin_test_admin(SpinService $game, PDO $db, array $body): array {
  return $game->admin('operator',$body+['request_key'=>bin2hex(random_bytes(16)),'reason'=>'Automated integration verification']);
}
