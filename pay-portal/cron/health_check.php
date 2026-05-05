<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/health.php';
require_once __DIR__.'/../lib/radius.php';

$ENV = app_boot();
nister_require_cli_or_token($ENV);

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
  $radiusOk = 0;
  $radiusNote = 'radius_auth_skipped';
}

// ---- Tunnel route + ping ----
$tunnelHost = (string)($ENV['HEALTH_TUNNEL_HOST'] ?? '10.10.20.4');
$tunnelExpectedDevRaw = (string)($ENV['HEALTH_TUNNEL_DEV'] ?? 'ppp0');
$tunnelAllowedDevs = [];
if ($tunnelExpectedDevRaw !== '') {
  foreach (preg_split('/[,\s]+/', $tunnelExpectedDevRaw, -1, PREG_SPLIT_NO_EMPTY) as $dev) {
    $dev = trim((string)$dev);
    if ($dev !== '') $tunnelAllowedDevs[$dev] = true;
  }
}
$routeDev = null;
[$rcRoute, $routeOut] = sh("ip route get " . escapeshellarg($tunnelHost));
if ($rcRoute === 0 && preg_match('/dev\\s+(\\S+)/', $routeOut, $m)) {
  $routeDev = $m[1];
}

$pingMs = null;
$lossPct = null;
$tunnelOk = null;
$tunnelNote = '';
[$rcPing, $pingOut] = sh("ping -c 3 -W 1 " . escapeshellarg($tunnelHost));
if (preg_match('/([0-9]+(?:[.,][0-9]+)?)% packet loss/', $pingOut, $m)) {
  $lossRaw = str_replace(',', '.', (string)$m[1]);
  if (is_numeric($lossRaw)) {
    $lossPct = (int)round((float)$lossRaw);
    if ($lossPct < 0) $lossPct = 0;
    if ($lossPct > 100) $lossPct = 100;
  }
}
if (preg_match('/rtt .* = ([0-9.]+)\\/([0-9.]+)\\//', $pingOut, $m)) {
  $pingMs = (int)round((float)$m[2]);
}
if ($routeDev !== null) {
  $tunnelOk = ($lossPct !== null && $lossPct < 100) ? 1 : 0;
  if ($tunnelAllowedDevs && !isset($tunnelAllowedDevs[$routeDev])) {
    $tunnelOk = 0;
    $tunnelNote = 'tunnel_route_mismatch';
  } elseif ($tunnelOk === 0) {
    $tunnelNote = 'tunnel_ping_failed';
  }
} else {
  $tunnelOk = 0;
  $tunnelNote = 'tunnel_route_unknown';
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
  // Find active sessions for test user (variants) and target the session's NAS.
  $pdo = db_pdo($ENV);
  $targets = nister_username_variants($coaUser);
  if (!$targets) {
    $coaNote = 'coa_no_active_session';
  } else {
    $ph = implode(',', array_fill(0, count($targets), '?'));
    $st = $pdo->prepare("SELECT username, nasipaddress, framedipaddress, acctsessionid, callingstationid
                         FROM radacct
                         WHERE (
                           (acctstoptime IS NULL OR acctstoptime='0000-00-00 00:00:00')
                           OR (
                             acctstoptime IS NOT NULL
                             AND acctstoptime<>'0000-00-00 00:00:00'
                             AND COALESCE(acctupdatetime, acctstarttime) > acctstoptime
                             AND COALESCE(acctupdatetime, acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
                           )
                         )
                           AND username IN ($ph)
                         ORDER BY acctstarttime DESC
                         LIMIT 50");
    $st->execute($targets);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $allowedNas = [];
    $nasRaw = (string)($ENV['NAS_IPS'] ?? ($ENV['NAS_IP'] ?? ''));
    if ($nasRaw !== '') {
      foreach (preg_split('/[,\s]+/', $nasRaw, -1, PREG_SPLIT_NO_EMPTY) as $ip) {
        $ip = trim($ip);
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $allowedNas[$ip] = true;
      }
    }

    $hasCandidate = false;
    foreach ($rows as $row) {
      $u = trim((string)($row['username'] ?? ''));
      $nas = trim((string)($row['nasipaddress'] ?? ''));
      $ip = trim((string)($row['framedipaddress'] ?? ''));
      $sid = preg_replace('/[^A-Za-z0-9._:-]/', '', (string)($row['acctsessionid'] ?? ''));
      $mac = strtoupper(trim((string)($row['callingstationid'] ?? '')));

      if (!filter_var($nas, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $nas = (filter_var($coaNas, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? $coaNas : '');
      }
      if ($nas === '') continue;
      if ($allowedNas && !isset($allowedNas[$nas])) continue;

      $payloadLines = [];
      $payloadLines[] = 'User-Name = "'.($u !== '' ? $u : $coaUser).'"';
      if ($sid !== '') $payloadLines[] = 'Acct-Session-Id = "'.$sid.'"';
      if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $payloadLines[] = 'Framed-IP-Address = '.$ip;
      if (preg_match('/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/', $mac)) $payloadLines[] = 'Calling-Station-Id = "'.$mac.'"';
      $payloadLines[] = 'NAS-IP-Address = '.$nas;
      $payloadLines[] = 'Message-Authenticator = 0x00';
      if ($sid === '' && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) continue;

      $hasCandidate = true;
      $payload = implode("\n", $payloadLines)."\n";
      $start = microtime(true);
      [$rc, $out] = sh(
        "printf %s " . escapeshellarg($payload) .
        " | /usr/bin/radclient -x -r 1 -t 3 " . escapeshellarg($nas.':'.$coaPort) .
        " disconnect " . escapeshellarg($coaSecret)
      );
      $coaMs = ms($start, microtime(true));
      if (strpos($out, 'Disconnect-ACK') !== false) {
        $coaOk = 1;
        break;
      }
    }

    if ($coaOk !== 1) {
      if (!$hasCandidate) {
        $coaNote = 'coa_no_active_session';
      } else {
        $coaOk = 0;
        $coaNote = 'coa_no_ack';
      }
    }
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
  ($tunnelOk === 0 ? ($tunnelNote !== '' ? $tunnelNote : 'tunnel_down') : ''),
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

$pdo = health_pdo($ENV);
health_insert_sample($pdo, $sample);
health_update_events($pdo, $sample);
