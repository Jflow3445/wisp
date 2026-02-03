<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/health.php';
require_once __DIR__.'/../lib/radius.php';

$ENV = app_boot();

if (!function_exists('nister_username_variants')) {
  function nister_username_variants(string $u): array {
    $u = preg_replace('/\D+/', '', $u);
    if ($u === '') return [];
    $last9 = substr($u, -9);
    return array_values(array_unique([$u, '0'.$last9, '233'.$last9]));
  }
}

function sh(string $cmd): array {
  $out = [];
  $rc = 0;
  @exec($cmd . ' 2>/dev/null', $out, $rc);
  return [$rc, implode("\n", $out)];
}

function ms(float $start, float $end): int {
  return (int)round(($end - $start) * 1000);
}

$now = new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get()));

// ---- RADIUS auth check ----
$radiusUser = (string)($ENV['HEALTH_RADIUS_USER'] ?? '');
$radiusPass = (string)($ENV['HEALTH_RADIUS_PASS'] ?? '');
$radiusSecretFile = (string)($ENV['HEALTH_RADIUS_SECRET_FILE'] ?? ($ENV['COA_SECRET_FILE'] ?? '/etc/nister/coa_secret'));
$radiusSecret = is_readable($radiusSecretFile) ? trim((string)file_get_contents($radiusSecretFile)) : '';

$radiusOk = null;
$radiusMs = null;
$radiusNote = '';
if ($radiusUser !== '' && $radiusPass !== '' && $radiusSecret !== '') {
  $payload = "User-Name = \"{$radiusUser}\"\nUser-Password = \"{$radiusPass}\"\n";
  $start = microtime(true);
  [$rc, $out] = sh("printf %s " . escapeshellarg($payload) . " | /usr/bin/radclient -x 127.0.0.1 auth " . escapeshellarg($radiusSecret));
  $radiusMs = ms($start, microtime(true));
  $radiusOk = (strpos($out, 'Access-Accept') !== false) ? 1 : 0;
  if ($radiusOk === 0) $radiusNote = 'radius_auth_failed';
} else {
  $radiusNote = 'radius_auth_skipped';
}

// ---- Tunnel route + ping ----
$routeDev = null;
[$rcRoute, $routeOut] = sh("ip route get 10.10.20.4");
if ($rcRoute === 0 && preg_match('/dev\\s+(\\S+)/', $routeOut, $m)) {
  $routeDev = $m[1];
}

$pingMs = null;
$lossPct = null;
$tunnelOk = null;
[$rcPing, $pingOut] = sh("ping -c 3 -W 1 10.10.20.4");
if (preg_match('/(\\d+)% packet loss/', $pingOut, $m)) {
  $lossPct = (int)$m[1];
}
if (preg_match('/rtt .* = ([0-9.]+)\\/([0-9.]+)\\//', $pingOut, $m)) {
  $pingMs = (int)round((float)$m[2]);
}
if ($routeDev !== null) {
  $tunnelOk = ($lossPct !== null && $lossPct < 100) ? 1 : 0;
}

// ---- CoA test (optional) ----
$coaOk = null;
$coaMs = null;
$coaNote = '';
$coaNas = (string)($ENV['COA_HOST'] ?? '10.10.20.4');
$coaPort = (string)($ENV['COA_PORT'] ?? '3799');
$coaSecretFile = (string)($ENV['COA_SECRET_FILE'] ?? '/etc/nister/coa_secret');
$coaSecret = is_readable($coaSecretFile) ? trim((string)file_get_contents($coaSecretFile)) : '';
$coaUser = (string)($ENV['HEALTH_COA_USER'] ?? '');

if ($coaSecret !== '' && $coaUser !== '') {
  // Find active session IP for the test user (variants)
  $pdo = db_pdo($ENV);
  $targets = nister_username_variants($coaUser);
  $ph = implode(',', array_fill(0, count($targets), '?'));
  $st = $pdo->prepare("SELECT framedipaddress FROM radacct
                       WHERE acctstoptime IS NULL AND username IN ($ph)
                       ORDER BY acctstarttime DESC LIMIT 1");
  $st->execute($targets);
  $ip = (string)($st->fetchColumn() ?: '');

  if ($ip !== '') {
    $payload = "User-Name = \"{$coaUser}\"\nFramed-IP-Address = {$ip}\nMessage-Authenticator = 0x00\n";
    $start = microtime(true);
    [$rc, $out] = sh("printf %s " . escapeshellarg($payload) . " | /usr/bin/radclient -x -r 1 -t 3 {$coaNas}:{$coaPort} disconnect " . escapeshellarg($coaSecret));
    $coaMs = ms($start, microtime(true));
    $coaOk = (strpos($out, 'Disconnect-ACK') !== false) ? 1 : 0;
    if ($coaOk === 0) $coaNote = 'coa_no_ack';
  } else {
    $coaNote = 'coa_no_active_session';
  }
}

// ---- Download speed ----
$speedMpbs = null;
$speedUrl = (string)($ENV['HEALTH_SPEED_URL'] ?? '');
if ($speedUrl === '' && isset($ENV['HEALTH_SPEED_GDRIVE'])) {
  $speedUrl = (string)$ENV['HEALTH_SPEED_GDRIVE'];
}
if ($speedUrl !== '') {
  // Convert Google Drive file link if detected
  if (preg_match('~drive\\.google\\.com/file/d/([A-Za-z0-9_-]+)~', $speedUrl, $m)) {
    $speedUrl = 'https://drive.google.com/uc?export=download&id='.$m[1];
  }
  $start = microtime(true);
  [$rc, $out] = sh("curl -L --connect-timeout 5 --max-time 20 -o /dev/null -w '%{speed_download}' " . escapeshellarg($speedUrl));
  if ($rc === 0 && is_numeric(trim($out))) {
    $bytesPerSec = (float)trim($out);
    $speedMpbs = round(($bytesPerSec * 8) / 1000000, 2);
  }
}

$overallOk = 1;
if ($radiusOk === 0) $overallOk = 0;
if ($tunnelOk === 0) $overallOk = 0;
if ($coaOk === 0) $overallOk = 0;

$noteParts = array_filter([
  $radiusNote,
  $coaNote,
  ($tunnelOk === 0 ? 'tunnel_down' : ''),
]);
$note = $noteParts ? implode(';', $noteParts) : null;

$sample = [
  'ts' => $now->format('Y-m-d H:i:s'),
  'overall_ok' => $overallOk,
  'radius_ok' => $radiusOk,
  'radius_ms' => $radiusMs,
  'coa_ok' => $coaOk,
  'coa_ms' => $coaMs,
  'tunnel_ok' => $tunnelOk,
  'route_dev' => $routeDev,
  'ping_ms' => $pingMs,
  'loss_pct' => $lossPct,
  'speed_mbps' => $speedMpbs,
  'note' => $note,
];

$pdo = db_pdo($ENV);
health_insert_sample($pdo, $sample);
health_update_events($pdo, $sample);
