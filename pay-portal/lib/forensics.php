<?php
declare(strict_types=1);

require_once __DIR__.'/common.php';
require_once __DIR__.'/location.php';

final class ForensicsExportLimitReached extends RuntimeException {}

function forensics_netflow_dir(array $env): string {
  $dir = trim((string)($env['NETFLOW_DIR'] ?? '/var/log/netflow'));
  if ($dir === '') $dir = '/var/log/netflow';
  return $dir;
}

function forensics_nfdump_bin(array $env): string {
  $bin = trim((string)($env['NFDUMP_BIN'] ?? '/usr/bin/nfdump'));
  if ($bin === '') $bin = '/usr/bin/nfdump';
  return $bin;
}

function forensics_window_limit_hours(array $env): int {
  $n = (int)($env['FORENSICS_EXPORT_MAX_HOURS']
    ?? getenv('FORENSICS_EXPORT_MAX_HOURS')
    ?? ($_ENV['FORENSICS_EXPORT_MAX_HOURS'] ?? (24 * 180)));
  if ($n <= 0) $n = 24 * 180;
  if ($n > 24 * 365) $n = 24 * 365;
  return $n;
}

function forensics_row_limit(array $env): int {
  $n = (int)($env['FORENSICS_EXPORT_MAX_ROWS']
    ?? getenv('FORENSICS_EXPORT_MAX_ROWS')
    ?? ($_ENV['FORENSICS_EXPORT_MAX_ROWS'] ?? 500000));
  if ($n <= 0) $n = 500000;
  if ($n > 5000000) $n = 5000000;
  return $n;
}

function forensics_parse_utc_datetime(string $raw): ?DateTimeImmutable {
  $raw = trim($raw);
  if ($raw === '') return null;
  $tz = new DateTimeZone('UTC');

  $fmts = [
    'Y-m-d H:i:s',
    'Y-m-d H:i',
    'Y-m-d\TH:i:s',
    'Y-m-d\TH:i',
    'Y/m/d H:i:s',
    'Y/m/d H:i',
    'd-m-Y H:i:s',
    'd-m-Y H:i',
  ];
  foreach ($fmts as $fmt) {
    $dt = DateTimeImmutable::createFromFormat($fmt, $raw, $tz);
    if ($dt instanceof DateTimeImmutable) return $dt;
  }
  try {
    return new DateTimeImmutable($raw, $tz);
  } catch (Throwable $e) {
    return null;
  }
}

function forensics_resolve_window(string $fromRaw, string $toRaw, int $maxHours): array {
  $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

  $from = forensics_parse_utc_datetime($fromRaw);
  $to = forensics_parse_utc_datetime($toRaw);

  if (!$to) $to = $now;
  if (!$from) $from = $to->sub(new DateInterval('PT1H'));

  if ($to <= $from) {
    return [null, null, '`to` must be greater than `from`'];
  }

  $max = $from->add(new DateInterval('PT'.$maxHours.'H'));
  if ($to > $max) {
    return [null, null, 'Requested window exceeds limit of '.$maxHours.' hours'];
  }

  return [$from, $to, null];
}

function forensics_is_private_ip(string $ip): bool {
  if (filter_var($ip, FILTER_VALIDATE_IP) === false) return false;
  $pub = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
  return $pub === false;
}

function forensics_list_capture_files(string $dir, DateTimeImmutable $from, DateTimeImmutable $to): array {
  if (!is_dir($dir)) return [];
  $entries = @scandir($dir);
  if (!is_array($entries)) return [];

  // nfcapd files are 5-minute buckets by default. Add tolerance for boundary flows.
  $fromTs = $from->getTimestamp() - 600;
  $toTs = $to->getTimestamp() + 600;

  $files = [];
  foreach ($entries as $name) {
    if (!preg_match('/^nfcapd\.(\d{12})(?:\.\d+)?$/', $name, $m)) continue;
    $dt = DateTimeImmutable::createFromFormat('YmdHi', $m[1], new DateTimeZone('UTC'));
    if (!$dt) continue;
    $ts = $dt->getTimestamp();
    if ($ts < $fromTs || $ts > $toTs) continue;
    $path = rtrim($dir, '/').'/'.$name;
    if (!is_file($path)) continue;
    $files[] = ['ts' => $ts, 'path' => $path];
  }

  usort($files, static fn(array $a, array $b): int => $a['ts'] <=> $b['ts']);
  return array_map(static fn(array $x): string => $x['path'], $files);
}

function forensics_msisdn_localish(string $username): string {
  $d = preg_replace('/\D+/', '', $username);
  if ($d === '') return '';
  if (preg_match('/^233(\d{9})$/', $d, $m)) return '0'.$m[1];
  if (preg_match('/^0\d{9}$/', $d)) return $d;
  return $d;
}

function forensics_user_matches_filter(string $username, ?string $filterCanon, ?string $filterLocal): bool {
  if ($filterCanon === null && $filterLocal === null) return true;
  $uDigits = preg_replace('/\D+/', '', $username);
  if ($uDigits === '') return false;
  if ($filterCanon !== null && $uDigits === $filterCanon) return true;
  if ($filterLocal !== null && $uDigits === $filterLocal) return true;
  $uCanon = normalize_msisdn($uDigits);
  if ($filterCanon !== null && $uCanon !== '' && $uCanon === $filterCanon) return true;
  $uLocal = forensics_msisdn_localish($uDigits);
  if ($filterLocal !== null && $uLocal !== '' && $uLocal === $filterLocal) return true;
  return false;
}

function forensics_load_session_map(PDO $r, DateTimeImmutable $from, DateTimeImmutable $to, ?int $locationId = null): array {
  $sql = "\n    SELECT\n      username,\n      callingstationid,\n      framedipaddress,\n      UNIX_TIMESTAMP(acctstarttime) AS start_ts,\n      UNIX_TIMESTAMP(COALESCE(NULLIF(acctstoptime,'0000-00-00 00:00:00'), acctupdatetime, UTC_TIMESTAMP())) AS end_ts\n    FROM radacct\n    WHERE framedipaddress IS NOT NULL\n      AND framedipaddress <> ''\n      AND acctstarttime IS NOT NULL\n      AND acctstarttime <= :to_ts\n      AND COALESCE(NULLIF(acctstoptime,'0000-00-00 00:00:00'), acctupdatetime, UTC_TIMESTAMP()) >= :from_ts";
  $bind = [
    ':from_ts' => $from->format('Y-m-d H:i:s'),
    ':to_ts' => $to->format('Y-m-d H:i:s'),
  ];

  if ($locationId !== null && $locationId > 0) {
    $ips = location_nas_ips($locationId);
    if ($ips) {
      $ph = [];
      foreach ($ips as $i => $ip) {
        $k = ':ip'.$i;
        $ph[] = $k;
        $bind[$k] = $ip;
      }
      $sql .= " AND nasipaddress IN (".implode(',', $ph).")";
    }
  }

  $sql .= "\n    ORDER BY framedipaddress, acctstarttime ASC\n  ";
  $st = $r->prepare($sql);
  $st->execute($bind);

  $map = [];
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $ip = trim((string)($row['framedipaddress'] ?? ''));
    if ($ip === '' || filter_var($ip, FILTER_VALIDATE_IP) === false) continue;

    $startTs = (int)($row['start_ts'] ?? 0);
    $endTs = (int)($row['end_ts'] ?? 0);
    if ($startTs <= 0 || $endTs <= 0) continue;
    if ($endTs < $startTs) $endTs = $startTs;

    $username = trim((string)($row['username'] ?? ''));
    $map[$ip][] = [
      'username' => $username,
      'local' => forensics_msisdn_localish($username),
      'mac' => trim((string)($row['callingstationid'] ?? '')),
      'start_ts' => $startTs,
      'end_ts' => $endTs,
    ];
  }

  return $map;
}

function forensics_match_session(array $sessionMap, string $ip, int $ts): ?array {
  if (!isset($sessionMap[$ip])) return null;
  $best = null;
  $bestDistance = PHP_INT_MAX;

  foreach ($sessionMap[$ip] as $sess) {
    $start = (int)$sess['start_ts'] - 300; // skew tolerance
    $end = (int)$sess['end_ts'] + 300;
    if ($ts >= $start && $ts <= $end) {
      return $sess;
    }

    $distance = min(abs($ts - $start), abs($ts - $end));
    if ($distance < $bestDistance) {
      $bestDistance = $distance;
      $best = $sess;
    }
  }

  // avoid bad attribution across large gaps
  if ($bestDistance <= 900) return $best;
  return null;
}

function forensics_csv_rows_from_file(string $nfdumpBin, string $file, callable $onRow): void {
  $cmd = escapeshellcmd($nfdumpBin).' -r '.escapeshellarg($file).' -o csv';
  $desc = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
  ];
  $proc = @proc_open($cmd, $desc, $pipes);
  if (!is_resource($proc)) return;

  @fclose($pipes[0]);
  $header = null;

  try {
    while (($line = fgets($pipes[1])) !== false) {
      $line = trim($line);
      if ($line === '' || $line === 'No matched flows') continue;

      $cols = str_getcsv($line);
      if (!is_array($cols) || $cols === []) continue;

      if ($header === null) {
        if (($cols[0] ?? '') === 'ts') {
          $header = array_flip($cols);
        }
        continue;
      }

      if (($cols[0] ?? '') === 'ts') {
        // nfdump may emit header again for each block
        $header = array_flip($cols);
        continue;
      }

      $pick = static function(string $k) use ($cols, $header): string {
        return isset($header[$k], $cols[$header[$k]]) ? trim((string)$cols[$header[$k]]) : '';
      };

      $row = [
        'ts' => $pick('ts'),
        'te' => $pick('te'),
        'td' => $pick('td'),
        'sa' => $pick('sa'),
        'da' => $pick('da'),
        'sp' => $pick('sp'),
        'dp' => $pick('dp'),
        'pr' => $pick('pr'),
        'flg' => $pick('flg'),
        'ipkt' => $pick('ipkt'),
        'ibyt' => $pick('ibyt'),
        'ra' => $pick('ra'),
        'exid' => $pick('exid'),
      ];

      $onRow($row);
    }
  } finally {
    @fclose($pipes[1]);
    @fclose($pipes[2]);
    @proc_close($proc);
  }
}

function forensics_stream_mapped_csv($out, array $env, PDO $r, DateTimeImmutable $from, DateTimeImmutable $to, ?string $userFilterCanon = null, ?int $locationId = null): array {
  $dir = forensics_netflow_dir($env);
  $bin = forensics_nfdump_bin($env);
  $rowLimit = forensics_row_limit($env);

  $files = forensics_list_capture_files($dir, $from, $to);
  $sessionMap = forensics_load_session_map($r, $from, $to, $locationId);
  $exporterMap = location_exporter_map($locationId);

  $filterCanon = null;
  $filterLocal = null;
  if ($userFilterCanon !== null && $userFilterCanon !== '') {
    $filterCanon = normalize_msisdn($userFilterCanon);
    if ($filterCanon === '') $filterCanon = preg_replace('/\D+/', '', $userFilterCanon);
    if ($filterCanon !== '') $filterLocal = forensics_msisdn_localish($filterCanon);
  }

  fputcsv($out, [
    'flow_start_utc', 'flow_end_utc', 'duration_sec',
    'src_ip', 'src_port', 'dst_ip', 'dst_port',
    'protocol', 'tcp_flags',
    'bytes', 'packets',
    'exporter_public_ip', 'exporter_id',
    'location_id', 'location_code',
    'src_username', 'src_user_local', 'src_user_mac',
    'dst_username', 'dst_user_local', 'dst_user_mac',
    'user_match', 'user_remote_ip'
  ]);

  $fromTs = $from->getTimestamp();
  $toTs = $to->getTimestamp();

  $rows = 0;
  $processedFiles = 0;

  foreach ($files as $file) {
    $processedFiles++;
    forensics_csv_rows_from_file($bin, $file, function(array $flow) use (
      &$rows, $rowLimit, $out, $fromTs, $toTs,
      $sessionMap, $filterCanon, $filterLocal, $exporterMap, $locationId
    ): void {
      $sa = $flow['sa'] ?? '';
      $da = $flow['da'] ?? '';
      if ($sa === '' || $da === '') return;

      $ts = strtotime(($flow['ts'] ?? '').' UTC');
      $te = strtotime(($flow['te'] ?? '').' UTC');
      if ($ts === false) return;
      if ($te === false) $te = $ts;

      if ($ts > $toTs || $te < $fromTs) return;

      $locMeta = location_resolve_by_exporter($exporterMap, (string)($flow['ra'] ?? ''), (string)($flow['exid'] ?? ''));
      $flowLocId = (int)($locMeta['id'] ?? 0);
      $flowLocCode = (string)($locMeta['code'] ?? '');
      if ($locationId !== null && $locationId > 0 && $flowLocId !== $locationId) return;

      $srcSess = forensics_match_session($sessionMap, $sa, (int)$ts);
      $dstSess = forensics_match_session($sessionMap, $da, (int)$ts);

      $srcUser = (string)($srcSess['username'] ?? '');
      $dstUser = (string)($dstSess['username'] ?? '');
      $srcLocal = (string)($srcSess['local'] ?? '');
      $dstLocal = (string)($dstSess['local'] ?? '');
      $srcMac = (string)($srcSess['mac'] ?? '');
      $dstMac = (string)($dstSess['mac'] ?? '');

      $hasUserFilter = ($filterCanon !== null || $filterLocal !== null);
      $srcMatch = $hasUserFilter ? forensics_user_matches_filter($srcUser, $filterCanon, $filterLocal) : false;
      $dstMatch = $hasUserFilter ? forensics_user_matches_filter($dstUser, $filterCanon, $filterLocal) : false;

      if ($hasUserFilter && !$srcMatch && !$dstMatch) {
        return;
      }

      $match = 'none';
      $userRemoteIp = '';
      if ($srcMatch && $dstMatch) {
        $match = 'src+dst';
        $userRemoteIp = $da;
      } elseif ($srcMatch) {
        $match = 'src';
        $userRemoteIp = $da;
      } elseif ($dstMatch) {
        $match = 'dst';
        $userRemoteIp = $sa;
      } else {
        // no explicit filter; infer direction using private/public heuristic
        if ($srcUser !== '' && $dstUser === '') {
          $match = 'src';
          $userRemoteIp = $da;
        } elseif ($dstUser !== '' && $srcUser === '') {
          $match = 'dst';
          $userRemoteIp = $sa;
        } elseif ($srcUser === '' && $dstUser === '') {
          if (forensics_is_private_ip($sa) && !forensics_is_private_ip($da)) {
            $userRemoteIp = $da;
          } elseif (forensics_is_private_ip($da) && !forensics_is_private_ip($sa)) {
            $userRemoteIp = $sa;
          }
        }
      }

      $rows++;
      if ($rows > $rowLimit) {
        throw new ForensicsExportLimitReached('row limit reached');
      }

      fputcsv($out, [
        gmdate('Y-m-d H:i:s', (int)$ts),
        gmdate('Y-m-d H:i:s', (int)$te),
        (string)($flow['td'] ?? ''),
        $sa,
        (string)($flow['sp'] ?? ''),
        $da,
        (string)($flow['dp'] ?? ''),
        (string)($flow['pr'] ?? ''),
        (string)($flow['flg'] ?? ''),
        (string)($flow['ibyt'] ?? ''),
        (string)($flow['ipkt'] ?? ''),
        (string)($flow['ra'] ?? ''),
        (string)($flow['exid'] ?? ''),
        $flowLocId > 0 ? (string)$flowLocId : '',
        $flowLocCode,
        $srcUser,
        $srcLocal,
        $srcMac,
        $dstUser,
        $dstLocal,
        $dstMac,
        $match,
        $userRemoteIp,
      ]);
    });
  }

  return [
    'files' => $processedFiles,
    'rows' => $rows,
    'row_limit' => $rowLimit,
    'netflow_dir' => $dir,
    'location_id' => $locationId,
  ];
}

function forensics_stream_raw_csv($out, array $env, DateTimeImmutable $from, DateTimeImmutable $to, ?int $locationId = null): array {
  $dir = forensics_netflow_dir($env);
  $bin = forensics_nfdump_bin($env);
  $rowLimit = forensics_row_limit($env);
  $exporterMap = location_exporter_map($locationId);

  $files = forensics_list_capture_files($dir, $from, $to);
  $fromTs = $from->getTimestamp();
  $toTs = $to->getTimestamp();

  fputcsv($out, [
    'flow_start_utc','flow_end_utc','duration_sec',
    'src_ip','src_port','dst_ip','dst_port','protocol','tcp_flags',
    'bytes','packets','exporter_public_ip','exporter_id','location_id','location_code'
  ]);

  $rows = 0;
  $processedFiles = 0;

  foreach ($files as $file) {
    $processedFiles++;
    forensics_csv_rows_from_file($bin, $file, function(array $flow) use (&$rows, $rowLimit, $out, $fromTs, $toTs, $exporterMap, $locationId): void {
      $ts = strtotime(($flow['ts'] ?? '').' UTC');
      $te = strtotime(($flow['te'] ?? '').' UTC');
      if ($ts === false) return;
      if ($te === false) $te = $ts;
      if ($ts > $toTs || $te < $fromTs) return;

      $locMeta = location_resolve_by_exporter($exporterMap, (string)($flow['ra'] ?? ''), (string)($flow['exid'] ?? ''));
      $flowLocId = (int)($locMeta['id'] ?? 0);
      $flowLocCode = (string)($locMeta['code'] ?? '');
      if ($locationId !== null && $locationId > 0 && $flowLocId !== $locationId) return;

      $rows++;
      if ($rows > $rowLimit) {
        throw new ForensicsExportLimitReached('row limit reached');
      }

      fputcsv($out, [
        gmdate('Y-m-d H:i:s', (int)$ts),
        gmdate('Y-m-d H:i:s', (int)$te),
        (string)($flow['td'] ?? ''),
        (string)($flow['sa'] ?? ''),
        (string)($flow['sp'] ?? ''),
        (string)($flow['da'] ?? ''),
        (string)($flow['dp'] ?? ''),
        (string)($flow['pr'] ?? ''),
        (string)($flow['flg'] ?? ''),
        (string)($flow['ibyt'] ?? ''),
        (string)($flow['ipkt'] ?? ''),
        (string)($flow['ra'] ?? ''),
        (string)($flow['exid'] ?? ''),
        $flowLocId > 0 ? (string)$flowLocId : '',
        $flowLocCode,
      ]);
    });
  }

  return [
    'files' => $processedFiles,
    'rows' => $rows,
    'row_limit' => $rowLimit,
    'netflow_dir' => $dir,
    'location_id' => $locationId,
  ];
}

function forensics_collector_status(array $env): array {
  $dir = forensics_netflow_dir($env);
  $bin = forensics_nfdump_bin($env);

  $running = trim((string)@shell_exec('pgrep -x nfcapd | head -n1')) !== '';

  $latest = null;
  if (is_dir($dir)) {
    $entries = @scandir($dir);
    if (is_array($entries)) {
      foreach ($entries as $name) {
        if (!preg_match('/^nfcapd\.(\d{12})(?:\.\d+)?$/', $name, $m)) continue;
        $path = rtrim($dir, '/').'/'.$name;
        if (!is_file($path)) continue;
        $mtime = (int)@filemtime($path);
        $size = (int)@filesize($path);
        if ($latest === null || $mtime > $latest['mtime']) {
          $latest = ['file' => $path, 'name' => $name, 'mtime' => $mtime, 'size' => $size];
        }
      }
    }
  }

  $now = time();
  $recentFiles = 0;
  $recentNonEmptyFiles = 0;
  if (is_dir($dir)) {
    $entries = @scandir($dir);
    if (is_array($entries)) {
      foreach ($entries as $name) {
        if (!preg_match('/^nfcapd\.(\d{12})(?:\.\d+)?$/', $name)) continue;
        $path = rtrim($dir, '/').'/'.$name;
        if (!is_file($path)) continue;
        $mtime = (int)@filemtime($path);
        if ($mtime < ($now - 3600)) continue;
        $recentFiles++;
        if (((int)@filesize($path)) > 300) $recentNonEmptyFiles++;
      }
    }
  }

  $latestFlowCount = null;
  if ($latest && is_file($latest['file']) && is_executable($bin)) {
    $cmd = escapeshellcmd($bin).' -r '.escapeshellarg($latest['file']).' -o csv -n 3';
    $txt = (string)@shell_exec($cmd);
    if ($txt !== '') {
      $lines = array_values(array_filter(array_map('trim', preg_split('/\R+/', $txt))));
      if ($lines === ['No matched flows']) {
        $latestFlowCount = 0;
      } else {
        $cnt = 0;
        foreach ($lines as $line) {
          if ($line === '' || str_starts_with($line, 'ts,')) continue;
          if ($line === 'No matched flows') continue;
          $cnt++;
        }
        $latestFlowCount = $cnt;
      }
    }
  }

  $receiving = $running && ($recentNonEmptyFiles > 0 || ($latestFlowCount !== null && $latestFlowCount > 0));

  return [
    'collector_running' => $running,
    'netflow_dir' => $dir,
    'latest_file' => $latest['name'] ?? null,
    'latest_file_size' => $latest['size'] ?? null,
    'latest_file_mtime_utc' => isset($latest['mtime']) ? gmdate('Y-m-d H:i:s', $latest['mtime']) : null,
    'latest_file_sample_flows' => $latestFlowCount,
    'files_last_60m' => $recentFiles,
    'nonempty_files_last_60m' => $recentNonEmptyFiles,
    'receiving_recent' => $receiving,
  ];
}
