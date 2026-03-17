<?php
declare(strict_types=1);

require_once __DIR__.'/../lib/admin_auth.php';
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/forensics.php';

$ENV = admin_boot();
admin_require_login();

@set_time_limit(0);
@ini_set('memory_limit', '768M');

$mode = strtolower(trim((string)($_GET['mode'] ?? 'mapped')));
if (!in_array($mode, ['mapped', 'raw'], true)) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "invalid mode\n";
  exit;
}

$maxHours = forensics_window_limit_hours($ENV);
[$from, $to, $err] = forensics_resolve_window(
  (string)($_GET['from'] ?? ''),
  (string)($_GET['to'] ?? ''),
  $maxHours
);
if ($err !== null || !$from || !$to) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo "bad request: ".$err."\n";
  exit;
}

$userRaw = trim((string)($_GET['msisdn'] ?? ''));
$userCanon = null;
if ($userRaw !== '') {
  $userCanon = normalize_msisdn($userRaw);
  if ($userCanon === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "bad request: invalid msisdn\n";
    exit;
  }
}

$baseName = [
  'traffic',
  $mode,
  $from->format('Ymd_His'),
  $to->format('Ymd_His'),
];
if ($userCanon !== null) {
  $baseName[] = forensics_msisdn_localish($userCanon);
}
$filename = implode('_', $baseName).'.csv';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="'.$filename.'"');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Accel-Buffering: no');

$out = fopen('php://output', 'wb');
if (!$out) {
  http_response_code(500);
  echo "failed to open output\n";
  exit;
}

$summary = null;
try {
  if ($mode === 'raw') {
    $summary = forensics_stream_raw_csv($out, $ENV, $from, $to);
  } else {
    $r = rdb_pdo();
    $summary = forensics_stream_mapped_csv($out, $ENV, $r, $from, $to, $userCanon);
  }
} catch (ForensicsExportLimitReached $e) {
  // Keep CSV valid and indicate truncation to browser/clients.
  header('X-Export-Truncated: 1');
} catch (Throwable $e) {
  // Append terminal error marker row so admin still gets context in downloaded file.
  fputcsv($out, ['ERROR', $e->getMessage()]);
}

if (is_array($summary)) {
  header('X-Export-Files: '.(string)($summary['files'] ?? 0));
  header('X-Export-Rows: '.(string)($summary['rows'] ?? 0));
  header('X-Export-Row-Limit: '.(string)($summary['row_limit'] ?? 0));
}

fclose($out);
exit;
