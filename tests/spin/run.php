<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;
function check(bool $condition,string $label): void { global $checks; if(!$condition) throw new RuntimeException('FAIL: '.$label); $checks++; }
function rejects(callable $fn,string $code): void { try {$fn();}catch(SpinError $e){check($e->errorCode===$code,'reject '.$code.' (got '.$e->errorCode.')');return;} throw new RuntimeException('Expected rejection: '.$code); }
function concurrent(array $tasks): array {
  $processes=[];
  foreach($tasks as $task) {
    $command=[PHP_BINARY,'-d','extension=pdo_mysql',__DIR__.'/worker.php',json_encode($task,JSON_THROW_ON_ERROR)];
    $pipes=[]; $proc=proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);
    fclose($pipes[0]); $processes[]=[$proc,$pipes];
  }
  $out=[]; foreach($processes as [$proc,$pipes]) { $result=stream_get_contents($pipes[1]);$errors=stream_get_contents($pipes[2]); fclose($pipes[1]);fclose($pipes[2]);proc_close($proc); $out[]=json_decode($result,true,512,JSON_THROW_ON_ERROR); if($errors) fwrite(STDERR,$errors); } return $out;
}
$db=spin_test_db(); spin_test_reset($db); $game=spin_test_activate($db); $u='233201234567'; $other='233201234568';
$r=spin_test_rules($db,['win_bps'=>10000]);
// Mathematics: all bonus percentages, minimum rounding, truncation and exact expected values.
for($pct=1;$pct<=100;$pct++) check(SpinMath::bonus(1000,100000,$pct,$r)===$pct*10,'whole percentage '.$pct);
check(SpinMath::bonus(1001,100000,1,$r)===11,'minimum rounds upward');
check(SpinMath::bonus(1001,100000,25,$r)===250,'non-minimum floors to pesewa');
check(SpinMath::bonus(1000,1000,100,$r)===100,'pool ceiling caps bonus only');
rejects(fn()=>SpinMath::bonus(10001,1000,100,$r),'pool_minimum_unavailable');
check(abs(SpinMath::expectation(1000,100000,$r)['rtp_pct']-150.5)<0.00001,'enumerated uniform RTP');
check(SpinMath::expectation(1000,1000,$r)['rtp_pct']<110,'RTP includes ceiling');
rejects(fn()=>SpinMath::rules(array_merge($r,['min_bonus_pct'=>0])),'invalid_input');
rejects(fn()=>SpinMath::rules(array_merge($r,['distribution'=>'weighted','weights'=>[25=>1]])),'invalid_rules');
rejects(fn()=>SpinMath::rules(array_merge($r,['win_bps'=>4500.0])),'invalid_input');
$weighted=SpinMath::rules(array_merge($r,['distribution'=>'weighted','weights'=>[1=>3,100=>1],'win_bps'=>4500]));
$wins=0; $hundreds=0; $sample=30000;
for($i=0;$i<$sample;$i++){ $d=SpinMath::draw($weighted);if($d['outcome']==='win'){$wins++;if($d['bonus_pct']===100)$hundreds++;} }
check(abs($wins/$sample-.45)<.025,'CSPRNG overall probability');check(abs($hundreds/$wins-.25)<.04,'weighted bonus probability');
check(!spin_launch_ready([],time()),'paid play disabled by default');
$before=(int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn();
rejects(fn()=>$game->quote($u,1000),'pool_minimum_unavailable');
check((int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn()===$before,'impossible quote does not charge');
spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$q=$game->quote($u,1000);$key=bin2hex(random_bytes(16));$win=$game->spin($u,$q['id'],$key);
check($win['outcome']==='win' && (int)$win['credit_cents']===(int)$win['stake_cents']+(int)$win['bonus_cents'],'winner stake plus bonus');
check((int)$win['pool_after_cents']===100000-(int)$win['bonus_cents'],'win debits pool bonus only');
check((int)$win['cash_after_cents']===$before+(int)$win['bonus_cents'],'winning stake and bonus go to the regular wallet');
check($game->creditBalance($u)===0,'a win does not create a separate network balance');
check($game->spin($u,$q['id'],$key)===$win,'duplicate request returns identical receipt');
rejects(fn()=>$game->spin($u,str_repeat('a',32),$key),'idempotency_conflict');
rejects(fn()=>$game->spin($u,$q['id'],bin2hex(random_bytes(16))),'quote_expired');
check($game->receipt($other,$key)===null,'receipts are account scoped');
// Changing a version only invalidates uncommitted quotes. Existing receipts retain their version.
$db->exec('SET timestamp='.($game->now()+20)); $game->watchdog();
$q2=$game->quote($u,1000);spin_test_rules($db,['win_bps'=>0]);rejects(fn()=>$game->spin($u,$q2['id'],bin2hex(random_bytes(16))),'quote_expired');
$q2=$game->quote($u,1000);$loss=$game->spin($u,$q2['id'],bin2hex(random_bytes(16)));
check($loss['outcome']==='loss' && (int)$loss['credit_cents']===0 && (int)$loss['bonus_cents']===0,'loss issues no credits');
check((int)$loss['cash_after_cents']===(int)$win['cash_after_cents']-1000 && $game->creditBalance($u)===0,'loss deducts exactly the stake and adds nothing to any balance');
check((int)$loss['pool_after_cents']===(int)$loss['pool_before_cents']+1000,'loss funds prize pool');
check((int)$game->receipt($u,$key)['config_id']===(int)$win['config_id'],'old configuration retained');
// Promotional balance cannot be staked.
$db->prepare("INSERT INTO wallet_promo_grants(msisdn,remaining_cents,status,expires_at) VALUES(?,100000,'active','2000-01-01')")->execute([$other]);
rejects(fn()=>$game->quote($other,1000),'insufficient_funds');$db->exec('DELETE FROM wallet_promo_grants');
// Atomic rollback when a write fails after the monetary debit.
$db->exec('SET timestamp='.($game->now()+20));$game->watchdog();$q3=$game->quote($u,1000);$balance=(int)$loss['cash_after_cents'];$pool=(int)$loss['pool_after_cents'];
$db->exec("CREATE TRIGGER fail_spin_receipt BEFORE INSERT ON spin_spins FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected write failure'");
try{$game->spin($u,$q3['id'],str_repeat('b',32));throw new RuntimeException('Failure injection did not run');}catch(PDOException $e){check(true,'injected settlement failure');}
$db->exec('DROP TRIGGER fail_spin_receipt');
check((int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn()===$balance,'failed settlement rolls back cash');
check((int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn()===$pool,'failed settlement rolls back pool');
check($game->receipt($u,str_repeat('b',32))===null,'failed settlement leaves no receipt');
$game->spin($u,$q3['id'],str_repeat('b',32));check($game->reconcile()['ok'],'recovery reconciles all ledgers');
// Privileged controls: existing administrator permissions, reasons and idempotency.
rejects(fn()=>$game->admin('customer',['request_key'=>str_repeat('x',32),'reason'=>'invalid privilege']),'forbidden');
$adminKey=str_repeat('c',32);$adminInput=['action'=>'pool','amount_cents'=>1000,'request_key'=>$adminKey];$adjust=spin_test_admin($game,$db,$adminInput);
$same=$game->admin('operator',$adminInput+['reason'=>'Automated integration verification']);check($same===$adjust,'admin retry returns the same change using existing administrator authorization');
rejects(fn()=>$game->admin('operator',array_merge($adminInput,['amount_cents'=>2000,'reason'=>'Automated integration verification'])),'idempotency_conflict');
rejects(fn()=>$game->admin('operator',['action'=>'pool','amount_cents'=>1000,'request_key'=>str_repeat('d',32),'reason'=>'short']),'reason_required');
// Self exclusion and personal limits are persistent and cannot be raised/shortened.
$game->preferences($other,['daily_stake_cents'=>1000,'daily_loss_cents'=>1000]);
rejects(fn()=>$game->preferences($other,['daily_stake_cents'=>2000]),'invalid_input');
$p=$game->preferences($other,['exclude_days'=>30]);$p2=$game->preferences($other,['exclude_days'=>1]);check($p2['excluded_until']===$p['excluded_until'],'self exclusion cannot be shortened');
rejects(fn()=>$game->quote($other,1000),'self_excluded');
// Manual ghost: all history, credits, pool, and config survive; retries still return committed receipts.
$saved=$game->credits($u);$stateBefore=$db->query('SELECT * FROM spin_state')->fetch();
spin_test_admin($game,$db,['action'=>'state','state'=>'GHOSTED']);check(!$game->availability()['visible'],'ghost hidden');
rejects(fn()=>$game->quote($u,1000),'unavailable');rejects(fn()=>$game->snapshot($u),'unavailable');
check($game->spin($u,$q['id'],$key)===$win,'committed replay allowed in ghost');
check($saved===$game->credits($u),'ghost preserves customer records');
check((int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn()===(int)$stateBefore['pool_cents'],'ghost preserves pool');
$game->interactiveLogin('operator');check($game->availability()['state']==='GHOSTED','login never restores ghost');
spin_test_admin($game,$db,['action'=>'state','state'=>'RESTORE']);check($game->availability()['state']==='ACTIVE','explicit restore returns prior state');
// Precise 48h boundary, missed-scheduler enforcement, idempotence and paused-state coverage.
$now=$game->now();$db->prepare('UPDATE spin_state SET last_admin_login=?,threshold_seconds=172800 WHERE id=1')->execute([gmdate('Y-m-d H:i:s',$now)]);
$db->exec('SET timestamp='.($now+172799));check($game->availability()['state']==='ACTIVE','active immediately before 48h');
$db->exec('SET timestamp='.($now+172800));check($game->availability()['state']==='GHOSTED','ghost exactly at 48h without cron');
$count=(int)$db->query("SELECT COUNT(*) FROM spin_audit WHERE event='automatic_ghost'")->fetchColumn();$game->watchdog();$game->watchdog();check((int)$db->query("SELECT COUNT(*) FROM spin_audit WHERE event='automatic_ghost'")->fetchColumn()===$count,'watchdog transition is idempotent');
$game->interactiveLogin('customer');check($db->query('SELECT last_admin_login FROM spin_state')->fetchColumn()===gmdate('Y-m-d H:i:s',$now),'customer does not refresh admin inactivity');
$game->interactiveLogin('operator');check($game->availability()['state']==='GHOSTED','late admin login retains ghost');
$db->exec("UPDATE spin_state SET state='PAUSED',last_admin_login=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 48 HOUR) WHERE id=1");$game->watchdog();check($game->availability()['state']==='GHOSTED','paused game also ghosts');
// Redemption while ghosted reuses the real existing provisioning routine and purchase ledger.
$plan=['code'=>'PLAN_TEST','price_cents'=>500,'active'=>true,'quota_bytes'=>1073741824,'duration_days'=>1,'address_list'=>'HS_ACTIVE'];
spin_test_admin($game,$db,['action'=>'credit_correction','msisdn'=>$u,'amount_cents'=>5000]);
$redemption=$game->redeem($u,$plan,1,str_repeat('r',32));check((int)$redemption['price_cents']===500,'credit purchase applies while ghosted');
check($db->query("SELECT status FROM purchases WHERE id=".(int)$redemption['purchase_id'])->fetchColumn()==='applied','existing purchase record applied');
check($db->query("SELECT value FROM radreply WHERE username='$u' AND attribute='Nister-Plan-Code' ORDER BY id DESC LIMIT 1")->fetchColumn()==='PLAN_TEST','existing RADIUS provisioning applied');
check($game->redeem($u,$plan,1,str_repeat('r',32))===$redemption,'redemption idempotency');
// Failure during RADIUS provisioning rolls back credit debit and purchase together.
$creditBefore=$game->credits($u)['balance_cents'];$purchaseCount=(int)$db->query('SELECT COUNT(*) FROM purchases')->fetchColumn();
$db->exec("CREATE TRIGGER fail_radius BEFORE INSERT ON radreply FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected provisioning failure'");
try{$game->redeem($u,$plan,1,str_repeat('s',32));throw new RuntimeException('Provisioning injection failed');}catch(PDOException $e){check(true,'injected RADIUS failure');}$db->exec('DROP TRIGGER fail_radius');
check($game->credits($u)['balance_cents']===$creditBefore && (int)$db->query('SELECT COUNT(*) FROM purchases')->fetchColumn()===$purchaseCount,'provisioning failure rolls back credit and purchase');
check($game->reconcile()['ok'],'financial and audit reconciliation');
// Consolidating previously awarded credits is lossless, idempotent and independently journalled.
$legacyBefore=$game->creditBalance($u);$cashBeforeMerge=(int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn();
check($game->consolidateCredits($u)===$legacyBefore && $game->consolidateCredits($u)===0,'legacy credits move once to the ordinary wallet');
check($game->creditBalance($u)===0 && (int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn()===$cashBeforeMerge+$legacyBefore,'legacy transfer preserves total customer value');
check($game->reconcile()['ok'],'legacy wallet migration retains signed financial history');
// Health failures block new stakes without suspending ISP services or erasing obligations.
$db->exec("UPDATE spin_state SET state='ACTIVE',last_admin_login=UTC_TIMESTAMP(),last_watchdog_at=UTC_TIMESTAMP(),last_reconcile_at=UTC_TIMESTAMP(),reconcile_ok=0 WHERE id=1");
rejects(fn()=>$game->quote($u,1000),'reconciliation_unhealthy');
check($game->monitor()['ok'],'healthy financial reconciliation recorded');
check($game->availability()['can_play'],'healthy reconciliation permits gameplay');
$db->exec("UPDATE spin_state SET last_watchdog_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 181 SECOND)");
rejects(fn()=>$game->quote($u,1000),'watchdog_unhealthy');$game->watchdog();
$db->exec("UPDATE spin_state SET last_reconcile_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1801 SECOND)");
rejects(fn()=>$game->quote($u,1000),'reconciliation_unhealthy');$game->monitor();
// An expired quote never charges, and identity / loss-budget guards run server-side.
$fresh=$game->quote($u,1000);$db->exec('SET timestamp='.($game->now()+121));$game->watchdog();
rejects(fn()=>$game->spin($u,$fresh['id'],str_repeat('e',32)),'quote_expired');
$db->prepare('UPDATE spin_players SET verified_at=NULL WHERE msisdn=?')->execute([$u]);
check((int)$game->quote($u,1000)['stake_cents']===1000,'existing WISP users need no separate game verification');
$db->prepare("UPDATE spin_players SET verified_at=UTC_TIMESTAMP(),birth_date='2020-01-01' WHERE msisdn=?")->execute([$u]);
rejects(fn()=>$game->quote($u,1000),'identity_required');
$db->prepare("UPDATE spin_players SET birth_date='1990-01-01',daily_loss_cents=100 WHERE msisdn=?")->execute([$u]);
rejects(fn()=>$game->quote($u,1000),'daily_limit');
$db->prepare('UPDATE spin_players SET daily_loss_cents=NULL,terms_version=NULL WHERE msisdn=?')->execute([$u]);
rejects(fn()=>$game->quote($u,1000),'terms_required');$game->preferences($u,['accept_terms'=>true]);
// Tampering is detected, then restore fixture record to retain a clean test database.
$db->exec('UPDATE spin_state SET pool_cents=pool_cents+1');check(!$game->reconcile()['ok'],'pool inconsistency detected');$db->exec('UPDATE spin_state SET pool_cents=pool_cents-1');
// A database edit cannot substitute a configuration even if its unkeyed hash is also changed.
$config=$db->query('SELECT * FROM spin_configs ORDER BY id DESC LIMIT 1')->fetch();
$tampered=json_decode($config['rules_json'],true);$tampered['win_bps']=10000;$json=json_encode($tampered);
$db->prepare('UPDATE spin_configs SET rules_json=?,rules_hash=? WHERE id=?')->execute([$json,hash('sha256',$json),$config['id']]);
check(!$game->reconcile()['ok'],'signed rule audit detects config replacement');
$db->prepare('UPDATE spin_configs SET rules_json=?,rules_hash=? WHERE id=?')->execute([$config['rules_json'],$config['rules_hash'],$config['id']]);
$tamperedPct=(int)$win['bonus_pct']===99?98:99;
$db->prepare('UPDATE spin_spins SET bonus_pct=? WHERE id=?')->execute([$tamperedPct,$win['id']]);check(!$game->reconcile()['ok'],'receipt tampering detected');$db->prepare('UPDATE spin_spins SET bonus_pct=? WHERE id=?')->execute([$win['bonus_pct'],$win['id']]);
// Shared database coordination with genuinely simultaneous processes.
spin_test_reset($db);$game=spin_test_activate($db);spin_test_rules($db,['win_bps'=>10000]);spin_test_admin($game,$db,['action'=>'pool','amount_cents'=>100000]);
$db->exec('SET timestamp=0');$game->interactiveLogin('operator');$game->watchdog();
$q=$game->quote($u,1000);$task=['kind'=>'spin','user'=>$u,'quote'=>$q['id'],'key'=>str_repeat('k',32)];$results=concurrent([$task,$task]);
check($results[0]['ok'] && $results[1]['ok'] && $results[0]['result']===$results[1]['result'],'concurrent duplicate requests settle exactly once');
check((int)$db->query('SELECT COUNT(*) FROM spin_spins')->fetchColumn()===1,'single concurrent spin receipt');
$q1=$game->quote($other,1000);$q2=$game->quote('233201234569',1000);
$results=concurrent([['kind'=>'spin','user'=>$other,'quote'=>$q1['id'],'key'=>str_repeat('m',32)],['kind'=>'spin','user'=>'233201234569','quote'=>$q2['id'],'key'=>str_repeat('n',32)]]);
check(count(array_filter($results,fn($r)=>$r['ok']))===1,'pool snapshot cannot be double spent by simultaneous winners');
check(in_array('quote_expired',array_column($results,'error'),true),'concurrent pool changes require new review');
// Competing manual adjustments share the same row and preserve their individual movements.
$inputs=[];foreach([0,1] as $i)$inputs[]=['kind'=>'pool','input'=>['action'=>'pool','amount_cents'=>100,'reason'=>'Concurrent adjustment verification','request_key'=>str_repeat((string)($i+1),32)]];
$poolBefore=(int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn();$results=concurrent($inputs);$successful=count(array_filter($results,fn($r)=>$r['ok']));
check($successful>=1 && (int)$db->query('SELECT pool_cents FROM spin_state')->fetchColumn()===$poolBefore+100*$successful,'concurrent manual pool changes are serialized');
check($game->reconcile()['ok'],'concurrent settlement reconciliation');
$large=$game->quote($u,50000);check((int)$large['stake_cents']===50000,'stakes above the former GHS 100 maximum are accepted');
$consentCount=(int)$db->query("SELECT COUNT(*) FROM spin_consents WHERE msisdn='$u'")->fetchColumn();
$game->preferences($u,['accept_terms'=>true]);$game->preferences($u,['accept_terms'=>true]);
check((int)$db->query("SELECT COUNT(*) FROM spin_consents WHERE msisdn='$u'")->fetchColumn()===$consentCount,'one-time acceptance is persisted without duplicate consent records');
// Existing verified-payment credit adapter remains idempotent. No new deposit path is introduced.
$_ENV['PAY_DB_DSN']=getenv('SPIN_TEST_DSN');$_ENV['PAY_DB_USER']=getenv('SPIN_TEST_USER');$_ENV['PAY_DB_PASS']=getenv('SPIN_TEST_PASS');
require_once __DIR__.'/../../pay-portal/lib/paystack.php';$GLOBALS['PDO']=$db;
$cashBefore=(int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn();
$depositRef=paystack_ledger_ref('test-verified-provider-reference');
wallet_credit($u,1000,$depositRef,'Verified payment notification');wallet_credit($u,1000,$depositRef,'Duplicate verified notification');
check((int)$db->query("SELECT balance_cents FROM accounts WHERE msisdn='$u'")->fetchColumn()===$cashBefore+1000,'duplicate verified-payment credits increase cash once');
$db->prepare("INSERT INTO app_settings(k,v) VALUES('PAYSTACK_SECRET_KEY',?)")->execute(['test-only-provider-secret']);
$payload='{"event":"charge.success","data":{"reference":"test-reference"}}';
check(paystack_verify_webhook_signature($payload,hash_hmac('sha512',$payload,'test-only-provider-secret')),'existing provider signature accepts authentic payload');
check(!paystack_verify_webhook_signature($payload.' ',hash_hmac('sha512',$payload,'test-only-provider-secret')),'altered provider callback rejected');
check(in_array('failed',paystack_terminal_failure_statuses(),true) && in_array('reversed',paystack_terminal_failure_statuses(),true) && in_array('abandoned',paystack_terminal_failure_statuses(),true),'unsuccessful gateway attempts retain terminal-decline classification');
// Persistent rate limiting survives a new service instance/connection.
spin_rate_limit($db,'test-rate',1,60,$game->now());rejects(fn()=>spin_rate_limit(spin_test_db(),'test-rate',1,60,$game->now()),'rate_limited');
echo "PASS $checks checks; real MySQL/InnoDB, multi-process concurrency, RADIUS and failure recovery.\n";
