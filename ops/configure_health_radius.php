#!/usr/bin/env php
<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !function_exists('posix_geteuid') || posix_geteuid() !== 0) exit(1);
$payRoot = getenv('PAY_PORTAL_ROOT') ?: '/var/www/pay';
require_once $payRoot.'/lib/account_access.php';
require_once $payRoot.'/lib/health_probes.php';
require_once $payRoot.'/lib/radius.php';
$env = app_boot();
$rawUser = (string)($env['HEALTH_RADIUS_USER'] ?? '');
$password = (string)($env['HEALTH_RADIUS_PASS'] ?? '');
if ($password === '' || preg_match('/[\x00-\x1f\x7f]/', $password)) throw new RuntimeException('invalid_health_probe_configuration');
$user = health_radius_probe_username();
$aliases = array_unique(array_merge([$user], $rawUser !== '' ? account_access_users($rawUser) : []));
// Never reuse a customer record for monitoring, including on a later install.
$pdo = rdb_pdo();
foreach (['radcheck','radreply','radusergroup'] as $table) {
  $query = $pdo->prepare("SELECT COUNT(*) FROM $table WHERE username=?");
  $query->execute([$user]);
  if ((int)$query->fetchColumn() !== 0) throw new RuntimeException('reserved_health_identity_in_use');
}
$path = '/etc/freeradius/3.0/mods-config/files/authorize';
$original = (string)file_get_contents($path);
$start = '# BEGIN NISTER local health probe';
$end = '# END NISTER local health probe';
$source = preg_replace('/^'.preg_quote($start,'/').'.*?^'.preg_quote($end,'/').'\R?/ms', '', $original);
$lines = explode("\n", $source);
foreach ($lines as $i=>$line) {
  if (!preg_match('/^"([^"\\\\]+)"\s+(.*)$/', $line, $m) || !in_array($m[1], $aliases, true)) continue;
  // Existing health records are credential-only entries. Refuse to overwrite
  // an unexpected policy stanza or a credential different from configuration.
  $literal = '"'.str_replace(['\\','"'], ['\\\\','\\"'], $password).'"';
  if (trim($m[2]) !== 'Cleartext-Password := '.$literal) throw new RuntimeException('unexpected_existing_health_entry');
  for ($j=$i+1; $j<count($lines) && preg_match('/^\s+\S/', $lines[$j]); $j++) {
    if (!preg_match('/^\s*#/', $lines[$j])) throw new RuntimeException('unexpected_health_reply_policy');
  }
  $lines[$i] = '';
}
$literal = '"'.str_replace(['\\','"'], ['\\\\','\\"'], $password).'"';
$entry = $start."\n# Independent of subscriber SQL records; never authenticates a router client.\n"
  .'"'.$user.'" Packet-Src-IP-Address == 127.0.0.1, NAS-IP-Address == 127.0.0.1, '
  .'NAS-Identifier == "nister-health-local", Cleartext-Password := '.$literal."\n".$end."\n";
$candidate = $entry.ltrim(implode("\n", $lines), "\n");
$defaultPath = realpath('/etc/freeradius/3.0/sites-enabled/default');
if ($defaultPath === false) throw new RuntimeException('radius_default_missing');
$default = (string)file_get_contents($defaultPath);
$snippetPath = '/etc/freeradius/3.0/sites-available/snippets/nister_health_probe.unlang';
$include = '    $INCLUDE '.$snippetPath;
if (strpos($default, $snippetPath) === false) {
  $default = preg_replace('/(^\s*authorize\s*\{\s*\n)/m', '$1'.$include."\n", $default, 1, $count);
  if ($count !== 1) throw new RuntimeException('radius_authorize_section_missing');
}
$snippet = file_get_contents(__DIR__.'/freeradius/nister_health_probe.unlang');
if ($snippet === false) throw new RuntimeException('health_probe_policy_missing');
$updates = [$path=>$candidate, $defaultPath=>$default, $snippetPath=>$snippet];
$updates = array_filter($updates, static fn(string $data, string $target):bool => !is_file($target) || file_get_contents($target) !== $data, ARRAY_FILTER_USE_BOTH);
if (!$updates) { echo "status=unchanged\n"; exit; }
if (!in_array('--write', $argv, true)) { echo "status=change_required\n"; exit; }
foreach ($updates as $target=>$data) {
  $info = stat(is_file($target) ? $target : $defaultPath);
  $temporary = $target.'.health-tmp';
  if (file_put_contents($temporary, $data) !== strlen($data)) throw new RuntimeException('health_entry_write_failed');
  chmod($temporary, $info['mode'] & 0777); chown($temporary, $info['uid']); chgrp($temporary, $info['gid']);
  if (!rename($temporary, $target)) throw new RuntimeException('health_entry_install_failed');
}
echo "status=updated scope=loopback_health_probe credentials=preserved\n";
