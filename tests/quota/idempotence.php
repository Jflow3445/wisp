<?php
declare(strict_types=1);
// Native MariaDB test. Never reads runtime configuration or customer databases.
$server='mysql:host=127.0.0.1;port=33079;charset=utf8mb4';
$dsn='mysql:host=127.0.0.1;port=33079;dbname=nister_quota_storage_test;charset=utf8mb4';
$db=new PDO($server,'root','spin-test-only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE DATABASE nister_quota_storage_test');
$checks=0;
function verify(bool $ok,string $name): void {
  global $checks;
  if (!$ok) throw new RuntimeException($name);
  ++$checks;echo 'PASS quota_state_'.$name.PHP_EOL;
}
try {
  $db->exec('USE nister_quota_storage_test');
  $db->exec('CREATE TABLE radreply(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(64),attribute VARCHAR(64),op VARCHAR(2),value VARCHAR(255))');
  $db->exec('CREATE TABLE radusergroup(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(64),groupname VARCHAR(64),priority INT)');
  $db->exec('CREATE TABLE mutations(id INT AUTO_INCREMENT PRIMARY KEY,table_name VARCHAR(32),action_name VARCHAR(8))');
  foreach (['radreply','radusergroup'] as $table) foreach (['INSERT','UPDATE','DELETE'] as $event) {
    $db->exec("CREATE TRIGGER {$table}_{$event} AFTER $event ON $table FOR EACH ROW INSERT INTO mutations(table_name,action_name) VALUES('$table','$event')");
  }
  $source=file_get_contents(__DIR__.'/../../nister_quota_enforce.sh');$functions='';
  foreach (['set_cap_zero','hs_group_matches','set_hs_limited','ensure_hs_active'] as $name) {
    if (!preg_match('/^'.preg_quote($name,'/').'\(\)\{.*?^\}/ms',$source,$match)) throw new RuntimeException('Missing function '.$name);
    $functions.=$match[0]."\n";
  }
  $bootstrap=<<<'BASH'
set -euo pipefail
USERS=('0190000001' '233190000001')
IN_USERS="'0190000001','233190000001'"
HS_ACTIVE=HS_ACTIVE
HS_LIMITED=HS_LIMITED
HS_NOPAID=HS_NOPAID
HS_PRIO=0
sql_one(){ printf '%s' "$1" | "$QUOTA_TEST_PHP" "$QUOTA_TEST_BRIDGE" one; }
sql_exec(){ printf '%s' "$1" | "$QUOTA_TEST_PHP" "$QUOTA_TEST_BRIDGE" exec; }
BASH;
  $shell=getenv('QUOTA_TEST_BASH') ?: (PHP_OS_FAMILY==='Windows'?'C:/Program Files/Git/bin/bash.exe':'bash');
  $env=array_merge(getenv(),['QUOTA_TEST_DSN'=>$dsn,'QUOTA_TEST_PHP'=>str_replace('\\','/',PHP_BINARY),'QUOTA_TEST_BRIDGE'=>str_replace('\\','/',__DIR__.'/sql_bridge.php')]);
  $invoke=static function(string $commands) use ($bootstrap,$functions,$shell,$env): void {
    $proc=proc_open([$shell,'-s'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,$env);
    fwrite($pipes[0],$bootstrap."\n".$functions."\n".$commands."\n");fclose($pipes[0]);
    $out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);
    if (proc_close($proc)!==0) throw new RuntimeException('Shell fixture failed: '.$out.$err);
  };
  $count=static fn(): int=>(int)$db->query('SELECT COUNT(*) FROM mutations')->fetchColumn();
  $reply=static fn(): array=>$db->query('SELECT * FROM radreply ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
  $groups=static fn(): array=>$db->query('SELECT * FROM radusergroup ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
  $db->exec("INSERT INTO radreply(username,attribute,op,value) VALUES('unrelated','Mikrotik-Total-Limit',':=','999'),('0190000001','Nister-Plan-Code',':=','fixture')");
  $db->exec("INSERT INTO radusergroup(username,groupname,priority) VALUES('unrelated','HS_ACTIVE',0),('0190000001','PLAN_FIXTURE',5)");
  $invoke('set_cap_zero; set_hs_limited');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE value='0'")->fetchColumn()===4,'zero_caps_created_for_both_aliases');
  verify((int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE groupname='HS_LIMITED'")->fetchColumn()===2,'limited_groups_created_for_both_aliases');
  $n=$count();$beforeReply=$reply();$beforeGroups=$groups();
  $invoke('for i in {1..10}; do set_cap_zero; set_hs_limited; done');
  verify($count()===$n,'repeated_limited_sweeps_emit_no_audit_mutations');
  verify($reply()===$beforeReply && $groups()===$beforeGroups,'unchanged_rows_keep_original_ids');
  $db->exec("DELETE FROM radreply WHERE username='233190000001' AND attribute='Mikrotik-Total-Limit'");$invoke('set_cap_zero');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE value='0'")->fetchColumn()===4,'missing_alias_cap_repaired');
  $db->exec("UPDATE radreply SET value='123' WHERE username='0190000001' AND attribute='Mikrotik-Total-Limit'");$invoke('set_cap_zero');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE value='0'")->fetchColumn()===4,'changed_cap_is_enforced');
  $db->exec("UPDATE radreply SET op='=' WHERE value='0'");$invoke('set_cap_zero');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE value='0' AND op=':='")->fetchColumn()===4,'wrong_operator_repaired');
  $db->exec("DELETE FROM radreply WHERE username='233190000001' AND attribute='Mikrotik-Total-Limit'; INSERT INTO radreply(username,attribute,op,value) VALUES('0190000001','Mikrotik-Total-Limit',':=','0')");
  $invoke('set_cap_zero');
  verify((int)$db->query("SELECT COUNT(DISTINCT username,attribute) FROM radreply WHERE value='0'")->fetchColumn()===4,'duplicate_pair_cannot_hide_missing_alias');
  $db->exec("DELETE FROM radusergroup WHERE username='233190000001'; INSERT INTO radusergroup(username,groupname,priority) VALUES('0190000001','HS_LIMITED',0)");$invoke('set_hs_limited');
  verify((int)$db->query("SELECT COUNT(DISTINCT username) FROM radusergroup WHERE groupname='HS_LIMITED'")->fetchColumn()===2,'duplicate_group_cannot_hide_missing_alias');
  $db->exec("UPDATE radusergroup SET priority=9 WHERE groupname='HS_LIMITED'");$invoke('set_hs_limited');
  verify((int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE groupname='HS_LIMITED' AND priority=0")->fetchColumn()===2,'wrong_group_priority_repaired');
  $db->exec("INSERT INTO radreply(username,attribute,op,value) VALUES('0190000001','Mikrotik-Address-List',':=','HS_ACTIVE'),('233190000001','MT-Address-List',':=','HS_ACTIVE')");$invoke('set_hs_limited');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE attribute LIKE '%Address-List'")->fetchColumn()===0,'stale_active_address_lists_removed');
  $invoke('ensure_hs_active');
  verify((int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE groupname='HS_ACTIVE' AND username<>'unrelated'")->fetchColumn()===2,'active_transition_still_applies');
  $n=$count();$beforeGroups=$groups();$invoke('for i in {1..10}; do ensure_hs_active; done');
  verify($count()===$n && $groups()===$beforeGroups,'repeated_active_sweeps_emit_no_audit_mutations');
  $db->exec("INSERT INTO radusergroup(username,groupname,priority) VALUES('0190000001','HS_NOPAID',0)");$invoke('ensure_hs_active');
  verify((int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE groupname IN ('HS_NOPAID','HS_LIMITED')")->fetchColumn()===0,'conflicting_group_is_removed');
  verify((int)$db->query("SELECT COUNT(*) FROM radreply WHERE username='unrelated' AND value='999'")->fetchColumn()===1 && (int)$db->query("SELECT COUNT(*) FROM radreply WHERE attribute='Nister-Plan-Code'")->fetchColumn()===1,'unrelated_replies_and_plan_metadata_preserved');
  verify((int)$db->query("SELECT COUNT(*) FROM radusergroup WHERE username='unrelated' OR groupname='PLAN_FIXTURE'")->fetchColumn()===2,'unrelated_groups_preserved');
  echo 'Native quota state checks passed ('.$checks.').'.PHP_EOL;
} finally { $db->exec('DROP DATABASE nister_quota_storage_test'); }
