<?php
declare(strict_types=1);
require __DIR__.'/../../pay-portal/lib/health_probes.php';
$checks=0;
function probe_check(string $name, bool $ok): void {
  global $checks;
  if (!$ok) throw new RuntimeException($name);
  $checks++; echo 'PASS health_probe_'.$name.PHP_EOL;
}
$accept="Packet summary:\n Accepted : 1\n Rejected : 0\n Lost : 0\n";
$reject="Packet summary:\n Accepted : 0\n Rejected : 1\n Lost : 0\nExpected Access-Accept got Access-Reject\n";
probe_check('real_accept',health_radius_probe_accepted(0,$accept));
probe_check('reject_is_not_accept',!health_radius_probe_accepted(1,$reject));
probe_check('failed_command_is_not_accept',!health_radius_probe_accepted(1,$accept));
probe_check('timeout_is_not_accept',!health_radius_probe_accepted(0,"Accepted : 0\nRejected : 0\nLost : 1"));
probe_check('malformed_output_is_not_accept',!health_radius_probe_accepted(0,'Access-Accept'));
$payload=health_radius_probe_payload('local-probe','quoted"secret');
probe_check('local_scope_present',strpos($payload,'NAS-IP-Address = 127.0.0.1')!==false && strpos($payload,'NAS-Identifier = "nister-health-local"')!==false);
probe_check('password_quote_escaped',strpos($payload,'"quoted\\"secret"')!==false);
probe_check('binary_download_valid',health_speed_probe_result(0,"200\napplication/octet-stream\n2000000\n1250000")['mbps']===10.0);
probe_check('partial_download_valid',health_speed_probe_result(0,"206\napplication/octet-stream\n1000000\n1250000")['ok']);
probe_check('google_404_rejected',!health_speed_probe_result(0,"404\ntext/html; charset=utf-8\n1652\n2742")['ok']);
probe_check('html_200_rejected',!health_speed_probe_result(0,"200\ntext/html\n1000000\n1250000")['ok']);
probe_check('short_response_rejected',!health_speed_probe_result(0,"200\napplication/octet-stream\n1652\n2742")['ok']);
probe_check('oversized_download_rejected',!health_speed_probe_result(0,"200\napplication/octet-stream\n2000001\n1250000")['ok']);
probe_check('failed_transfer_rejected',!health_speed_probe_result(63,"200\napplication/octet-stream\n1000000\n1250000")['ok']);
probe_check('invalid_speed_rejected',!health_speed_probe_result(0,"200\napplication/octet-stream\n1000000\nNaN")['ok']);
$pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
foreach(['radcheck','radreply','radusergroup'] as $table)$pdo->exec('CREATE TABLE '.$table.'(username TEXT)');
probe_check('empty_radius_schema_is_available',health_radius_database_ready($pdo));
$pdo->exec('DROP TABLE radreply');
probe_check('missing_radius_table_is_unhealthy',!health_radius_database_ready($pdo));
echo 'Health probe checks passed ('.$checks.').'.PHP_EOL;
