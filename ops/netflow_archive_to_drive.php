#!/usr/bin/env php
<?php
declare(strict_types=1);

$payRoot = getenv('PAY_PORTAL_ROOT') ?: '/var/www/pay';
$localRoot = dirname(__DIR__).'/pay-portal';
if (!is_file($payRoot.'/lib/db.php') && is_file($localRoot.'/lib/db.php')) {
  $payRoot = $localRoot;
}

require_once $payRoot.'/lib/db.php';
require_once $payRoot.'/lib/google_drive_archive.php';

$envFile = getenv('NETFLOW_ENV_FILE') ?: '/etc/default/nister-netflow';
$netflowDir = '/var/log/netflow';
$logFile = '/var/log/nister/netflow_drive_archive.log';
$lockFile = '/run/nister_netflow_drive_archive.lock';

function cli_env_load(string $path): array {
  if (!is_readable($path)) return [];
  $out = [];
  foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
    $line = trim((string)$line);
    if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
    [$k, $v] = explode('=', $line, 2);
    $k = trim($k);
    $v = trim($v);
    $v = trim($v, " \t\n\r\0\x0B\"'");
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $k)) $out[$k] = $v;
  }
  return $out;
}

function cli_setting(string $key, string $default = ''): string {
  $v = settings_get($key, null);
  if ($v !== null && trim((string)$v) !== '') return trim((string)$v);
  return $default;
}

function cli_log(string $logFile, string $msg): void {
  $dir = dirname($logFile);
  if (!is_dir($dir)) @mkdir($dir, 0750, true);
  @file_put_contents($logFile, gmdate('Y-m-d\TH:i:s\Z').' '.$msg.PHP_EOL, FILE_APPEND | LOCK_EX);
}

function cli_capture_stamp(string $name): ?string {
  if (!preg_match('/^nfcapd\.(\d{12})(?:\..*)?$/', $name, $m)) return null;
  return $m[1];
}

function cli_capture_rows(string $dir, string $cutoff): array {
  $rows = [];
  $entries = @scandir($dir);
  if (!is_array($entries)) return $rows;
  foreach ($entries as $name) {
    $stamp = cli_capture_stamp($name);
    if ($stamp === null || strcmp($stamp, $cutoff) > 0) continue;
    $path = rtrim($dir, '/').'/'.$name;
    if (!is_file($path) || !is_readable($path)) continue;
    $rows[] = ['stamp' => $stamp, 'name' => $name, 'path' => $path, 'size' => (int)filesize($path)];
  }
  usort($rows, static fn(array $a, array $b): int => strcmp($a['stamp'], $b['stamp']));
  return $rows;
}

function cli_archive_existing(PDO $pdo, string $name, int $size, string $md5): ?array {
  $st = $pdo->prepare("SELECT * FROM netflow_drive_archive
                       WHERE file_name=:n AND size_bytes=:s AND md5=:m
                         AND status IN ('uploaded','deleted')
                       ORDER BY id DESC LIMIT 1");
  $st->execute([':n' => $name, ':s' => $size, ':m' => $md5]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function cli_record_archive(PDO $pdo, array $row): void {
  $st = $pdo->prepare("INSERT INTO netflow_drive_archive
      (file_name, file_path, capture_stamp, size_bytes, md5, drive_file_id, drive_path, status, error, uploaded_at, deleted_at)
    VALUES
      (:file_name, :file_path, :capture_stamp, :size_bytes, :md5, :drive_file_id, :drive_path, :status, :error, :uploaded_at, :deleted_at)");
  $st->execute([
    ':file_name' => $row['file_name'] ?? '',
    ':file_path' => $row['file_path'] ?? '',
    ':capture_stamp' => $row['capture_stamp'] ?? '',
    ':size_bytes' => (int)($row['size_bytes'] ?? 0),
    ':md5' => $row['md5'] ?? '',
    ':drive_file_id' => $row['drive_file_id'] ?? null,
    ':drive_path' => $row['drive_path'] ?? null,
    ':status' => $row['status'] ?? 'uploaded',
    ':error' => $row['error'] ?? null,
    ':uploaded_at' => $row['uploaded_at'] ?? null,
    ':deleted_at' => $row['deleted_at'] ?? null,
  ]);
}

function cli_mark_deleted(PDO $pdo, int $id): void {
  $st = $pdo->prepare("UPDATE netflow_drive_archive
                       SET status='deleted', deleted_at=NOW(), error=NULL
                       WHERE id=:id");
  $st->execute([':id' => $id]);
}

$netflowEnv = cli_env_load($envFile);
if (!empty($netflowEnv['NETFLOW_DIR'])) $netflowDir = $netflowEnv['NETFLOW_DIR'];
if (!empty($netflowEnv['NETFLOW_ARCHIVE_LOG'])) $logFile = $netflowEnv['NETFLOW_ARCHIVE_LOG'];
$logFile = cli_setting('NETFLOW_DRIVE_ARCHIVE_LOG', $logFile);

$lockFp = @fopen($lockFile, 'c');
if (!$lockFp) {
  $lockFile = sys_get_temp_dir().'/nister_netflow_drive_archive.lock';
  $lockFp = fopen($lockFile, 'c');
}
if (!$lockFp || !flock($lockFp, LOCK_EX | LOCK_NB)) {
  cli_log($logFile, 'status=skipped reason=locked');
  exit(0);
}

$startedAt = gmdate('c');
settings_set('NETFLOW_DRIVE_ARCHIVE_LAST_RUN_AT', $startedAt);

if (!gdrive_archive_enabled()) {
  settings_set('NETFLOW_DRIVE_ARCHIVE_LAST_STATUS', 'skipped: disabled');
  cli_log($logFile, 'status=skipped reason=disabled');
  exit(0);
}
if (!gdrive_configured() || !gdrive_connected()) {
  settings_set('NETFLOW_DRIVE_ARCHIVE_LAST_STATUS', 'skipped: Google Drive not connected');
  cli_log($logFile, 'status=skipped reason=not_connected');
  exit(0);
}
if (!is_dir($netflowDir)) {
  settings_set('NETFLOW_DRIVE_ARCHIVE_LAST_STATUS', 'failed: missing NetFlow directory');
  cli_log($logFile, 'status=failed reason=missing_netflow_dir dir='.$netflowDir);
  exit(1);
}

gdrive_archive_bootstrap($PDO);

$minAge = gdrive_archive_min_age_minutes();
$maxFiles = gdrive_archive_max_files_per_run();
$deleteAfterUpload = gdrive_delete_after_upload();
$cutoff = gmdate('YmdHi', time() - ($minAge * 60));
$rows = array_slice(cli_capture_rows($netflowDir, $cutoff), 0, $maxFiles);

$processed = 0;
$uploaded = 0;
$deleted = 0;
$verifiedExisting = 0;
$failed = 0;

foreach ($rows as $capture) {
  $processed++;
  $path = $capture['path'];
  $name = $capture['name'];
  $stamp = $capture['stamp'];
  $size = (int)$capture['size'];
  $md5 = strtolower((string)hash_file('md5', $path));

  try {
    $existing = cli_archive_existing($PDO, $name, $size, $md5);
    if ($existing) {
      $verifiedExisting++;
      if ($deleteAfterUpload && is_file($path) && !empty($existing['drive_file_id'])) {
        $check = gdrive_verify_uploaded_file((string)$existing['drive_file_id'], $size, $md5);
        if (!($check['ok'] ?? false)) throw new RuntimeException('existing_drive_file_verification_failed');
        if (!@unlink($path)) throw new RuntimeException('local_delete_failed');
        cli_mark_deleted($PDO, (int)$existing['id']);
        $deleted++;
        cli_log($logFile, "file=deleted_existing stamp={$stamp} bytes={$size} name={$name}");
      }
      continue;
    }

    $folder = gdrive_ensure_archive_day_folder($stamp);
    $drive = gdrive_upload_file($path, $name, $folder['id']);
    $fileId = trim((string)($drive['id'] ?? ''));
    if ($fileId === '') throw new RuntimeException('google_drive_file_id_missing');
    $verified = gdrive_verify_uploaded_file($fileId, $size, $md5);
    if (!($verified['ok'] ?? false)) throw new RuntimeException('google_drive_verify_failed');

    $deletedAt = null;
    $status = 'uploaded';
    if ($deleteAfterUpload) {
      if (!@unlink($path)) throw new RuntimeException('local_delete_failed_after_verified_upload');
      $deleted++;
      $deletedAt = date('Y-m-d H:i:s');
      $status = 'deleted';
    }

    cli_record_archive($PDO, [
      'file_name' => $name,
      'file_path' => $path,
      'capture_stamp' => $stamp,
      'size_bytes' => $size,
      'md5' => $md5,
      'drive_file_id' => $fileId,
      'drive_path' => $folder['path'].'/'.$name,
      'status' => $status,
      'error' => null,
      'uploaded_at' => date('Y-m-d H:i:s'),
      'deleted_at' => $deletedAt,
    ]);
    $uploaded++;
    cli_log($logFile, "file=ok stamp={$stamp} bytes={$size} deleted=".($deleteAfterUpload ? '1' : '0')." name={$name} drive_id={$fileId}");
  } catch (Throwable $e) {
    $failed++;
    cli_record_archive($PDO, [
      'file_name' => $name,
      'file_path' => $path,
      'capture_stamp' => $stamp,
      'size_bytes' => $size,
      'md5' => $md5,
      'drive_file_id' => null,
      'drive_path' => null,
      'status' => 'failed',
      'error' => $e->getMessage(),
      'uploaded_at' => null,
      'deleted_at' => null,
    ]);
    cli_log($logFile, "file=failed stamp={$stamp} bytes={$size} name={$name} reason=".str_replace(' ', '_', $e->getMessage()));
  }
}

$status = "done: processed={$processed}, uploaded={$uploaded}, deleted={$deleted}, verified_existing={$verifiedExisting}, failed={$failed}";
settings_set('NETFLOW_DRIVE_ARCHIVE_LAST_STATUS', $status);
cli_log($logFile, "status=done processed={$processed} uploaded={$uploaded} deleted={$deleted} verified_existing={$verifiedExisting} failed={$failed}");
exit($failed > 0 ? 1 : 0);
