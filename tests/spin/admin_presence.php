<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$checks=0;
function verify(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException('FAIL '.$label);$checks++;}
function denied(callable $fn,string $code):void{try{$fn();}catch(SpinError $e){verify($e->errorCode===$code,$code.' got '.$e->errorCode);return;}throw new RuntimeException('Expected '.$code);}
$env=spin_test_env();$now=time();$present=['last_admin_login'=>gmdate('Y-m-d H:i:s',$now),'last_admin_user'=>'operator','threshold_seconds'=>172800];
verify(spin_launch_ready($env,$now,$present),'interactive manager presence authorizes play without external-reference fields');
verify(!spin_launch_ready($env,$now),'configuration alone cannot impersonate presence');
verify(!spin_launch_ready($env,$now+172800,$present),'authorization ends exactly at inactivity threshold');
verify(!spin_launch_ready($env,$now,array_replace($present,['last_admin_user'=>'customer'])),'customer identity cannot authorize play');
verify(!spin_launch_ready(array_replace($env,['SPIN_GAME_MANAGERS'=>'other']),$now,$present),'removing a manager revokes their authorization window');
verify(!spin_launch_ready(array_replace($env,['SPIN_AUDIT_KEY'=>'']),$now,$present),'audit signing remains mandatory');
verify(!spin_launch_ready(array_replace($env,['SPIN_PAID_PLAY_ENABLED'=>'0']),$now,$present),'explicit deployment kill switch remains effective');
$db=spin_test_db();spin_test_reset($db);$game=new SpinService($db,$env);
verify(!$game->availability()['launch_ready'],'installation does not fabricate an administrator login');
$authenticatedAt=$game->now()-60;$game->recognizeAdminSession('operator',$authenticatedAt);
verify(strtotime($db->query('SELECT last_admin_login FROM spin_state')->fetchColumn().' UTC')===$authenticatedAt,'an existing WISP session keeps its actual original authentication timestamp');
$game->recognizeAdminSession('operator',$authenticatedAt);$game->recognizeAdminSession('operator',$authenticatedAt-1);
verify((int)$db->query("SELECT COUNT(*) FROM spin_audit WHERE event='interactive_login'")->fetchColumn()===1,'requests and older sessions never refresh authorization');
$db->exec('UPDATE spin_state SET last_admin_login=NULL,last_admin_user=NULL');
$game->interactiveLogin('customer');verify(!$game->availability()['launch_ready'],'unlisted login cannot authorize play');
$game->interactiveLogin('operator');$game->watchdog();$game->monitor();$a=$game->availability();
verify($a['launch_ready'] && !$a['visible'] && $a['state']==='GHOSTED','manager presence authorizes readiness but preserves explicit restoration');
$login=$db->query('SELECT last_admin_login FROM spin_state')->fetchColumn();$before=$db->query('SELECT SUM(balance_cents) FROM accounts')->fetchColumn();
denied(fn()=>$game->admin('customer',['action'=>'pool','amount_cents'=>100,'request_key'=>str_repeat('x',32),'reason'=>'Unauthorized operation']),'forbidden');
verify($db->query('SELECT last_admin_login FROM spin_state')->fetchColumn()===$login,'rejected operations never refresh interactive presence');
verify($db->query('SELECT SUM(balance_cents) FROM accounts')->fetchColumn()===$before,'rejected operations do not move money');
spin_test_admin($game,$db,['action'=>'state','state'=>'RESTORE']);
spin_test_admin($game,$db,['action'=>'state','state'=>'ACTIVE']);
verify($game->availability()['can_play'],'explicit session-authorized restoration and activation opens play');
$db->exec('SET timestamp='.(strtotime($login.' UTC')+172800));$a=$game->availability();
verify($a['state']==='GHOSTED' && !$a['visible'] && !$a['can_play'],'server requests enforce the expired presence window');
$game->interactiveLogin('operator');verify($game->availability()['state']==='GHOSTED','a later login never silently restores ghosted play');
verify($game->reconcile()['ok'],'presence and session-authorized audit records reconcile');
echo "PASS $checks administrator-presence and existing-session checks.\n";
