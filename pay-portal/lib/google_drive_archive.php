<?php
declare(strict_types=1);

require_once __DIR__.'/common.php';
require_once __DIR__.'/settings.php';

const NISTER_GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const NISTER_GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const NISTER_GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const NISTER_GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const NISTER_GOOGLE_DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const NISTER_GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const NISTER_GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

function gdrive_env_value(array $keys, string $default = ''): string {
  $env = app_boot();
  foreach ($keys as $key) {
    if (isset($env[$key]) && trim((string)$env[$key]) !== '') return trim((string)$env[$key]);
    if (isset($_ENV[$key]) && trim((string)$_ENV[$key]) !== '') return trim((string)$_ENV[$key]);
    $v = getenv($key);
    if ($v !== false && trim((string)$v) !== '') return trim((string)$v);
  }
  return $default;
}

function gdrive_setting(string $key, string $default = '', array $envKeys = []): string {
  $v = settings_get($key, null);
  if ($v !== null && trim((string)$v) !== '') return trim((string)$v);
  return gdrive_env_value($envKeys ?: [$key], $default);
}

function gdrive_truthy($value, bool $default = false): bool {
  if ($value === null || $value === '') return $default;
  if (is_bool($value)) return $value;
  $s = strtolower(trim((string)$value));
  if ($s === '') return $default;
  return in_array($s, ['1','true','yes','y','on','enabled'], true);
}

function gdrive_client_id(): string {
  return gdrive_setting('GOOGLE_DRIVE_CLIENT_ID', '', ['GOOGLE_DRIVE_CLIENT_ID']);
}

function gdrive_client_secret(): string {
  return gdrive_setting('GOOGLE_DRIVE_CLIENT_SECRET', '', ['GOOGLE_DRIVE_CLIENT_SECRET']);
}

function gdrive_scope(): string {
  return NISTER_GOOGLE_DRIVE_SCOPE;
}

function gdrive_redirect_uri(): string {
  $configured = gdrive_setting('GOOGLE_DRIVE_REDIRECT_URI', '', ['GOOGLE_DRIVE_REDIRECT_URI']);
  if ($configured !== '') return $configured;

  $base = gdrive_setting('PAY_BASE', '', ['PAY_BASE','PAY_PORTAL_BASE']);
  if ($base === '') {
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host !== '') {
      $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
      $base = ($https ? 'https://' : 'http://') . $host;
    }
  }
  if ($base === '') $base = 'https://pay.nister.org';
  return rtrim($base, '/') . '/admin/google_drive_callback.php';
}

function gdrive_archive_enabled(): bool {
  return gdrive_truthy(settings_get('NETFLOW_DRIVE_ARCHIVE_ENABLED', '0'), false);
}

function gdrive_delete_after_upload(): bool {
  return gdrive_truthy(settings_get('NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD', '1'), true);
}

function gdrive_archive_min_age_minutes(): int {
  $v = (int)preg_replace('/\D+/', '', settings_get('NETFLOW_ARCHIVE_MIN_AGE_MINUTES', '1440') ?? '1440');
  return max(30, min(43200, $v ?: 1440));
}

function gdrive_archive_max_files_per_run(): int {
  $v = (int)preg_replace('/\D+/', '', settings_get('NETFLOW_ARCHIVE_MAX_FILES_PER_RUN', '500') ?? '500');
  return max(1, min(5000, $v ?: 500));
}

function gdrive_root_folder_name(): string {
  $name = gdrive_setting('GOOGLE_DRIVE_ROOT_FOLDER_NAME', 'NISTER NetFlow Forensics', ['GOOGLE_DRIVE_ROOT_FOLDER_NAME']);
  $name = trim(preg_replace('/[\r\n\t]+/', ' ', $name));
  return $name !== '' ? substr($name, 0, 180) : 'NISTER NetFlow Forensics';
}

function gdrive_configured(): bool {
  return gdrive_client_id() !== '' && gdrive_client_secret() !== '';
}

function gdrive_connected(): bool {
  return settings_get('GOOGLE_DRIVE_REFRESH_TOKEN', '') !== '';
}

function gdrive_token_expires_at(): int {
  return (int)(settings_get('GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRES_AT', '0') ?? '0');
}

function gdrive_public_status(): array {
  $secret = gdrive_client_secret();
  $refresh = settings_get('GOOGLE_DRIVE_REFRESH_TOKEN', '') ?? '';
  $lastStatus = settings_get('NETFLOW_DRIVE_ARCHIVE_LAST_STATUS', '') ?? '';
  return [
    'configured' => gdrive_configured(),
    'connected' => $refresh !== '',
    'enabled' => gdrive_archive_enabled(),
    'delete_after_upload' => gdrive_delete_after_upload(),
    'client_secret_set' => $secret !== '',
    'redirect_uri' => gdrive_redirect_uri(),
    'scope' => gdrive_scope(),
    'root_folder_name' => gdrive_root_folder_name(),
    'root_folder_id' => settings_get('GOOGLE_DRIVE_ROOT_FOLDER_ID', '') ?? '',
    'parent_folder_id' => settings_get('GOOGLE_DRIVE_PARENT_FOLDER_ID', '') ?? '',
    'connected_at' => settings_get('GOOGLE_DRIVE_CONNECTED_AT', '') ?? '',
    'last_status' => $lastStatus,
    'last_run_at' => settings_get('NETFLOW_DRIVE_ARCHIVE_LAST_RUN_AT', '') ?? '',
    'min_age_minutes' => gdrive_archive_min_age_minutes(),
    'max_files_per_run' => gdrive_archive_max_files_per_run(),
  ];
}

function gdrive_base64url_encode(string $raw): string {
  return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function gdrive_base64url_decode(string $raw): ?string {
  $padded = strtr($raw, '-_', '+/');
  $pad = strlen($padded) % 4;
  if ($pad > 0) $padded .= str_repeat('=', 4 - $pad);
  $decoded = base64_decode($padded, true);
  return $decoded === false ? null : $decoded;
}

function gdrive_state_secret(): string {
  $secret = gdrive_client_secret();
  if ($secret === '') $secret = gdrive_env_value(['APP_SECRET','APP_KEY','APP_ADMIN_PASS_HASH'], '');
  if ($secret === '') throw new RuntimeException('google_drive_state_secret_missing');
  return hash('sha256', gdrive_client_id().'|'.$secret, true);
}

function gdrive_create_state(int $ttlSeconds = 900): string {
  $payload = [
    'nonce' => bin2hex(random_bytes(16)),
    'iat' => time(),
    'exp' => time() + max(60, min(3600, $ttlSeconds)),
  ];
  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($json === false) throw new RuntimeException('google_drive_state_failed');
  $body = gdrive_base64url_encode($json);
  $sig = hash_hmac('sha256', $body, gdrive_state_secret());
  return $body.'.'.$sig;
}

function gdrive_verify_state(string $state): bool {
  $parts = explode('.', $state, 2);
  if (count($parts) !== 2) return false;
  [$body, $sig] = $parts;
  if ($body === '' || $sig === '') return false;
  $expected = hash_hmac('sha256', $body, gdrive_state_secret());
  if (!hash_equals($expected, $sig)) return false;
  $json = gdrive_base64url_decode($body);
  if ($json === null) return false;
  $payload = json_decode($json, true);
  if (!is_array($payload)) return false;
  $exp = (int)($payload['exp'] ?? 0);
  return $exp >= time();
}

function gdrive_http_request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 60): array {
  if (!function_exists('curl_init')) throw new RuntimeException('curl_missing');

  $responseHeaders = [];
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
  curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  curl_setopt($ch, CURLOPT_HEADERFUNCTION, static function($ch, string $line) use (&$responseHeaders): int {
    $trim = trim($line);
    if ($trim === '' || stripos($trim, 'HTTP/') === 0) return strlen($line);
    $parts = explode(':', $trim, 2);
    if (count($parts) === 2) $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
    return strlen($line);
  });
  if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

  $raw = curl_exec($ch);
  $err = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($raw === false) throw new RuntimeException('google_http_error' . ($err !== '' ? ': '.$err : ''));
  $json = json_decode((string)$raw, true);
  return [
    'code' => $code,
    'body' => (string)$raw,
    'json' => is_array($json) ? $json : null,
    'headers' => $responseHeaders,
  ];
}

function gdrive_http_upload(string $url, string $path, string $accessToken, int $size): array {
  if (!function_exists('curl_init')) throw new RuntimeException('curl_missing');
  $fh = fopen($path, 'rb');
  if (!$fh) throw new RuntimeException('upload_file_open_failed');

  $responseHeaders = [];
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_UPLOAD, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
  curl_setopt($ch, CURLOPT_INFILE, $fh);
  curl_setopt($ch, CURLOPT_INFILESIZE, $size);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
  curl_setopt($ch, CURLOPT_TIMEOUT, max(120, min(900, (int)ceil($size / 65536) + 120)));
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $accessToken,
    'Content-Type: application/octet-stream',
    'Content-Length: ' . $size,
  ]);
  curl_setopt($ch, CURLOPT_HEADERFUNCTION, static function($ch, string $line) use (&$responseHeaders): int {
    $trim = trim($line);
    if ($trim === '' || stripos($trim, 'HTTP/') === 0) return strlen($line);
    $parts = explode(':', $trim, 2);
    if (count($parts) === 2) $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
    return strlen($line);
  });

  $raw = curl_exec($ch);
  $err = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  fclose($fh);

  if ($raw === false) throw new RuntimeException('google_upload_error' . ($err !== '' ? ': '.$err : ''));
  $json = json_decode((string)$raw, true);
  return [
    'code' => $code,
    'body' => (string)$raw,
    'json' => is_array($json) ? $json : null,
    'headers' => $responseHeaders,
  ];
}

function gdrive_oauth_url(string $state): string {
  if (!gdrive_configured()) throw new RuntimeException('google_drive_client_missing');
  $query = [
    'response_type' => 'code',
    'client_id' => gdrive_client_id(),
    'redirect_uri' => gdrive_redirect_uri(),
    'scope' => gdrive_scope(),
    'access_type' => 'offline',
    'include_granted_scopes' => 'true',
    'prompt' => 'consent select_account',
    'state' => $state,
  ];
  return NISTER_GOOGLE_OAUTH_AUTH_URL . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

function gdrive_store_token_response(array $json): void {
  if (!empty($json['access_token'])) settings_set('GOOGLE_DRIVE_ACCESS_TOKEN', (string)$json['access_token']);
  if (!empty($json['refresh_token'])) settings_set('GOOGLE_DRIVE_REFRESH_TOKEN', (string)$json['refresh_token']);
  if (!empty($json['scope'])) settings_set('GOOGLE_DRIVE_GRANTED_SCOPE', (string)$json['scope']);
  if (!empty($json['token_type'])) settings_set('GOOGLE_DRIVE_TOKEN_TYPE', (string)$json['token_type']);
  $ttl = (int)($json['expires_in'] ?? 0);
  if ($ttl > 0) settings_set('GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRES_AT', (string)(time() + $ttl));
}

function gdrive_token_request(array $payload): array {
  if (!gdrive_configured()) throw new RuntimeException('google_drive_client_missing');
  $payload['client_id'] = gdrive_client_id();
  $payload['client_secret'] = gdrive_client_secret();
  $res = gdrive_http_request('POST', NISTER_GOOGLE_OAUTH_TOKEN_URL, [
    'Accept: application/json',
    'Content-Type: application/x-www-form-urlencoded',
  ], http_build_query($payload, '', '&', PHP_QUERY_RFC3986), 45);
  if ($res['code'] < 200 || $res['code'] >= 300 || !is_array($res['json'])) {
    $detail = is_array($res['json']) ? (string)($res['json']['error'] ?? 'google_token_failed') : 'google_token_failed';
    throw new RuntimeException($detail);
  }
  return $res['json'];
}

function gdrive_exchange_code(string $code): array {
  $json = gdrive_token_request([
    'code' => $code,
    'grant_type' => 'authorization_code',
    'redirect_uri' => gdrive_redirect_uri(),
  ]);
  gdrive_store_token_response($json);
  if (!gdrive_connected()) throw new RuntimeException('google_drive_refresh_token_missing');
  settings_set('GOOGLE_DRIVE_CONNECTED_AT', gmdate('c'));
  return $json;
}

function gdrive_refresh_access_token(): string {
  $refresh = settings_get('GOOGLE_DRIVE_REFRESH_TOKEN', '') ?? '';
  if ($refresh === '') throw new RuntimeException('google_drive_not_connected');
  $json = gdrive_token_request([
    'refresh_token' => $refresh,
    'grant_type' => 'refresh_token',
  ]);
  gdrive_store_token_response($json);
  $token = settings_get('GOOGLE_DRIVE_ACCESS_TOKEN', '') ?? '';
  if ($token === '') throw new RuntimeException('google_drive_access_token_missing');
  return $token;
}

function gdrive_access_token(): string {
  $token = settings_get('GOOGLE_DRIVE_ACCESS_TOKEN', '') ?? '';
  if ($token !== '' && gdrive_token_expires_at() > (time() + 120)) return $token;
  return gdrive_refresh_access_token();
}

function gdrive_api_request(string $method, string $url, ?array $payload = null, int $timeout = 60, bool $retry = true): array {
  $token = gdrive_access_token();
  $headers = [
    'Authorization: Bearer ' . $token,
    'Accept: application/json',
  ];
  $body = null;
  if ($payload !== null) {
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $headers[] = 'Content-Type: application/json; charset=UTF-8';
  }
  $res = gdrive_http_request($method, $url, $headers, $body, $timeout);
  if ($retry && $res['code'] === 401) {
    gdrive_refresh_access_token();
    return gdrive_api_request($method, $url, $payload, $timeout, false);
  }
  if ($res['code'] < 200 || $res['code'] >= 300 || ($res['body'] !== '' && $res['json'] === null)) {
    $detail = is_array($res['json']) ? (string)($res['json']['error']['message'] ?? 'google_drive_api_failed') : 'google_drive_api_failed';
    throw new RuntimeException($detail);
  }
  return $res['json'] ?? [];
}

function gdrive_q_escape(string $s): string {
  return str_replace(["\\", "'"], ["\\\\", "\\'"], $s);
}

function gdrive_find_folder(string $name, ?string $parentId = null): ?string {
  $q = "mimeType='" . NISTER_GOOGLE_DRIVE_FOLDER_MIME . "' and trashed=false and name='" . gdrive_q_escape($name) . "'";
  if ($parentId !== null && $parentId !== '') $q .= " and '" . gdrive_q_escape($parentId) . "' in parents";
  $url = NISTER_GOOGLE_DRIVE_API . '/files?' . http_build_query([
    'q' => $q,
    'fields' => 'files(id,name)',
    'pageSize' => '10',
    'spaces' => 'drive',
  ], '', '&', PHP_QUERY_RFC3986);
  $json = gdrive_api_request('GET', $url, null, 45);
  $files = is_array($json['files'] ?? null) ? $json['files'] : [];
  foreach ($files as $file) {
    $id = trim((string)($file['id'] ?? ''));
    if ($id !== '') return $id;
  }
  return null;
}

function gdrive_create_folder(string $name, ?string $parentId = null): string {
  $payload = [
    'name' => $name,
    'mimeType' => NISTER_GOOGLE_DRIVE_FOLDER_MIME,
  ];
  if ($parentId !== null && $parentId !== '') $payload['parents'] = [$parentId];
  $url = NISTER_GOOGLE_DRIVE_API . '/files?fields=id,name';
  $json = gdrive_api_request('POST', $url, $payload, 45);
  $id = trim((string)($json['id'] ?? ''));
  if ($id === '') throw new RuntimeException('google_drive_folder_create_failed');
  return $id;
}

function gdrive_find_or_create_folder(string $name, ?string $parentId = null): string {
  $found = gdrive_find_folder($name, $parentId);
  if ($found !== null) return $found;
  return gdrive_create_folder($name, $parentId);
}

function gdrive_ensure_archive_root(): string {
  $existing = trim((string)(settings_get('GOOGLE_DRIVE_ROOT_FOLDER_ID', '') ?? ''));
  if ($existing !== '') return $existing;
  $parent = trim((string)(settings_get('GOOGLE_DRIVE_PARENT_FOLDER_ID', '') ?? ''));
  $id = gdrive_find_or_create_folder(gdrive_root_folder_name(), $parent !== '' ? $parent : null);
  settings_set('GOOGLE_DRIVE_ROOT_FOLDER_ID', $id);
  return $id;
}

function gdrive_ensure_archive_day_folder(string $stamp): array {
  static $cache = [];
  $root = gdrive_ensure_archive_root();
  $year = substr($stamp, 0, 4);
  $month = substr($stamp, 4, 2);
  $day = substr($stamp, 6, 2);
  if (!preg_match('/^\d{4}$/', $year) || !preg_match('/^\d{2}$/', $month) || !preg_match('/^\d{2}$/', $day)) {
    throw new RuntimeException('invalid_capture_stamp');
  }
  $key = $year.'/'.$month.'/'.$day;
  if (isset($cache[$key])) return $cache[$key];
  $yearId = gdrive_find_or_create_folder($year, $root);
  $monthId = gdrive_find_or_create_folder($month, $yearId);
  $dayId = gdrive_find_or_create_folder($day, $monthId);
  $cache[$key] = ['id' => $dayId, 'path' => gdrive_root_folder_name().'/'.$key];
  return $cache[$key];
}

function gdrive_upload_file(string $path, string $driveName, string $parentId): array {
  if (!is_file($path) || !is_readable($path)) throw new RuntimeException('upload_file_unreadable');
  $size = (int)filesize($path);
  $metadata = [
    'name' => $driveName,
    'parents' => [$parentId],
  ];
  $token = gdrive_access_token();
  $url = NISTER_GOOGLE_DRIVE_UPLOAD_API . '/files?' . http_build_query([
    'uploadType' => 'resumable',
    'fields' => 'id,name,size,md5Checksum',
  ], '', '&', PHP_QUERY_RFC3986);
  $init = gdrive_http_request('POST', $url, [
    'Authorization: Bearer ' . $token,
    'Accept: application/json',
    'Content-Type: application/json; charset=UTF-8',
    'X-Upload-Content-Type: application/octet-stream',
    'X-Upload-Content-Length: ' . $size,
  ], json_encode($metadata, JSON_UNESCAPED_SLASHES), 45);
  if ($init['code'] === 401) {
    $token = gdrive_refresh_access_token();
    $init = gdrive_http_request('POST', $url, [
      'Authorization: Bearer ' . $token,
      'Accept: application/json',
      'Content-Type: application/json; charset=UTF-8',
      'X-Upload-Content-Type: application/octet-stream',
      'X-Upload-Content-Length: ' . $size,
    ], json_encode($metadata, JSON_UNESCAPED_SLASHES), 45);
  }
  $sessionUrl = (string)($init['headers']['location'] ?? '');
  if (($init['code'] < 200 || $init['code'] >= 300) || $sessionUrl === '') {
    throw new RuntimeException('google_drive_upload_session_failed');
  }

  $uploaded = gdrive_http_upload($sessionUrl, $path, $token, $size);
  if ($uploaded['code'] < 200 || $uploaded['code'] >= 300 || !is_array($uploaded['json'])) {
    throw new RuntimeException('google_drive_upload_failed');
  }
  return $uploaded['json'];
}

function gdrive_file_metadata(string $fileId): array {
  $url = NISTER_GOOGLE_DRIVE_API . '/files/' . rawurlencode($fileId) . '?' . http_build_query([
    'fields' => 'id,name,size,md5Checksum,trashed',
  ], '', '&', PHP_QUERY_RFC3986);
  return gdrive_api_request('GET', $url, null, 45);
}

function gdrive_verify_uploaded_file(string $fileId, int $localSize, string $localMd5): array {
  $meta = gdrive_file_metadata($fileId);
  $remoteSize = (int)($meta['size'] ?? -1);
  $remoteMd5 = strtolower((string)($meta['md5Checksum'] ?? ''));
  $ok = $remoteSize === $localSize && ($localMd5 === '' || $remoteMd5 === '' || hash_equals(strtolower($localMd5), $remoteMd5));
  return ['ok' => $ok, 'metadata' => $meta];
}

function gdrive_delete_file(string $fileId): void {
  $url = NISTER_GOOGLE_DRIVE_API . '/files/' . rawurlencode($fileId);
  gdrive_api_request('DELETE', $url, null, 45);
}

function gdrive_revoke(): void {
  $token = settings_get('GOOGLE_DRIVE_REFRESH_TOKEN', '') ?? '';
  if ($token !== '') {
    try {
      gdrive_http_request('POST', NISTER_GOOGLE_OAUTH_REVOKE_URL, [
        'Content-Type: application/x-www-form-urlencoded',
      ], http_build_query(['token' => $token], '', '&', PHP_QUERY_RFC3986), 30);
    } catch (Throwable $e) {
      // Disconnect should still remove local credentials if Google revoke is unreachable.
    }
  }
  foreach ([
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRES_AT',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_TOKEN_TYPE',
    'GOOGLE_DRIVE_GRANTED_SCOPE',
    'GOOGLE_DRIVE_CONNECTED_AT',
  ] as $key) {
    settings_set($key, '');
  }
}

function gdrive_archive_bootstrap(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS netflow_drive_archive (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NULL,
    capture_stamp CHAR(12) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    md5 CHAR(32) NOT NULL DEFAULT '',
    drive_file_id VARCHAR(128) NULL,
    drive_path TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'uploaded',
    error TEXT NULL,
    uploaded_at DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_file_identity (file_name, size_bytes, md5),
    KEY idx_capture_stamp (capture_stamp),
    KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
