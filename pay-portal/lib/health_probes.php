<?php
declare(strict_types=1);

function health_radius_probe_username(): string {
  // Public signup accepts phone accounts; this identity cannot be a subscriber.
  return 'nister-health-local';
}

function health_radius_database_ready(PDO $pdo): bool {
  try {
    $pdo->query('SELECT c.username FROM radcheck c LEFT JOIN radreply r ON r.username=c.username LEFT JOIN radusergroup g ON g.username=c.username LIMIT 1');
    return true;
  } catch (Throwable $e) { return false; }
}

function health_probe_process(array $command, string $input=''): array {
  $process = @proc_open($command, [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
  if (!is_resource($process)) return [1, ''];
  fwrite($pipes[0], $input); fclose($pipes[0]);
  $output = (string)stream_get_contents($pipes[1]); fclose($pipes[1]);
  stream_get_contents($pipes[2]); fclose($pipes[2]);
  return [proc_close($process), $output];
}

function health_radius_probe_payload(string $user, string $password): string {
  return 'User-Name = '.json_encode($user)."\nUser-Password = ".json_encode($password)
    ."\nNAS-IP-Address = 127.0.0.1\nNAS-Identifier = \"nister-health-local\"\nMessage-Authenticator = 0x00\n";
}

function health_radius_probe_accepted(int $exitCode, string $output): bool {
  if ($exitCode !== 0) return false;
  foreach (['Accepted'=>1, 'Rejected'=>0, 'Lost'=>0] as $field=>$expected) {
    if (!preg_match('/(?m)^\s*'.$field.'\s*:\s*(\d+)\s*$/', $output, $m) || (int)$m[1] !== $expected) return false;
  }
  return true;
}

/** Reject error pages and tiny responses instead of publishing false low speeds. */
function health_speed_probe_result(int $exitCode, string $output): array {
  $fields = explode("\n", trim($output));
  $code = (int)($fields[0] ?? 0);
  $result = ['ok'=>false, 'mbps'=>null, 'http_code'=>$code, 'reason'=>'download_failed'];
  if ($exitCode !== 0 || count($fields) !== 4) return $result;
  if (!in_array($code, [200,206], true)) { $result['reason']='http_'.$code; return $result; }
  $type = strtolower(trim(explode(';', $fields[1])[0]));
  if ($type === '' || preg_match('~(?:text/|html|json|xml)~', $type)) { $result['reason']='invalid_content_type'; return $result; }
  if (!is_numeric($fields[2]) || (float)$fields[2] < 262144 || (float)$fields[2] > 2000000) {
    $result['reason']='invalid_download_size'; return $result;
  }
  if (!is_numeric($fields[3]) || !is_finite((float)$fields[3]) || (float)$fields[3] <= 0) return $result;
  return ['ok'=>true, 'mbps'=>round(((float)$fields[3]*8)/1000000, 2), 'http_code'=>$code, 'reason'=>''];
}

function health_speed_probe(string $url): array {
  [$rc,$output] = health_probe_process(['/usr/bin/curl','-L','-sS','--connect-timeout','5','--max-time','20',
    '--range','0-1999999','--max-filesize','2000000','-o','/dev/null','-w',
    "%{http_code}\n%{content_type}\n%{size_download}\n%{speed_download}", $url]);
  return health_speed_probe_result($rc, $output);
}
