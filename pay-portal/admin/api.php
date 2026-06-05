<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/wallet.php'; // still used elsewhere
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/plans_radius.php';
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/settings.php';
require_once __DIR__.'/../lib/alerts.php';
require_once __DIR__.'/../lib/health.php';
require_once __DIR__.'/../lib/forensics.php';
require_once __DIR__.'/../lib/google_drive_archive.php';
require_once __DIR__.'/../lib/location.php';
require_once __DIR__.'/../lib/admin_auth.php';
require_once __DIR__.'/../lib/sms.php';
require_once __DIR__.'/../lib/referrals.php';

$ENV = admin_boot();
header('Content-Type: application/json; charset=utf-8');

if (!admin_logged_in()) {
  http_response_code(401);
  echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit;
}
admin_require_csrf_post();

try {
  location_bootstrap();
} catch (Throwable $e) {
  // non-fatal; location-scoped endpoints can still report explicit errors later
}

$fn = $_GET['fn'] ?? '';
$in = array_merge($_POST, body_json());

function table_exists(PDO $pdo, string $table): bool {
  $qt = $pdo->quote($table);
  $st = $pdo->query("SHOW TABLES LIKE {$qt}");
  return (bool)$st->fetchColumn();
}

function column_exists(PDO $pdo, string $table, string $col): bool {
  $qc = $pdo->quote($col);
  $st = $pdo->query("SHOW COLUMNS FROM {$table} LIKE {$qc}");
  return (bool)$st->fetchColumn();
}

function admin_attach_location_profiles(array &$rows): void {
  global $PDO;
  if (!$rows) return;
  if (!table_exists($PDO, 'user_location_profiles')) return;
  if (!table_exists($PDO, 'locations')) return;

  $canon = [];
  foreach ($rows as $r) {
    $u = normalize_msisdn((string)($r['username'] ?? ''));
    if ($u !== '') $canon[$u] = true;
  }
  if (!$canon) return;

  $vals = array_keys($canon);
  $ph = implode(',', array_fill(0, count($vals), '?'));
  $sql = "SELECT p.msisdn, p.location_id, l.code AS location_code, l.name AS location_name
          FROM user_location_profiles p
          LEFT JOIN locations l ON l.id = p.location_id
          WHERE p.msisdn IN ({$ph})";
  $st = $PDO->prepare($sql);
  $st->execute($vals);
  $map = [];
  foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
    $m = normalize_msisdn((string)($row['msisdn'] ?? ''));
    if ($m === '') continue;
    $map[$m] = [
      'location_id' => (int)($row['location_id'] ?? 0),
      'location_code' => (string)($row['location_code'] ?? ''),
      'location_name' => (string)($row['location_name'] ?? ''),
    ];
  }

  foreach ($rows as &$r) {
    $m = normalize_msisdn((string)($r['username'] ?? ''));
    if ($m === '' || !isset($map[$m])) continue;
    $r['location_id'] = $map[$m]['location_id'];
    $r['location_code'] = $map[$m]['location_code'];
    $r['location_name'] = $map[$m]['location_name'];
  }
  unset($r);
}

function admin_attach_alert_sites(array &$rows): void {
  global $PDO;
  if (!$rows) return;

  admin_attach_location_profiles($rows);

  $defaultId = location_default_id();
  $defaultLoc = location_find_by_id($defaultId);
  $defaultCode = (string)($defaultLoc['code'] ?? location_default_code());
  $defaultName = (string)($defaultLoc['name'] ?? 'Default Site');
  $fallbackUsers = [];
  foreach ($rows as $row) {
    $locId = (int)($row['location_id'] ?? 0);
    if ($locId > 0) continue;
    $m = normalize_msisdn((string)($row['username'] ?? ''));
    if ($m === '') continue;
    $fallbackUsers[$m] = true;
  }
  if ($fallbackUsers) {
    $defaults = location_filter_msisdns(array_keys($fallbackUsers), $defaultId);
    $defaultSet = array_fill_keys(array_map(static fn($v): string => (string)$v, $defaults), true);
    foreach ($rows as &$row) {
      $locId = (int)($row['location_id'] ?? 0);
      if ($locId > 0) continue;
      $m = normalize_msisdn((string)($row['username'] ?? ''));
      if ($m === '' || !isset($defaultSet[$m])) continue;
      $row['location_id'] = $defaultId;
      $row['location_code'] = $defaultCode;
      $row['location_name'] = $defaultName;
    }
    unset($row);
  }

  if (!table_exists($PDO, 'location_nas') || !table_exists($PDO, 'locations')) return;
  $ipSet = [];
  foreach ($rows as $row) {
    $locId = (int)($row['location_id'] ?? 0);
    if ($locId > 0) continue;
    $ip = trim((string)($row['remote_addr'] ?? ''));
    if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) continue;
    $ipSet[$ip] = true;
  }
  if (!$ipSet) return;

  $ips = array_keys($ipSet);
  $ph = implode(',', array_fill(0, count($ips), '?'));
  $sql = "SELECT n.location_id,
                 l.code AS location_code,
                 l.name AS location_name,
                 COALESCE(n.nas_ip,'') AS nas_ip,
                 COALESCE(n.exporter_ip,'') AS exporter_ip
          FROM location_nas n
          JOIN locations l ON l.id=n.location_id
          WHERE n.active=1
            AND (
              (n.nas_ip IS NOT NULL AND n.nas_ip<>'' AND n.nas_ip IN ({$ph}))
              OR
              (n.exporter_ip IS NOT NULL AND n.exporter_ip<>'' AND n.exporter_ip IN ({$ph}))
            )
          ORDER BY n.id ASC";
  $st = $PDO->prepare($sql);
  $st->execute(array_merge($ips, $ips));
  $ipMap = [];
  foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $m) {
    $payload = [
      'location_id' => (int)($m['location_id'] ?? 0),
      'location_code' => (string)($m['location_code'] ?? ''),
      'location_name' => (string)($m['location_name'] ?? ''),
    ];
    $nasIp = trim((string)($m['nas_ip'] ?? ''));
    $expIp = trim((string)($m['exporter_ip'] ?? ''));
    if ($nasIp !== '' && !isset($ipMap[$nasIp])) $ipMap[$nasIp] = $payload;
    if ($expIp !== '' && !isset($ipMap[$expIp])) $ipMap[$expIp] = $payload;
  }

  foreach ($rows as &$row) {
    $locId = (int)($row['location_id'] ?? 0);
    if ($locId > 0) continue;
    $ip = trim((string)($row['remote_addr'] ?? ''));
    if ($ip === '' || !isset($ipMap[$ip])) continue;
    $row['location_id'] = (int)($ipMap[$ip]['location_id'] ?? 0);
    $row['location_code'] = (string)($ipMap[$ip]['location_code'] ?? '');
    $row['location_name'] = (string)($ipMap[$ip]['location_name'] ?? '');
  }
  unset($row);
}

function radacct_open_where_clause(): string {
  // Some deployments store "open" sessions with NULL, others with zero-datetime.
  return "(acctstoptime IS NULL OR acctstoptime='0000-00-00 00:00:00')";
}

function parse_amount_cents(array $in): int {
  if (isset($in['amount_cents']) && is_numeric($in['amount_cents'])) {
    return max(0, (int)$in['amount_cents']);
  }
  if (isset($in['amount']) && $in['amount'] !== '') {
    $a = (float)preg_replace('/[^\d.]/', '', (string)$in['amount']);
    return ($a > 0) ? (int)round($a * 100) : 0;
  }
  return 0;
}

function parse_bool($v): bool {
  if (is_bool($v)) return $v;
  $s = strtolower(trim((string)$v));
  if ($s === '') return false;
  return !in_array($s, ['0','false','no','off'], true);
}

function admin_location_scope(array $in, bool $allowAll = true): array {
  $scope = location_scope_from_input($in, $allowAll);
  if (!($scope['ok'] ?? false)) return $scope;
  $scope['location_id'] = isset($scope['location_id']) && $scope['location_id'] !== null
    ? (int)$scope['location_id']
    : null;
  return $scope;
}

function admin_user_scope_check(array $in, string $msisdn): array {
  $scope = admin_location_scope($in, true);
  if (!($scope['ok'] ?? false)) {
    return [
      'ok' => false,
      'error' => (string)($scope['error'] ?? 'invalid_location_scope'),
      'http_code' => 400,
    ];
  }

  $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
  if ($locationId === null || $locationId <= 0) {
    return ['ok'=>true, 'location_id'=>null, 'scope'=>$scope];
  }

  $profile = null;
  try {
    $profile = location_profile_get($msisdn);
  } catch (Throwable $e) {
    $profile = null;
  }
  $userLocId = (int)($profile['location_id'] ?? 0);
  if (!$profile || $userLocId <= 0) {
    return [
      'ok' => false,
      'error' => 'user_location_unknown',
      'http_code' => 409,
      'location_id' => $locationId,
      'detail' => 'User has no bound location profile yet.',
    ];
  }

  if ($userLocId !== $locationId) {
    return [
      'ok' => false,
      'error' => 'user_out_of_scope',
      'http_code' => 403,
      'location_id' => $locationId,
      'user_location_id' => $userLocId,
      'user_location_code' => (string)($profile['code'] ?? $profile['last_location_code'] ?? ''),
      'detail' => 'Selected site does not match user location.',
    ];
  }

  return ['ok'=>true, 'location_id'=>$locationId, 'scope'=>$scope, 'profile'=>$profile];
}

function admin_emit_scope_error(array $check): void {
  http_response_code((int)($check['http_code'] ?? 400));
  $out = ['ok'=>false, 'error'=>(string)($check['error'] ?? 'invalid_location_scope')];
  if (isset($check['detail']) && $check['detail'] !== '') $out['detail'] = (string)$check['detail'];
  if (array_key_exists('location_id', $check)) $out['location_id'] = $check['location_id'];
  if (array_key_exists('user_location_id', $check)) $out['user_location_id'] = $check['user_location_id'];
  if (array_key_exists('user_location_code', $check)) $out['user_location_code'] = $check['user_location_code'];
  echo json_encode($out);
}

function settings_allowed_keys(): array {
  return [
    'HOTSPOT_API_BASE',
    'PAY_BASE',
    'WHATSAPP_SUPPORT',
    'TOPUP_NETWORK',
    'TOPUP_NAME',
    'TOPUP_NUMBER',
    'TOPUP_WA_TEXT',
    'TOPUP_MIN_CENTS',
    'TOPUP_MANUAL_ENABLED',
    'PAYSTACK_ENABLED',
    'PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_CURRENCY',
    'PAYSTACK_CALLBACK_URL',
    'MNOTIFY_BASE',
    'MNOTIFY_API_KEY',
    'MNOTIFY_SENDER',
    'SMS_LOGIN_URL',
    'SMS_WELCOME_TEXT',
    'SMS_QUOTA_WARN_TEXT',
    'SMS_EXPIRY_WARN_TEXT',
    'SMS_QUOTA_WARN_PCT',
    'SMS_QUOTA_WARN_MB',
    'SMS_EXPIRY_WARN_HOURS',
    'SMS_DEBOUNCE_HOURS',
    'SMS_PURCHASE_CONFIRM_TEXT',
    'SMS_TOPUP_CONFIRM_TEXT',
    'SMS_PAYMENT_PENDING_TEXT',
    'SMS_PAYMENT_FAILED_TEXT',
    'SMS_RENEW_REMINDER_TEXT',
    'SMS_RENEW_REMINDER_HOURS',
    'SMS_SIGNUP_OTP_TEXT',
    'SMS_PASSWORD_RESET_TEXT',
    'SMS_BACK_ONLINE_TEXT',
    'SMS_INACTIVE_TEXT',
    'SMS_INACTIVE_DAYS',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REDIRECT_URI',
    'GOOGLE_DRIVE_ROOT_FOLDER_NAME',
    'GOOGLE_DRIVE_PARENT_FOLDER_ID',
    'NETFLOW_DRIVE_ARCHIVE_ENABLED',
    'NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD',
    'NETFLOW_ARCHIVE_MIN_AGE_MINUTES',
    'NETFLOW_ARCHIVE_MAX_FILES_PER_RUN',
    'REFERRAL_RATE_BPS',
    'REFERRAL_MONTHLY_CAP_CENTS',
    'REFERRAL_LIFETIME_CAP_CENTS',
    'REFERRAL_WINDOW_DAYS',
    'REFERRAL_PENDING_HOLD_DAYS',
    'OTP_CODE_LENGTH',
    'OTP_TTL_SECONDS',
    'OTP_MAX_ATTEMPTS',
    'OTP_RESEND_COOLDOWN_SECONDS',
    'OTP_SESSION_TTL_SECONDS',
    'OTP_MAX_SENDS_PER_MSISDN_HOUR',
    'OTP_MAX_SENDS_PER_IP_HOUR',
  ];
}

function normalize_setting_value(string $k, ?string $v): string {
  $v = trim((string)$v);
  if ($k === 'HOTSPOT_API_BASE' || $k === 'PAY_BASE' || $k === 'PAYSTACK_CALLBACK_URL' || $k === 'GOOGLE_DRIVE_REDIRECT_URI') {
    $v = rtrim($v, '/');
  }
  if (in_array($k, ['TOPUP_MANUAL_ENABLED','PAYSTACK_ENABLED','NETFLOW_DRIVE_ARCHIVE_ENABLED','NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD'], true)) {
    $s = strtolower($v);
    return in_array($s, ['1','true','yes','y','on','enabled'], true) ? '1' : '0';
  }
  if ($k === 'PAYSTACK_CURRENCY') {
    $v = strtoupper(preg_replace('/[^A-Za-z]/', '', $v));
    return $v !== '' ? substr($v, 0, 3) : 'GHS';
  }
  if ($k === 'MNOTIFY_BASE') {
    $v = rtrim($v, '/');
  }
  if ($k === 'WHATSAPP_SUPPORT') {
    $v = preg_replace('/\D+/', '', $v);
  }
  if ($k === 'MNOTIFY_SENDER') {
    if (strlen($v) > 11) $v = substr($v, 0, 11);
  }
  if (in_array($k, [
    'SMS_QUOTA_WARN_PCT','SMS_QUOTA_WARN_MB','SMS_EXPIRY_WARN_HOURS','SMS_DEBOUNCE_HOURS','SMS_RENEW_REMINDER_HOURS','SMS_INACTIVE_DAYS',
    'TOPUP_MIN_CENTS',
    'REFERRAL_RATE_BPS','REFERRAL_MONTHLY_CAP_CENTS','REFERRAL_LIFETIME_CAP_CENTS','REFERRAL_WINDOW_DAYS','REFERRAL_PENDING_HOLD_DAYS',
    'OTP_CODE_LENGTH','OTP_TTL_SECONDS','OTP_MAX_ATTEMPTS','OTP_RESEND_COOLDOWN_SECONDS','OTP_SESSION_TTL_SECONDS',
    'OTP_MAX_SENDS_PER_MSISDN_HOUR','OTP_MAX_SENDS_PER_IP_HOUR',
    'NETFLOW_ARCHIVE_MIN_AGE_MINUTES','NETFLOW_ARCHIVE_MAX_FILES_PER_RUN',
  ], true)) {
    $v = preg_replace('/[^\d.]/', '', $v);
  }
  return $v;
}

function admin_env_value(array $keys, string $default=''): string {
  global $ENV;
  foreach ($keys as $key) {
    if (isset($ENV[$key]) && trim((string)$ENV[$key]) !== '') return trim((string)$ENV[$key]);
    if (isset($_ENV[$key]) && trim((string)$_ENV[$key]) !== '') return trim((string)$_ENV[$key]);
    $v = getenv($key);
    if ($v !== false && trim((string)$v) !== '') return trim((string)$v);
  }
  return $default;
}

function admin_drive_state_cookie(string $value, int $ttlSeconds=900): void {
  setcookie('nister_drive_oauth_state', $value, [
    'expires' => time() + max(60, $ttlSeconds),
    'path' => '/admin',
    'domain' => '',
    'secure' => admin_request_is_secure(),
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}

function bytes_from_input(array $in): ?int {
  if (isset($in['bytes']) && is_numeric($in['bytes'])) {
    $b = (int)$in['bytes'];
    return $b > 0 ? $b : null;
  }
  if (isset($in['gb']) && $in['gb'] !== '') {
    $g = (float)preg_replace('/[^\d.]/', '', (string)$in['gb']);
    return ($g > 0) ? (int)round($g * 1024 * 1024 * 1024) : null;
  }
  if (isset($in['mb']) && $in['mb'] !== '') {
    $m = (float)preg_replace('/[^\d.]/', '', (string)$in['mb']);
    return ($m > 0) ? (int)round($m * 1024 * 1024) : null;
  }
  return null;
}

function plan_reserved(string $code): bool {
  $lc = strtolower($code);
  if (str_starts_with($lc, 'hs_')) return true;
  return false;
}

function sms_recipient_normalize(string $raw): string {
  $canon = normalize_msisdn($raw);
  if ($canon === '') return '';
  $local = msisdn_local($canon);
  if (!preg_match('/^0\d{9}$/', $local)) return '';
  return $local;
}

function sms_recipient_e164(string $raw): string {
  $canon = normalize_msisdn($raw);
  if (!preg_match('/^233\d{9}$/', $canon)) return '';
  return $canon;
}

function admin_sms_provider_from_base(string $base): string {
  return (stripos($base, 'pilosms') !== false) ? 'pilosms' : 'mnotify';
}

function sms_parse_recipient_list($raw): array {
  if (is_array($raw)) $raw = implode(' ', $raw);
  $raw = (string)$raw;
  $parts = preg_split('/[\s,;]+/', $raw, -1, PREG_SPLIT_NO_EMPTY);
  $out = [];
  foreach ($parts as $p) {
    $v = sms_recipient_normalize($p);
    if ($v !== '') $out[$v] = true;
  }
  return array_keys($out);
}

function sms_fetch_all_users(PDO $r): array {
  $out = [];
  $st = $r->prepare("SELECT DISTINCT username FROM radcheck WHERE attribute='Cleartext-Password'");
  $st->execute();
  foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $u) {
    $v = sms_recipient_normalize((string)$u);
    if ($v !== '') $out[$v] = true;
  }
  return array_keys($out);
}

function sms_fetch_group_users(PDO $r, string $group): array {
  $out = [];
  $st = $r->prepare("SELECT DISTINCT username FROM radusergroup WHERE groupname=:g");
  $st->execute([':g'=>$group]);
  foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) as $u) {
    $v = sms_recipient_normalize((string)$u);
    if ($v !== '') $out[$v] = true;
  }
  return array_keys($out);
}

function parse_quota_bytes(array $in): ?int {
  if (isset($in['quota_bytes']) && $in['quota_bytes'] !== '') {
    $q = (int)$in['quota_bytes'];
    return ($q > 0) ? $q : null;
  }
  $gb = $in['data_gb'] ?? $in['quota_gb'] ?? null;
  if ($gb !== null && $gb !== '') {
    $g = (float)preg_replace('/[^\d.]/', '', (string)$gb);
    if ($g > 0) return (int)round($g * 1024 * 1024 * 1024);
    return null;
  }
  $mb = $in['data_mb'] ?? $in['quota_mb'] ?? null;
  if ($mb !== null && $mb !== '') {
    $m = (float)preg_replace('/[^\d.]/', '', (string)$mb);
    if ($m > 0) return (int)round($m * 1024 * 1024);
    return null;
  }
  return null;
}

function promo_parse_expiry(array $in, DateTimeZone $tz): ?DateTimeImmutable {
  $raw = trim((string)from_any([$in], 'expires_at', ''));
  $daysRaw = trim((string)from_any([$in], 'days', from_any([$in], 'expires_days', '')));
  if ($raw !== '') {
    $dt = nister_parse_expiry_datetime($raw, $tz);
    if ($dt instanceof DateTimeImmutable) return $dt;
    return null;
  }
  if ($daysRaw !== '' && is_numeric($daysRaw)) {
    $days = (int)$daysRaw;
    if ($days > 0) return (new DateTimeImmutable('now', $tz))->modify('+'.$days.' days');
  }
  return null;
}

function promo_user_list_dedupe(array $rows): array {
  $out = [];
  foreach ($rows as $u) {
    $m = normalize_msisdn((string)$u);
    if (!preg_match('/^233\d{9}$/', $m)) continue;
    $out[$m] = true;
  }
  return array_keys($out);
}

function promo_fetch_recent_users(PDO $pdo, PDO $r, int $days, ?int $locationId = null): array {
  $users = [];
  $days = max(1, $days);

  if (table_exists($pdo, 'signup_otp_sessions') && column_exists($pdo, 'signup_otp_sessions', 'created_at')) {
    $hasLoc = column_exists($pdo, 'signup_otp_sessions', 'location_id');
    if ($hasLoc && $locationId !== null && $locationId > 0) {
      $st = $pdo->prepare("SELECT DISTINCT msisdn
                           FROM signup_otp_sessions
                           WHERE created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)
                             AND location_id=:l");
      $st->bindValue(':d', $days, PDO::PARAM_INT);
      $st->bindValue(':l', $locationId, PDO::PARAM_INT);
      $st->execute();
    } else {
      $st = $pdo->prepare("SELECT DISTINCT msisdn
                           FROM signup_otp_sessions
                           WHERE created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)");
      $st->bindValue(':d', $days, PDO::PARAM_INT);
      $st->execute();
    }
    $users = array_merge($users, $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
  }

  if (table_exists($pdo, 'accounts') && column_exists($pdo, 'accounts', 'created_at')) {
    $st = $pdo->prepare("SELECT DISTINCT msisdn
                         FROM accounts
                         WHERE created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)");
    $st->bindValue(':d', $days, PDO::PARAM_INT);
    $st->execute();
    $users = array_merge($users, $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
  }

  if (table_exists($pdo, 'purchases') && column_exists($pdo, 'purchases', 'created_at')) {
    $hasLoc = column_exists($pdo, 'purchases', 'location_id');
    if ($hasLoc && $locationId !== null && $locationId > 0) {
      $st = $pdo->prepare("SELECT DISTINCT msisdn
                           FROM purchases
                           WHERE created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)
                             AND location_id=:l");
      $st->bindValue(':d', $days, PDO::PARAM_INT);
      $st->bindValue(':l', $locationId, PDO::PARAM_INT);
      $st->execute();
    } else {
      $st = $pdo->prepare("SELECT DISTINCT msisdn
                           FROM purchases
                           WHERE created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)");
      $st->bindValue(':d', $days, PDO::PARAM_INT);
      $st->execute();
    }
    $users = array_merge($users, $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
  }

  if (!$users && table_exists($r, 'radcheck') && column_exists($r, 'radcheck', 'created_at')) {
    $st = $r->prepare("SELECT DISTINCT username
                       FROM radcheck
                       WHERE attribute='Cleartext-Password'
                         AND created_at >= DATE_SUB(NOW(), INTERVAL :d DAY)");
    $st->bindValue(':d', $days, PDO::PARAM_INT);
    $st->execute();
    $users = array_merge($users, $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
  }

  return location_filter_msisdns(promo_user_list_dedupe($users), $locationId);
}

function promo_collect_targets(PDO $pdo, PDO $r, array $in, ?int $locationId = null): array {
  $scope = strtolower(trim((string)from_any([$in], 'scope', 'all')));
  if ($scope === '') $scope = 'all';

  if ($scope === 'all') {
    return location_filter_msisdns(promo_user_list_dedupe(sms_fetch_all_users($r)), $locationId);
  }

  if ($scope === 'group') {
    $group = trim((string)from_any([$in], 'group', ''));
    if ($group === '') return [];
    return location_filter_msisdns(promo_user_list_dedupe(sms_fetch_group_users($r, $group)), $locationId);
  }

  if ($scope === 'recent') {
    $days = (int)from_any([$in], 'recent_days', from_any([$in], 'days', 0));
    if ($days <= 0) return [];
    return promo_fetch_recent_users($pdo, $r, $days, $locationId);
  }

  return [];
}

function promo_bootstrap_data_table(PDO $r): void {
  $r->exec("CREATE TABLE IF NOT EXISTS nister_data_promos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    location_id INT NULL,
    grant_bytes BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    promo_ref VARCHAR(64) NOT NULL,
    notes VARCHAR(255) NULL,
    created_by VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_data_promo_location (location_id),
    KEY idx_user_exp (username, expires_at),
    KEY idx_ref (promo_ref)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  $st = $r->query("SHOW COLUMNS FROM nister_data_promos LIKE 'location_id'");
  if (!$st->fetchColumn()) {
    $r->exec("ALTER TABLE nister_data_promos ADD COLUMN location_id INT NULL AFTER username, ADD KEY idx_data_promo_location (location_id)");
  }
}

function promo_bootstrap_wallet_table(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS wallet_promo_grants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    msisdn VARCHAR(32) NOT NULL,
    location_id INT NULL,
    ref VARCHAR(64) NOT NULL,
    total_cents INT NOT NULL,
    remaining_cents INT NOT NULL,
    expires_at DATETIME NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at DATETIME NULL,
    expired_at DATETIME NULL,
    UNIQUE KEY uq_wallet_promo_ref_msisdn (ref, msisdn),
    KEY idx_wallet_promo_location (location_id),
    KEY idx_wallet_promo_user_state (msisdn, status, expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  location_add_column_if_missing(
    $pdo,
    'wallet_promo_grants',
    'location_id',
    "`location_id` INT NULL AFTER `msisdn`, ADD KEY `idx_wallet_promo_location` (`location_id`)"
  );
}

function admin_user_canon(string $username): string {
  $d = preg_replace('/\D+/', '', $username);
  if ($d === '') return trim($username);
  if (preg_match('/^0\d{9}$/', $d)) return '233'.substr($d, 1);
  if (preg_match('/^233\d{9}$/', $d)) return $d;
  return $d;
}

function admin_group_rank(string $group): int {
  $g = strtoupper(trim($group));
  if ($g === 'HS_ACTIVE') return 3;
  if ($g === 'HS_LIMITED') return 2;
  if ($g === 'HS_NOPAID') return 1;
  return 0;
}

function admin_dedupe_user_state_rows(array $rows): array {
  $out = [];
  foreach ($rows as $row) {
    if (!is_array($row)) continue;
    $u = (string)($row['username'] ?? '');
    $key = admin_user_canon($u);
    if ($key === '') $key = $u;
    if ($key === '') continue;
    if (!isset($out[$key])) {
      $row['username'] = $key;
      $out[$key] = $row;
      continue;
    }

    $cur = $out[$key];
    $curRank = admin_group_rank((string)($cur['groupname'] ?? ''));
    $newRank = admin_group_rank((string)($row['groupname'] ?? ''));
    $replace = false;
    if ($newRank > $curRank) {
      $replace = true;
    } else {
      $curWin = strtotime((string)($cur['window_start'] ?? ''));
      $newWin = strtotime((string)($row['window_start'] ?? ''));
      if ($newWin !== false && ($curWin === false || $newWin > $curWin)) {
        $replace = true;
      }
    }

    if ($replace) {
      $row['username'] = $key;
      $out[$key] = $row;
      continue;
    }

    foreach (['expires','quota_bytes','used_bytes','window_start','rate_limit'] as $k) {
      if ((!isset($out[$key][$k]) || $out[$key][$k] === '' || $out[$key][$k] === null)
          && isset($row[$k]) && $row[$k] !== '' && $row[$k] !== null) {
        $out[$key][$k] = $row[$k];
      }
    }
    if (empty($out[$key]['expired_flag']) && !empty($row['expired_flag'])) $out[$key]['expired_flag'] = $row['expired_flag'];
    if (empty($out[$key]['exhausted_flag']) && !empty($row['exhausted_flag'])) $out[$key]['exhausted_flag'] = $row['exhausted_flag'];
  }

  $rows = array_values($out);
  usort($rows, static function(array $a, array $b): int {
    $ga = admin_group_rank((string)($a['groupname'] ?? ''));
    $gb = admin_group_rank((string)($b['groupname'] ?? ''));
    if ($ga !== $gb) return $gb <=> $ga;
    return strcmp((string)($a['username'] ?? ''), (string)($b['username'] ?? ''));
  });
  return $rows;
}

try {
  switch ($fn) {

    case 'whoami': {
      echo json_encode([
        'ok'    => true,
        'user'  => $_SESSION['admin_user'] ?? null,
        'since' => $_SESSION['admin_at']   ?? null,
        'ip'    => $_SERVER['REMOTE_ADDR'] ?? null,
      ]);
      break;
    }

    case 'locations_list': {
      $rows = location_list(true);
      echo json_encode(['ok'=>true, 'locations'=>$rows, 'default_id'=>location_default_id()]);
      break;
    }

    case 'location_save': {
      try {
        $active = array_key_exists('active', $in) ? (parse_bool($in['active']) ? 1 : 0) : 1;
        $row = location_save([
          'id' => (int)from_any([$in], 'id', 0),
          'code' => (string)from_any([$in], 'code', ''),
          'name' => (string)from_any([$in], 'name', ''),
          'timezone' => (string)from_any([$in], 'timezone', 'Africa/Accra'),
          'active' => $active,
        ]);
        echo json_encode(['ok'=>true, 'location'=>$row]);
      } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_save_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_nas_list': {
      try {
        $scope = admin_location_scope($in, true);
        if (!($scope['ok'] ?? false)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
          break;
        }
        $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
        $rows = location_nas_list($locationId);
        echo json_encode(['ok'=>true, 'items'=>$rows, 'location_id'=>$locationId]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'location_nas_list_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_nas_save': {
      try {
        $active = array_key_exists('active', $in) ? (parse_bool($in['active']) ? 1 : 0) : 1;
        $row = location_nas_save([
          'id' => (int)from_any([$in], 'id', 0),
          'location_id' => (int)from_any([$in], 'location_id', 0),
          'nas_ip' => (string)from_any([$in], 'nas_ip', ''),
          'exporter_ip' => (string)from_any([$in], 'exporter_ip', ''),
          'exporter_id' => (string)from_any([$in], 'exporter_id', ''),
          'label' => (string)from_any([$in], 'label', ''),
          'active' => $active,
        ]);
        echo json_encode(['ok'=>true, 'item'=>$row]);
      } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_nas_save_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_nas_delete': {
      try {
        $id = (int)from_any([$in], 'id', 0);
        if ($id <= 0) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'mapping_id_required']);
          break;
        }
        location_nas_delete($id);
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_nas_delete_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_discovery_list': {
      try {
        $scope = admin_location_scope($in, true);
        if (!($scope['ok'] ?? false)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
          break;
        }
        $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
        $onlyUnassigned = !array_key_exists('only_unassigned', $in) ? true : parse_bool($in['only_unassigned']);
        $limit = isset($in['limit']) ? max(1, min(1000, (int)$in['limit'])) : 200;
        $items = location_router_discovery_list($locationId, $onlyUnassigned, $limit);
        echo json_encode([
          'ok' => true,
          'items' => $items,
          'location_id' => $locationId,
          'only_unassigned' => $onlyUnassigned,
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'location_discovery_list_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_discovery_assign': {
      try {
        $id = (int)from_any([$in], 'id', 0);
        $locationId = (int)from_any([$in], 'location_id', 0);
        if ($id <= 0) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'discovery_id_required']);
          break;
        }
        if ($locationId <= 0) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'location_required']);
          break;
        }
        $who = (string)($_SESSION['admin_user'] ?? 'admin');
        $res = location_discovery_assign($id, $locationId, $who);
        echo json_encode(['ok'=>true] + (is_array($res) ? $res : []));
      } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_discovery_assign_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'location_discovery_ignore': {
      try {
        $id = (int)from_any([$in], 'id', 0);
        if ($id <= 0) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'discovery_id_required']);
          break;
        }
        $note = trim((string)from_any([$in], 'note', ''));
        $who = (string)($_SESSION['admin_user'] ?? 'admin');
        location_discovery_ignore($id, $note !== '' ? $note : null, $who);
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_discovery_ignore_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'settings_get': {
      $keys = settings_allowed_keys();
      $out = [];
      foreach ($keys as $k) {
        if ($k === 'PAYSTACK_SECRET_KEY' || $k === 'GOOGLE_DRIVE_CLIENT_SECRET') {
          $out[$k] = '';
          continue;
        }
        $value = settings_get($k, null);
        if (($value === null || $value === '') && $k === 'PAYSTACK_PUBLIC_KEY') {
          $value = admin_env_value(['PAYSTACK_PUBLIC_KEY','PAYSTACK_PUBLIC']);
        }
        if (($value === null || $value === '') && $k === 'PAYSTACK_CURRENCY') {
          $value = admin_env_value(['PAYSTACK_CURRENCY','CURRENCY'], 'GHS');
        }
        if (($value === null || $value === '') && $k === 'GOOGLE_DRIVE_CLIENT_ID') {
          $value = admin_env_value(['GOOGLE_DRIVE_CLIENT_ID']);
        }
        if (($value === null || $value === '') && $k === 'GOOGLE_DRIVE_REDIRECT_URI') {
          $value = gdrive_redirect_uri();
        }
        if (($value === null || $value === '') && $k === 'GOOGLE_DRIVE_ROOT_FOLDER_NAME') {
          $value = gdrive_root_folder_name();
        }
        if (($value === null || $value === '') && $k === 'NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD') {
          $value = '0';
        }
        if (($value === null || $value === '') && $k === 'NETFLOW_ARCHIVE_MIN_AGE_MINUTES') {
          $value = (string)gdrive_archive_min_age_minutes();
        }
        if (($value === null || $value === '') && $k === 'NETFLOW_ARCHIVE_MAX_FILES_PER_RUN') {
          $value = (string)gdrive_archive_max_files_per_run();
        }
        $out[$k] = $value ?? '';
      }
      $secret = settings_get('PAYSTACK_SECRET_KEY', '') ?? '';
      if ($secret === '') {
        $secret = admin_env_value(['PAYSTACK_SECRET_KEY','PAYSTACK_SECRET']);
      }
      $out['PAYSTACK_SECRET_KEY_SET'] = $secret !== '' ? '1' : '0';
      $driveSecret = settings_get('GOOGLE_DRIVE_CLIENT_SECRET', '') ?? '';
      if ($driveSecret === '') $driveSecret = admin_env_value(['GOOGLE_DRIVE_CLIENT_SECRET']);
      $out['GOOGLE_DRIVE_CLIENT_SECRET_SET'] = $driveSecret !== '' ? '1' : '0';
      $out['GOOGLE_DRIVE_REFRESH_TOKEN_SET'] = (settings_get('GOOGLE_DRIVE_REFRESH_TOKEN', '') ?? '') !== '' ? '1' : '0';
      echo json_encode(['ok'=>true,'settings'=>$out]);
      break;
    }

    case 'settings_save': {
      $keys = settings_allowed_keys();
      foreach ($keys as $k) {
        if (array_key_exists($k, $in)) {
          $val = normalize_setting_value($k, (string)$in[$k]);
          settings_set($k, $val);
        }
      }
      echo json_encode(['ok'=>true]);
      break;
    }

    case 'drive_status': {
      try {
        $status = gdrive_public_status();
        echo json_encode(['ok'=>true,'drive'=>$status]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'drive_status_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'drive_connect_start': {
      try {
        if (!gdrive_configured()) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'google_drive_client_missing','detail'=>'Save the Google OAuth client ID and secret first.']);
          break;
        }
        $state = gdrive_create_state();
        admin_drive_state_cookie($state, 900);
        echo json_encode(['ok'=>true,'auth_url'=>gdrive_oauth_url($state),'redirect_uri'=>gdrive_redirect_uri()]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'drive_connect_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'drive_disconnect': {
      try {
        gdrive_revoke();
        settings_set('GOOGLE_DRIVE_ROOT_FOLDER_ID', '');
        settings_set('NETFLOW_DRIVE_ARCHIVE_ENABLED', '0');
        echo json_encode(['ok'=>true,'drive'=>gdrive_public_status()]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'drive_disconnect_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'drive_test': {
      try {
        if (!gdrive_configured() || !gdrive_connected()) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'google_drive_not_connected']);
          break;
        }
        $root = gdrive_ensure_archive_root();
        $tmp = tempnam(sys_get_temp_dir(), 'nister-drive-test-');
        if ($tmp === false) throw new RuntimeException('temp_file_failed');
        $body = "NISTER Google Drive archive check\nUTC: ".gmdate('c')."\n";
        file_put_contents($tmp, $body);
        $name = 'nister-drive-check-'.gmdate('Ymd-His').'.txt';
        $drive = gdrive_upload_file($tmp, $name, $root);
        $id = trim((string)($drive['id'] ?? ''));
        $verify = $id !== '' ? gdrive_verify_uploaded_file($id, (int)filesize($tmp), strtolower((string)hash_file('md5', $tmp))) : ['ok'=>false];
        @unlink($tmp);
        if (!($verify['ok'] ?? false)) throw new RuntimeException('drive_test_verify_failed');
        if ($id !== '') {
          try { gdrive_delete_file($id); } catch (Throwable $e) { /* keep test result valid even if cleanup fails */ }
        }
        echo json_encode(['ok'=>true,'drive'=>gdrive_public_status()]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'drive_test_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'alerts_list': {
      alerts_bootstrap($PDO);
      $limit = isset($in['limit']) ? max(1, min(500, (int)$in['limit'])) : 200;
      $st = $PDO->prepare("SELECT id, ts, type, username, msg, remote_addr, acked, acked_at, acked_by, created_at
                           FROM admin_alerts
                           ORDER BY id DESC
                           LIMIT :lim");
      $st->bindValue(':lim', $limit, PDO::PARAM_INT);
      $st->execute();
      $rows = $st->fetchAll() ?: [];
      admin_attach_alert_sites($rows);
      echo json_encode(['ok'=>true,'alerts'=>$rows]);
      break;
    }

    case 'alerts_ack': {
      alerts_bootstrap($PDO);
      $id = (int)($in['id'] ?? 0);
      if ($id <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'id required']); break; }
      $who = $_SESSION['admin_user'] ?? 'admin';
      $st = $PDO->prepare("UPDATE admin_alerts SET acked=1, acked_at=NOW(), acked_by=:u WHERE id=:id");
      $st->execute([':u'=>$who, ':id'=>$id]);
      echo json_encode(['ok'=>true]);
      break;
    }

    case 'alerts_retry': {
      alerts_bootstrap($PDO);
      $id = (int)($in['id'] ?? 0);
      if ($id <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'id required']); break; }
      $row = $PDO->prepare("SELECT username, type, msg FROM admin_alerts WHERE id=:id");
      $row->execute([':id'=>$id]);
      $r = $row->fetch();
      if (!$r) { http_response_code(404); echo json_encode(['ok'=>false,'error'=>'not_found']); break; }
      $user = (string)($r['username'] ?? '');
      if ($user === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'username missing']); break; }
      try {
        radius_try_disconnect($user, is_array($ENV) ? $ENV : []);
      } catch (Throwable $e) {
        // fall through; still record retry attempt
      }
      $who = $_SESSION['admin_user'] ?? 'admin';
      $PDO->prepare("UPDATE admin_alerts SET acked=1, acked_at=NOW(), acked_by=:u WHERE id=:id")
          ->execute([':u'=>$who, ':id'=>$id]);
      alerts_insert($PDO, null, 'coa_retry', $user, 'COA retry requested by admin', $_SERVER['REMOTE_ADDR'] ?? null);
      echo json_encode(['ok'=>true]);
      break;
    }

    case 'health_status': {
      try {
      $pdo = health_pdo($ENV);
        $latest = health_latest($pdo);
        $events = health_events($pdo, 30);
        $coaStats = health_coa_success_stats($pdo, 120);
        $enforcement = health_enforcement_snapshot($pdo);
        $coaRate = $coaStats['rate'] ?? null;
        $uptime24 = health_uptime_ratio($pdo, 24);
        echo json_encode([
          'ok' => true,
          'latest' => $latest,
          'events' => $events,
          'coa_rate' => $coaRate,
          'coa_stats' => $coaStats,
          'enforcement' => $enforcement,
          'uptime24' => $uptime24,
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'health_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'flow_status': {
      try {
        $status = forensics_collector_status(is_array($ENV) ? $ENV : []);
        echo json_encode(['ok'=>true, 'flow'=>$status]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'flow_status_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'flow_daily_usage': {
      try {
        $scope = admin_location_scope($in, true);
        if (!($scope['ok'] ?? false)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
          break;
        }
        $locationId = isset($scope['location_id']) ? (int)($scope['location_id'] ?? 0) : 0;
        if ($locationId <= 0) $locationId = null;

        $lagRaw = $in['lag_minutes'] ?? ($_GET['lag_minutes'] ?? null);
        $lagOverride = null;
        if ($lagRaw !== null && trim((string)$lagRaw) !== '') {
          $lagOverride = (int)$lagRaw;
        }
        $lagMinutes = forensics_starlink_lag_minutes(is_array($ENV) ? $ENV : [], $lagOverride);
        [$from, $to, $dayEnd, $live, $err] = forensics_resolve_starlink_day_window(
          (string)($in['date'] ?? ($_GET['date'] ?? '')),
          $lagMinutes
        );
        if ($err !== null || !$from || !$to || !$dayEnd) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'bad_date','detail'=>$err]);
          break;
        }

        $usage = forensics_daily_wan_usage(is_array($ENV) ? $ENV : [], $from, $to, $locationId);
        $usage['date'] = $from->format('Y-m-d');
        $usage['day_end_utc'] = $dayEnd->format('Y-m-d H:i:s');
        $usage['is_live_day'] = $live;
        $usage['starlink_lag_minutes'] = $live ? $lagMinutes : 0;
        echo json_encode(['ok'=>true, 'usage'=>$usage]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'flow_daily_usage_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_state_list': {
      $r = rdb_pdo();
      if (function_exists('radius_normalize_legacy_nopaid')) {
        radius_normalize_legacy_nopaid($r);
      }
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $limit = isset($in['limit']) ? max(1, min(1000, (int)$in['limit'])) : 300;
      $expiredOnly = !empty($in['expired_only']);
      $exhaustedOnly = !empty($in['exhausted_only']);
      $groupFilter = '';
      if (!empty($in['group'])) {
        $g = strtoupper(trim((string)$in['group']));
        if (in_array($g, ['HS_ACTIVE','HS_LIMITED','HS_NOPAID'], true)) {
          $groupFilter = $g;
        }
      }
      $searchDigits = preg_replace('/\D+/', '', (string)($in['search'] ?? ''));
      $candidateLimit = ($expiredOnly || $exhaustedOnly || $groupFilter !== '' || $searchDigits !== '')
        ? min(5000, $limit * 8)
        : min(5000, $limit * 4);

      $where = "groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID')";
      $params = [];
      if ($searchDigits !== '') {
        $where .= " AND username LIKE :q";
        $params[':q'] = '%'.$searchDigits.'%';
      }
      $st = $r->prepare("SELECT DISTINCT username FROM radusergroup WHERE {$where} ORDER BY username LIMIT :lim");
      $st->bindValue(':lim', $candidateLimit, PDO::PARAM_INT);
      foreach ($params as $k => $v) $st->bindValue($k, $v);
      $st->execute();
      $rawUsers = $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: [];

      $canonUsers = [];
      foreach ($rawUsers as $uRaw) {
        $u = normalize_msisdn((string)$uRaw);
        if ($u === '') $u = admin_user_canon((string)$uRaw);
        if ($u === '') continue;
        $canonUsers[$u] = true;
      }
      $users = array_values(array_map(static fn($v): string => (string)$v, array_keys($canonUsers)));

      if (isset($scope['location_id']) && $scope['location_id'] !== null) {
        $locId = (int)$scope['location_id'];
        $users = location_filter_msisdns($users, $locId);
      }

      $rows = [];
      foreach ($users as $msisdn) {
        $msisdn = (string)$msisdn;
        if ($msisdn === '') continue;
        try {
          $exact = radius_user_state_exact((string)$msisdn, $r);
        } catch (Throwable $e) {
          $exact = null;
        }
        if (!is_array($exact)) continue;

        $row = [
          'username' => normalize_msisdn((string)($exact['username'] ?? $msisdn)) ?: $msisdn,
          'groupname' => (string)($exact['groupname'] ?? ''),
          'expires' => (string)($exact['expires'] ?? ''),
          'window_start' => (string)($exact['window_start'] ?? ''),
          'quota_bytes' => $exact['quota_bytes'] ?? null,
          'used_bytes' => (int)($exact['used_bytes'] ?? 0),
          'expired_flag' => !empty($exact['expired_flag']) ? 1 : 0,
          'exhausted_flag' => !empty($exact['exhausted_flag']) ? 1 : 0,
          'rate_limit' => trim((string)($exact['rate_limit'] ?? '')),
        ];

        if ($groupFilter !== '') {
          $rowGroup = strtoupper((string)$row['groupname']);
          if ($rowGroup !== $groupFilter) {
            continue;
          }
        }
        if ($expiredOnly && ((int)$row['expired_flag'] !== 1)) continue;
        if ($exhaustedOnly && ((int)$row['exhausted_flag'] !== 1)) continue;

        $rows[] = $row;
      }

      $rows = admin_dedupe_user_state_rows($rows);
      admin_attach_location_profiles($rows);
      if (count($rows) > $limit) $rows = array_slice($rows, 0, $limit);
      echo json_encode(['ok'=>true,'users'=>$rows]);
      break;
    }

    case 'stats': {
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;

      $wallet_liability_cents = 0;
      $wallet_accounts_cnt = 0;
      $wallet_deposit_cents = 0;
      $wallet_purchase_cents = 0;
      if (table_exists($PDO, 'accounts')) {
        $row = $PDO->query("SELECT COALESCE(SUM(balance_cents),0) AS cents, COUNT(*) AS cnt FROM accounts")->fetch();
        $wallet_liability_cents = (int)($row['cents'] ?? 0);
        $wallet_accounts_cnt = (int)($row['cnt'] ?? 0);
      }
      if (table_exists($PDO, 'ledger')) {
        $row = $PDO->query("
          SELECT
            COALESCE(SUM(CASE WHEN type='deposit' THEN amount_cents ELSE 0 END),0) AS deposit_cents,
            COALESCE(SUM(CASE WHEN type='purchase' THEN -amount_cents ELSE 0 END),0) AS purchase_cents
          FROM ledger
        ")->fetch();
        $wallet_deposit_cents = (int)($row['deposit_cents'] ?? 0);
        $wallet_purchase_cents = (int)($row['purchase_cents'] ?? 0);
      }

      $s = ['pending_cnt'=>0,'pending_cents'=>0,'approved_cnt'=>0,'approved_cents'=>0,'declined_cnt'=>0,'declined_cents'=>0];
      if (table_exists($PDO, 'payments')) {
        $payAmountExpr = column_exists($PDO, 'payments', 'amount_cents') ? 'amount_cents' : 'amount*100';
        $s = $PDO->query("
          SELECT
            SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending_cnt,
            COALESCE(SUM(CASE WHEN status='pending' THEN {$payAmountExpr} ELSE 0 END),0) AS pending_cents,
            SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_cnt,
            COALESCE(SUM(CASE WHEN status='approved' THEN {$payAmountExpr} ELSE 0 END),0) AS approved_cents,
            SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined_cnt,
            COALESCE(SUM(CASE WHEN status='declined' THEN {$payAmountExpr} ELSE 0 END),0) AS declined_cents
          FROM payments
        ")->fetch() ?: $s;
      }

      $t = ['cents'=>0];
      if (table_exists($PDO, 'payments')) {
        $payAmountExpr = column_exists($PDO, 'payments', 'amount_cents') ? 'amount_cents' : 'amount*100';
        $t = $PDO->query("
          SELECT COALESCE(SUM({$payAmountExpr}),0) AS cents
          FROM payments
          WHERE status='approved' AND DATE(approved_at)=CURDATE()
        ")->fetch() ?: $t;
      }

      $p = ['total_cents'=>0,'applied_cents'=>0,'pending_cnt'=>0,'applied_cnt'=>0,'failed_cnt'=>0];
      $top_plans = [];
      if (table_exists($PDO, 'purchases')) {
        $purAmountExpr = column_exists($PDO, 'purchases', 'price_cents') ? 'price_cents' : 'price*100';
        $p = $PDO->query("
          SELECT
            COALESCE(SUM({$purAmountExpr}),0) AS total_cents,
            COALESCE(SUM(CASE WHEN status='applied' THEN {$purAmountExpr} ELSE 0 END),0) AS applied_cents,
            COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending_cnt,
            COALESCE(SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END),0) AS applied_cnt,
            COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed_cnt
          FROM purchases
        ")->fetch() ?: $p;

        $top_plans = $PDO->query("
          SELECT plan_code, COUNT(*) AS cnt, COALESCE(SUM({$purAmountExpr}),0) AS cents
          FROM purchases
          WHERE status='applied' AND activated_at IS NOT NULL
            AND activated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY plan_code
          ORDER BY cnt DESC
          LIMIT 8
        ")->fetchAll() ?: [];
      }

      $ap = ['active_users'=>0];
      try {
        $rActive = rdb_pdo();
        if (table_exists($rActive, 'radusergroup')) {
          $ap['active_users'] = (int)($rActive->query("
            SELECT COUNT(DISTINCT
              CASE
                WHEN username REGEXP '^233[0-9]{9}$' THEN username
                WHEN username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(username,2))
                ELSE username
              END
            ) AS active_users
            FROM radusergroup
            WHERE groupname='HS_ACTIVE'
          ")->fetchColumn() ?: 0);
        } elseif (table_exists($PDO, 'purchases')) {
          $ap = $PDO->query("
            SELECT COUNT(DISTINCT msisdn) AS active_users
            FROM purchases
            WHERE status='applied'
              AND (expires_at IS NULL OR expires_at >= NOW())
          ")->fetch() ?: $ap;
        }
      } catch (Throwable $e) {
        if (table_exists($PDO, 'purchases')) {
          $ap = $PDO->query("
            SELECT COUNT(DISTINCT msisdn) AS active_users
            FROM purchases
            WHERE status='applied'
              AND (expires_at IS NULL OR expires_at >= NOW())
          ")->fetch() ?: $ap;
        }
      }

      $pay_series = [];
      $pur_series = [];
      $referral = [
        'pending_cents'=>0,
        'released_cents'=>0,
        'expired_cents'=>0,
        'pending_cnt'=>0,
        'released_cnt'=>0,
        'expired_cnt'=>0,
        'skipped_cnt'=>0,
      ];
      if (table_exists($PDO, 'payments')) {
        $payAmountExpr = column_exists($PDO, 'payments', 'amount_cents') ? 'amount_cents' : 'amount*100';
        $pay_series = $PDO->query("
          SELECT DATE(approved_at) AS d, COALESCE(SUM({$payAmountExpr}),0) AS cents
          FROM payments
          WHERE status='approved' AND approved_at IS NOT NULL
          GROUP BY DATE(approved_at)
          ORDER BY d DESC
          LIMIT 14
        ")->fetchAll() ?: [];
      }
      if (table_exists($PDO, 'purchases')) {
        $purAmountExpr = column_exists($PDO, 'purchases', 'price_cents') ? 'price_cents' : 'price*100';
        $pur_series = $PDO->query("
          SELECT DATE(activated_at) AS d, COALESCE(SUM({$purAmountExpr}),0) AS cents
          FROM purchases
          WHERE status='applied' AND activated_at IS NOT NULL
          GROUP BY DATE(activated_at)
          ORDER BY d DESC
          LIMIT 14
        ")->fetchAll() ?: [];
      }

      try {
        $referral = referrals_admin_stats();
      } catch (Throwable $e) {
        $referral = [
          'pending_cents'=>0,
          'released_cents'=>0,
          'expired_cents'=>0,
          'pending_cnt'=>0,
          'released_cnt'=>0,
          'expired_cnt'=>0,
          'skipped_cnt'=>0,
        ];
      }

      $active_sessions = null;
      $active_sessions_mode = null;
      try {
        $r = rdb_pdo();
        if (table_exists($r, 'radacct')) {
          $openWhere = str_replace('acctstoptime', 'ra.acctstoptime', radacct_open_where_clause());
          $recentExpr = column_exists($r, 'radacct', 'acctupdatetime')
            ? 'COALESCE(ra.acctupdatetime, ra.acctstarttime)'
            : 'ra.acctstarttime';
          $reopenedRecentExpr = "(ra.acctstoptime IS NOT NULL AND ra.acctstoptime <> '0000-00-00 00:00:00' AND {$recentExpr} > ra.acctstoptime)";
          $logicalOpenExpr = "(($openWhere) OR ($reopenedRecentExpr))";
          $canonExpr = "CASE
            WHEN ra.username REGEXP '^233[0-9]{9}$' THEN ra.username
            WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
            ELSE ra.username
          END";
          $peerExpr = "CASE
            WHEN ra.username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTRING(ra.username,4))
            WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
            ELSE ra.username
          END";
          $sessionKeyExpr = "CONCAT({$canonExpr}, '|', COALESCE(NULLIF(ra.callingstationid,''), NULLIF(ra.acctsessionid,''), NULLIF(ra.framedipaddress,''), CAST(ra.radacctid AS CHAR)))";
          $hsActiveFilter = table_exists($r, 'radusergroup')
            ? "AND EXISTS (
                 SELECT 1
                 FROM radusergroup rug
                 WHERE rug.groupname='HS_ACTIVE'
                   AND rug.username IN (ra.username, {$peerExpr}, {$canonExpr})
               )"
            : "";
          $active_sessions = (int)($r->query("
            SELECT COUNT(DISTINCT {$sessionKeyExpr})
            FROM radacct ra
            WHERE {$logicalOpenExpr}
              AND {$recentExpr} >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
              {$hsActiveFilter}
          ")->fetchColumn() ?: 0);
          $active_sessions_mode = 'open_session_recent_15m';
        }
      } catch (Throwable $e) {
        $active_sessions = null;
        $active_sessions_mode = null;
      }

      if ($locationId !== null && $locationId > 0) {
        try {
          if (function_exists('radius_normalize_legacy_nopaid')) {
            $rSeed = rdb_pdo();
            radius_normalize_legacy_nopaid($rSeed);
          }
        } catch (Throwable $e) { /* non-fatal */ }
        $referral = [
          'pending_cents'=>0,
          'released_cents'=>0,
          'expired_cents'=>0,
          'pending_cnt'=>0,
          'released_cnt'=>0,
          'expired_cnt'=>0,
          'skipped_cnt'=>0,
        ];
        $locUsers = [];
        if (table_exists($PDO, 'user_location_profiles')) {
          $stLoc = $PDO->prepare("SELECT msisdn FROM user_location_profiles WHERE location_id=:l");
          $stLoc->execute([':l' => $locationId]);
          $locUsers = array_values(array_unique(array_filter(array_map('normalize_msisdn', $stLoc->fetchAll(PDO::FETCH_COLUMN, 0) ?: []))));
        }
        if (location_is_default_id($locationId)) {
          // Compatibility for legacy users that predate explicit profile binding:
          // default site includes unbound users until they are assigned elsewhere.
          $seedUsers = [];
          $seedTables = ['accounts', 'ledger', 'payments', 'purchases', 'auto_renew_settings', 'wallet_promo_grants'];
          foreach ($seedTables as $seedTable) {
            if (!table_exists($PDO, $seedTable) || !column_exists($PDO, $seedTable, 'msisdn')) continue;
            try {
              $stSeed = $PDO->query("SELECT DISTINCT msisdn FROM `{$seedTable}` WHERE msisdn IS NOT NULL AND msisdn<>'' LIMIT 50000");
              $seedUsers = array_merge($seedUsers, $stSeed->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
            } catch (Throwable $e) { /* non-fatal */ }
          }
          try {
            $rSeed = rdb_pdo();
            if (table_exists($rSeed, 'radusergroup')) {
              $stSeedR = $rSeed->query("
                SELECT DISTINCT username
                FROM radusergroup
                WHERE groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID')
                LIMIT 50000
              ");
              $seedUsers = array_merge($seedUsers, $stSeedR->fetchAll(PDO::FETCH_COLUMN, 0) ?: []);
            }
          } catch (Throwable $e) { /* non-fatal */ }

          $seedCanon = [];
          foreach ($seedUsers as $rawSeedUser) {
            $m = normalize_msisdn((string)$rawSeedUser);
            if ($m !== '') $seedCanon[$m] = true;
          }
          if ($seedCanon) {
            $fallbackUsers = location_filter_msisdns(array_keys($seedCanon), $locationId);
            foreach ($fallbackUsers as $m) {
              $m = normalize_msisdn((string)$m);
              if ($m !== '') $locUsers[] = $m;
            }
            $locUsers = array_values(array_unique($locUsers));
          }
        }

        $variantMap = [];
        foreach ($locUsers as $m) {
          if ($m === '') continue;
          $variantMap[$m] = true;
          $variantMap[msisdn_local($m)] = true;
        }
        $locVariants = array_values(array_filter(array_unique(array_keys($variantMap))));

        $mkIn = static function(array $vals, string $prefix): array {
          $ph = [];
          $bind = [];
          foreach (array_values($vals) as $i => $v) {
            $k = ':'.$prefix.$i;
            $ph[] = $k;
            $bind[$k] = $v;
          }
          return [$ph ? implode(',', $ph) : "''", $bind];
        };

        if (!$locVariants) {
          $wallet_liability_cents = 0;
          $wallet_accounts_cnt = 0;
          $wallet_deposit_cents = 0;
          $wallet_purchase_cents = 0;
          $s = ['pending_cnt'=>0,'pending_cents'=>0,'approved_cnt'=>0,'approved_cents'=>0,'declined_cnt'=>0,'declined_cents'=>0];
          $t = ['cents'=>0];
          $p = ['total_cents'=>0,'applied_cents'=>0,'pending_cnt'=>0,'applied_cnt'=>0,'failed_cnt'=>0];
          $top_plans = [];
          $pay_series = [];
          $pur_series = [];
          $ap = ['active_users'=>0];
          $active_sessions = 0;
          $active_sessions_mode = 'open_session_recent_15m';
        } else {
          [$inUsers, $bindUsers] = $mkIn($locVariants, 'u');

          if (table_exists($PDO, 'accounts')) {
            $stW = $PDO->prepare("SELECT COALESCE(SUM(balance_cents),0) AS cents, COUNT(*) AS cnt FROM accounts WHERE msisdn IN ({$inUsers})");
            $stW->execute($bindUsers);
            $row = $stW->fetch() ?: ['cents'=>0, 'cnt'=>0];
            $wallet_liability_cents = (int)($row['cents'] ?? 0);
            $wallet_accounts_cnt = (int)($row['cnt'] ?? 0);
          } else {
            $wallet_liability_cents = 0;
            $wallet_accounts_cnt = 0;
          }

          if (table_exists($PDO, 'ledger')) {
            $stL = $PDO->prepare("
              SELECT
                COALESCE(SUM(CASE WHEN type='deposit' THEN amount_cents ELSE 0 END),0) AS deposit_cents,
                COALESCE(SUM(CASE WHEN type='purchase' THEN -amount_cents ELSE 0 END),0) AS purchase_cents
              FROM ledger
              WHERE msisdn IN ({$inUsers})
            ");
            $stL->execute($bindUsers);
            $row = $stL->fetch() ?: ['deposit_cents'=>0, 'purchase_cents'=>0];
            $wallet_deposit_cents = (int)($row['deposit_cents'] ?? 0);
            $wallet_purchase_cents = (int)($row['purchase_cents'] ?? 0);
          } else {
            $wallet_deposit_cents = 0;
            $wallet_purchase_cents = 0;
          }

          if (table_exists($PDO, 'payments') && column_exists($PDO, 'payments', 'msisdn')) {
            $payAmountExpr = column_exists($PDO, 'payments', 'amount_cents') ? 'amount_cents' : 'amount*100';
            $stPay = $PDO->prepare("
              SELECT
                SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending_cnt,
                COALESCE(SUM(CASE WHEN status='pending' THEN {$payAmountExpr} ELSE 0 END),0) AS pending_cents,
                SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_cnt,
                COALESCE(SUM(CASE WHEN status='approved' THEN {$payAmountExpr} ELSE 0 END),0) AS approved_cents,
                SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined_cnt,
                COALESCE(SUM(CASE WHEN status='declined' THEN {$payAmountExpr} ELSE 0 END),0) AS declined_cents
              FROM payments
              WHERE msisdn IN ({$inUsers})
            ");
            $stPay->execute($bindUsers);
            $s = $stPay->fetch() ?: $s;

            $stToday = $PDO->prepare("
              SELECT COALESCE(SUM({$payAmountExpr}),0) AS cents
              FROM payments
              WHERE status='approved' AND DATE(approved_at)=CURDATE() AND msisdn IN ({$inUsers})
            ");
            $stToday->execute($bindUsers);
            $t = $stToday->fetch() ?: $t;

            $stSeries = $PDO->prepare("
              SELECT DATE(approved_at) AS d, COALESCE(SUM({$payAmountExpr}),0) AS cents
              FROM payments
              WHERE status='approved' AND approved_at IS NOT NULL AND msisdn IN ({$inUsers})
              GROUP BY DATE(approved_at)
              ORDER BY d DESC
              LIMIT 14
            ");
            $stSeries->execute($bindUsers);
            $pay_series = $stSeries->fetchAll() ?: [];
          } else {
            $s = ['pending_cnt'=>0,'pending_cents'=>0,'approved_cnt'=>0,'approved_cents'=>0,'declined_cnt'=>0,'declined_cents'=>0];
            $t = ['cents'=>0];
            $pay_series = [];
          }

          if (table_exists($PDO, 'purchases')) {
            $purAmountExpr = column_exists($PDO, 'purchases', 'price_cents') ? 'price_cents' : 'price*100';
            $hasPurLoc = column_exists($PDO, 'purchases', 'location_id');
            if ($hasPurLoc) {
              $stPur = $PDO->prepare("
                SELECT
                  COALESCE(SUM({$purAmountExpr}),0) AS total_cents,
                  COALESCE(SUM(CASE WHEN status='applied' THEN {$purAmountExpr} ELSE 0 END),0) AS applied_cents,
                  COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending_cnt,
                  COALESCE(SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END),0) AS applied_cnt,
                  COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed_cnt
                FROM purchases
                WHERE location_id=:l
              ");
              $stPur->execute([':l' => $locationId]);
              $p = $stPur->fetch() ?: $p;

              $stTop = $PDO->prepare("
                SELECT plan_code, COUNT(*) AS cnt, COALESCE(SUM({$purAmountExpr}),0) AS cents
                FROM purchases
                WHERE status='applied' AND activated_at IS NOT NULL
                  AND activated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                  AND location_id=:l
                GROUP BY plan_code
                ORDER BY cnt DESC
                LIMIT 8
              ");
              $stTop->execute([':l' => $locationId]);
              $top_plans = $stTop->fetchAll() ?: [];

              $stPurSeries = $PDO->prepare("
                SELECT DATE(activated_at) AS d, COALESCE(SUM({$purAmountExpr}),0) AS cents
                FROM purchases
                WHERE status='applied' AND activated_at IS NOT NULL AND location_id=:l
                GROUP BY DATE(activated_at)
                ORDER BY d DESC
                LIMIT 14
              ");
              $stPurSeries->execute([':l' => $locationId]);
              $pur_series = $stPurSeries->fetchAll() ?: [];
            } else {
              $stPur = $PDO->prepare("
                SELECT
                  COALESCE(SUM({$purAmountExpr}),0) AS total_cents,
                  COALESCE(SUM(CASE WHEN status='applied' THEN {$purAmountExpr} ELSE 0 END),0) AS applied_cents,
                  COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending_cnt,
                  COALESCE(SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END),0) AS applied_cnt,
                  COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed_cnt
                FROM purchases
                WHERE msisdn IN ({$inUsers})
              ");
              $stPur->execute($bindUsers);
              $p = $stPur->fetch() ?: $p;

              $stTop = $PDO->prepare("
                SELECT plan_code, COUNT(*) AS cnt, COALESCE(SUM({$purAmountExpr}),0) AS cents
                FROM purchases
                WHERE status='applied' AND activated_at IS NOT NULL
                  AND activated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                  AND msisdn IN ({$inUsers})
                GROUP BY plan_code
                ORDER BY cnt DESC
                LIMIT 8
              ");
              $stTop->execute($bindUsers);
              $top_plans = $stTop->fetchAll() ?: [];

              $stPurSeries = $PDO->prepare("
                SELECT DATE(activated_at) AS d, COALESCE(SUM({$purAmountExpr}),0) AS cents
                FROM purchases
                WHERE status='applied' AND activated_at IS NOT NULL AND msisdn IN ({$inUsers})
                GROUP BY DATE(activated_at)
                ORDER BY d DESC
                LIMIT 14
              ");
              $stPurSeries->execute($bindUsers);
              $pur_series = $stPurSeries->fetchAll() ?: [];
            }
          } else {
            $p = ['total_cents'=>0,'applied_cents'=>0,'pending_cnt'=>0,'applied_cnt'=>0,'failed_cnt'=>0];
            $top_plans = [];
            $pur_series = [];
          }

          $ap = ['active_users'=>0];
          try {
            $rActive = rdb_pdo();
            if (table_exists($rActive, 'radusergroup')) {
              $stA = $rActive->prepare("
                SELECT COUNT(DISTINCT
                  CASE
                    WHEN username REGEXP '^233[0-9]{9}$' THEN username
                    WHEN username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(username,2))
                    ELSE username
                  END
                ) AS active_users
                FROM radusergroup
                WHERE groupname='HS_ACTIVE' AND username IN ({$inUsers})
              ");
              $stA->execute($bindUsers);
              $ap['active_users'] = (int)($stA->fetchColumn() ?: 0);
            }
          } catch (Throwable $e) {
            $ap = ['active_users'=>0];
          }

          try {
            $r = rdb_pdo();
            if (table_exists($r, 'radacct')) {
              $openWhere = str_replace('acctstoptime', 'ra.acctstoptime', radacct_open_where_clause());
              $recentExpr = column_exists($r, 'radacct', 'acctupdatetime')
                ? 'COALESCE(ra.acctupdatetime, ra.acctstarttime)'
                : 'ra.acctstarttime';
              $reopenedRecentExpr = "(ra.acctstoptime IS NOT NULL AND ra.acctstoptime <> '0000-00-00 00:00:00' AND {$recentExpr} > ra.acctstoptime)";
              $logicalOpenExpr = "(($openWhere) OR ($reopenedRecentExpr))";
              $canonExpr = "CASE
                WHEN ra.username REGEXP '^233[0-9]{9}$' THEN ra.username
                WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
                ELSE ra.username
              END";
              $peerExpr = "CASE
                WHEN ra.username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTRING(ra.username,4))
                WHEN ra.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(ra.username,2))
                ELSE ra.username
              END";
              $sessionKeyExpr = "CONCAT({$canonExpr}, '|', COALESCE(NULLIF(ra.callingstationid,''), NULLIF(ra.acctsessionid,''), NULLIF(ra.framedipaddress,''), CAST(ra.radacctid AS CHAR)))";
              $stSess = $r->prepare("
                SELECT COUNT(DISTINCT {$sessionKeyExpr})
                FROM radacct ra
                WHERE {$logicalOpenExpr}
                  AND {$recentExpr} >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
                  AND EXISTS (
                    SELECT 1 FROM radusergroup rug
                    WHERE rug.groupname='HS_ACTIVE'
                      AND rug.username IN (ra.username, {$peerExpr}, {$canonExpr})
                  )
                  AND ra.username IN ({$inUsers})
              ");
              $stSess->execute($bindUsers);
              $active_sessions = (int)($stSess->fetchColumn() ?: 0);
              $active_sessions_mode = 'open_session_recent_15m';
            }
          } catch (Throwable $e) {
            $active_sessions = 0;
            $active_sessions_mode = 'open_session_recent_15m';
          }
        }
      }

      echo json_encode([
        'ok' => true,
        'location_id' => $locationId,
        'wallet_liability_cents' => (int)$wallet_liability_cents,
        'wallet' => [
          'accounts_cnt' => (int)$wallet_accounts_cnt,
          'deposits_cents' => (int)$wallet_deposit_cents,
          'purchases_cents' => (int)$wallet_purchase_cents,
        ],
        'payments' => [
          'pending_cnt'   => (int)($s['pending_cnt'] ?? 0),
          'pending_cents' => (int)($s['pending_cents'] ?? 0),
          'approved_cnt'  => (int)($s['approved_cnt'] ?? 0),
          'approved_cents'=> (int)($s['approved_cents'] ?? 0),
          'declined_cnt'  => (int)($s['declined_cnt'] ?? 0),
          'declined_cents'=> (int)($s['declined_cents'] ?? 0),
          'approved_today_cents' => (int)($t['cents'] ?? 0),
          'series' => $pay_series,
        ],
        'purchases' => [
          'total_cents'  => (int)($p['total_cents']  ?? 0),
          'applied_cents'=> (int)($p['applied_cents']?? 0),
          'pending_cnt'  => (int)($p['pending_cnt']  ?? 0),
          'applied_cnt'  => (int)($p['applied_cnt']  ?? 0),
          'failed_cnt'   => (int)($p['failed_cnt']   ?? 0),
          'top_plans'    => $top_plans,
          'series' => $pur_series,
        ],
        'referrals' => $referral,
        'active_users' => (int)($ap['active_users'] ?? 0),
        'active_sessions' => $active_sessions,
        'active_sessions_mode' => $active_sessions_mode,
      ]);
      break;
    }

    case 'pending': {
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;

      if ($locationId === null || !column_exists($PDO, 'payments', 'msisdn')) {
        $st = $PDO->query("
          SELECT id, ref, msisdn, amount, method, payer_name, notes, status, created_at
          FROM payments
          WHERE status='pending'
          ORDER BY id DESC
          LIMIT 200
        ");
        echo json_encode(['ok'=>true,'pending'=>$st->fetchAll(), 'location_id'=>$locationId]);
        break;
      }

      $locUsers = [];
      $pendingCandidates = [];
      $stCand = $PDO->query("
        SELECT DISTINCT msisdn
        FROM payments
        WHERE status='pending' AND msisdn IS NOT NULL AND msisdn<>''
        ORDER BY id DESC
        LIMIT 5000
      ");
      $pendingCandidates = $stCand ? ($stCand->fetchAll(PDO::FETCH_COLUMN, 0) ?: []) : [];
      $locUsers = location_filter_msisdns($pendingCandidates, $locationId);
      $variants = [];
      foreach ($locUsers as $m) {
        $variants[$m] = true;
        $variants[msisdn_local($m)] = true;
      }
      $vals = array_values(array_filter(array_keys($variants)));
      if (!$vals) {
        echo json_encode(['ok'=>true,'pending'=>[], 'location_id'=>$locationId]);
        break;
      }
      $ph = [];
      $bind = [];
      foreach ($vals as $i => $v) {
        $k = ':u'.$i;
        $ph[] = $k;
        $bind[$k] = $v;
      }
      $sql = "
        SELECT id, ref, msisdn, amount, method, payer_name, notes, status, created_at
        FROM payments
        WHERE status='pending' AND msisdn IN (".implode(',', $ph).")
        ORDER BY id DESC
        LIMIT 200
      ";
      $st = $PDO->prepare($sql);
      $st->execute($bind);
      echo json_encode(['ok'=>true,'pending'=>$st->fetchAll(), 'location_id'=>$locationId]);
      break;
    }

    case 'decision': {
      $ref   = trim((string)($in['ref']   ?? ''));
      $act   = strtolower(trim((string)($in['action'] ?? '')));
      $notes = trim((string)($in['notes'] ?? ''));

      if ($ref === '' || !in_array($act, ['approve','decline'], true)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'bad_request']); break;
      }
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
      $hasPaymentMsisdn = false;
      try { $hasPaymentMsisdn = column_exists($PDO, 'payments', 'msisdn'); } catch (Throwable $e) { $hasPaymentMsisdn = false; }

      $outerStarted = false;
      if (!$PDO->inTransaction()) { $PDO->beginTransaction(); $outerStarted = true; }

      try {
        // Lock row
        $st = $PDO->prepare("SELECT * FROM payments WHERE ref=:r FOR UPDATE");
        $st->execute([':r'=>$ref]);
        $row = $st->fetch();
        if (!$row) { throw new RuntimeException('not_found'); }
        if ($locationId !== null && $hasPaymentMsisdn) {
          $rowMsisdn = normalize_msisdn((string)($row['msisdn'] ?? ''));
          if ($rowMsisdn !== '') {
            $allowed = location_filter_msisdns([$rowMsisdn], $locationId);
            if (!$allowed) throw new RuntimeException('forbidden_scope');
          }
        }
        if ($row['status'] !== 'pending') {
          echo json_encode([
            'ok'=>true,
            'status'=>$row['status'],
            'ref'=>$ref,
            'sms_attempted'=>false,
            'sms_sent'=>false,
            'sms_template_source'=>null,
          ]);
          if ($outerStarted) $PDO->commit();
          break;
        }

        $msisdn = (string)($row['msisdn'] ?? '');
        $amount_cents = 0;
        if (isset($row['amount_cents']) && is_numeric($row['amount_cents'])) {
          $amount_cents = (int)$row['amount_cents'];
        }
        if ($amount_cents <= 0 && isset($row['amount'])) {
          $amount_cents = (int)round(((float)$row['amount']) * 100);
        }
        $adminActor = trim((string)($_SESSION['admin_user'] ?? 'admin'));
        if ($adminActor === '') $adminActor = 'admin';
        $remoteAddr = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
        $approvedBy = $adminActor . ($remoteAddr !== '' ? (' ' . $remoteAddr) : '');
        $hasApprovedBy = false;
        try { $hasApprovedBy = column_exists($PDO, 'payments', 'approved_by'); } catch (Throwable $e) { $hasApprovedBy = false; }

        if ($act === 'approve') {
          // mark approved
          if ($hasApprovedBy) {
            $st = $PDO->prepare("UPDATE payments
              SET status='approved',
                  notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END),
                  approved_at=NOW(),
                  approved_by=:by
              WHERE ref=:r");
            $st->execute([':n'=>$notes, ':by'=>$approvedBy, ':r'=>$ref]);
          } else {
            $st = $PDO->prepare("UPDATE payments
              SET status='approved',
                  notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END),
                  approved_at=NOW()
              WHERE ref=:r");
            $st->execute([':n'=>$notes, ':r'=>$ref]);
          }

          // ensure account row exists
          $PDO->prepare("INSERT INTO accounts (msisdn,balance_cents) VALUES (:m,0)
                         ON DUPLICATE KEY UPDATE balance_cents=balance_cents")
              ->execute([':m'=>$msisdn]);

          // increment balance
          $PDO->prepare("UPDATE accounts SET balance_cents=balance_cents + :c WHERE msisdn=:m")
              ->execute([':c'=>$amount_cents, ':m'=>$msisdn]);

          // ledger entry (unique ref expected)
          $PDO->prepare("INSERT INTO ledger (msisdn,type,amount_cents,ref,notes)
                         VALUES (:m,'deposit',:c,:r,'MoMo deposit approved')")
              ->execute([':m'=>$msisdn, ':c'=>$amount_cents, ':r'=>$ref]);
        } else {
          // decline
          if ($hasApprovedBy) {
            $st = $PDO->prepare("UPDATE payments
              SET status='declined',
                  notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END),
                  approved_at=NOW(),
                  approved_by=:by
              WHERE ref=:r");
            $st->execute([':n'=>$notes, ':by'=>$approvedBy, ':r'=>$ref]);
          } else {
            $st = $PDO->prepare("UPDATE payments
              SET status='declined',
                  notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END),
                  approved_at=NOW()
              WHERE ref=:r");
            $st->execute([':n'=>$notes, ':r'=>$ref]);
          }
        }

        if ($outerStarted) $PDO->commit();

        $sms = [
          'attempted' => false,
          'sent' => false,
          'template_source' => null,
          'error' => null,
        ];
        try {
          if ($msisdn !== '') {
            if ($act === 'approve') {
              $balanceCents = null;
              try {
                $bs = $PDO->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m LIMIT 1");
                $bs->execute([':m'=>$msisdn]);
                $bv = $bs->fetchColumn();
                if ($bv !== false && $bv !== null && is_numeric($bv)) $balanceCents = (int)$bv;
              } catch (Throwable $e) {
                $balanceCents = null;
              }
              $sms = sms_send_templated(
                $msisdn,
                'SMS_TOPUP_CONFIRM_TEXT',
                'Top up confirmed: GHS {AMOUNT_GHS}. Balance: GHS {BALANCE_GHS}. Ref: {REF}.',
                [
                  'NAME' => '',
                  'MSISDN' => sms_normalize_local($msisdn),
                  'AMOUNT_GHS' => number_format($amount_cents / 100, 2),
                  'BALANCE_GHS' => $balanceCents !== null ? number_format($balanceCents / 100, 2) : '',
                  'REF' => $ref,
                ]
              );
            } else {
              $sms = sms_send_templated(
                $msisdn,
                'SMS_PAYMENT_FAILED_TEXT',
                'Payment request {REF} was declined. Please retry payment or contact support.',
                [
                  'NAME' => '',
                  'MSISDN' => sms_normalize_local($msisdn),
                  'REF' => $ref,
                ]
              );
            }
          }
        } catch (Throwable $e) {
          $sms = [
            'attempted' => true,
            'sent' => false,
            'template_source' => null,
            'error' => 'sms_exception: ' . $e->getMessage(),
          ];
        }

        $smsAttempted = (bool)($sms['attempted'] ?? false);
        $smsSent = (bool)($sms['sent'] ?? false);
        $smsTemplateSource = $sms['template_source'] ?? null;
        $smsWarning = null;
        if ($smsAttempted && !$smsSent) {
          $smsWarning = 'Decision saved, but SMS could not be delivered.';
          error_log("[admin/api decision sms] ref={$ref} action={$act} msisdn={$msisdn} error=" . (string)($sms['error'] ?? 'unknown'));
        }

        $out = [
          'ok'=>true,
          'ref'=>$ref,
          'status'=>$act === 'approve' ? 'approved' : 'declined',
          'sms_attempted'=>$smsAttempted,
          'sms_sent'=>$smsSent,
          'sms_template_source'=>$smsTemplateSource,
        ];
        if ($smsWarning !== null) $out['sms_warning'] = $smsWarning;
        echo json_encode($out);
      } catch (Throwable $e) {
        if ($outerStarted && $PDO->inTransaction()) $PDO->rollBack();
        if ($e->getMessage() === 'not_found') {
          http_response_code(404); echo json_encode(['ok'=>false,'error'=>'not_found']);
        } elseif ($e->getMessage() === 'forbidden_scope') {
          http_response_code(403); echo json_encode(['ok'=>false,'error'=>'forbidden_scope']);
        } else {
          http_response_code(500); echo json_encode(['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()]);
        }
      }
      break;
    }

    case 'plans': {
      try {
        $scope = admin_location_scope($in, true);
        if (!($scope['ok'] ?? false)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
          break;
        }
        $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
        if ($locationId !== null && $locationId > 0) {
          $plans = radius_fetch_plans(true, $locationId);
          echo json_encode(['ok'=>true,'plans'=>$plans,'location_id'=>$locationId]);
          break;
        }

        $plansBySite = [];
        $flat = [];
        foreach (location_list(true) as $loc) {
          $locId = (int)($loc['id'] ?? 0);
          if ($locId <= 0) continue;
          $siteCode = (string)($loc['code'] ?? '');
          $siteName = (string)($loc['name'] ?? $siteCode);
          $sitePlans = radius_fetch_plans(true, $locId);
          foreach ($sitePlans as &$planRow) {
            if (!is_array($planRow)) continue;
            $planRow['location_id'] = $locId;
            $planRow['location_code'] = $siteCode;
            $planRow['location_name'] = $siteName;
          }
          unset($planRow);
          $plansBySite[] = [
            'location_id' => $locId,
            'location_code' => $siteCode,
            'location_name' => $siteName,
            'plans' => $sitePlans,
          ];
          foreach ($sitePlans as $planRow) $flat[] = $planRow;
        }
        echo json_encode([
          'ok' => true,
          'plans' => $flat,
          'plans_by_site' => $plansBySite,
          'location_id' => null,
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_list_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'plan_save': {
      $scope = admin_location_scope($in, false);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'location_required')]); break;
      }
      $locationId = (int)($scope['location_id'] ?? 0);
      if ($locationId <= 0) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_required']); break;
      }

      $code = trim((string)from_any([$in],'plan_code',''));
      if ($code === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $code)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'invalid_plan_code']); break;
      }
      if (plan_reserved($code)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'reserved_plan_code']); break;
      }

      $display = trim((string)from_any([$in],'display_name', from_any([$in],'name','')));
      $rate = trim((string)from_any([$in],'rate_limit',''));
      $addr = trim((string)from_any([$in],'address_list',''));
      if ($addr === '') $addr = 'HS_ACTIVE';

      $days = (int)from_any([$in],'duration_days', from_any([$in],'days', 0));
      if ($days <= 0) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'invalid_duration_days']); break;
      }

      $priceSet = false;
      $price = 0;
      if (isset($in['price_cents']) && $in['price_cents'] !== '') {
        if (!is_numeric($in['price_cents'])) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'invalid_price']); break;
        }
        $price = max(0, (int)$in['price_cents']); $priceSet = true;
      } elseif (isset($in['price']) && trim((string)$in['price']) !== '') {
        $rawPrice = trim((string)$in['price']);
        $clean = preg_replace('/[^\d.]/', '', $rawPrice);
        if ($clean === '') {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'invalid_price']); break;
        }
        $price = (int)round(((float)$clean) * 100);
        $priceSet = true;
      }
      if (!$priceSet) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'price_required']); break;
      }

      $quotaBytes = parse_quota_bytes($in);
      $active = parse_bool(from_any([$in],'active', '1'));

      $attrs = [
        'Nister-Price-Cents'   => (string)$price,
        'Nister-Duration-Days' => (string)$days,
        'Mikrotik-Address-List'=> $addr,
        'Nister-Active'        => $active ? '1' : '0',
      ];
      if ($display !== '') $attrs['Nister-Plan-Name'] = $display;
      if ($rate !== '') $attrs['Mikrotik-Rate-Limit'] = $rate;
      if ($quotaBytes !== null && $quotaBytes > 0) {
        $attrs['Nister-Quota-Bytes'] = (string)$quotaBytes;
        $hi = intdiv($quotaBytes, 4294967296);
        $lo = (int)($quotaBytes - ($hi * 4294967296));
        $attrs['Mikrotik-Total-Limit'] = (string)$lo;
        if ($hi > 0) $attrs['Mikrotik-Total-Limit-Gigawords'] = (string)$hi;
      }

      $planAttrs = [
        'Nister-Plan-Name',
        'Nister-Price-Cents',
        'Nister-Duration-Days',
        'Nister-Quota-Bytes',
        'Mikrotik-Total-Limit',
        'Mikrotik-Total-Limit-Gigawords',
        'Mikrotik-Rate-Limit',
        'Mikrotik-Address-List',
        'Nister-Active',
      ];

      try {
        location_upsert_plan($locationId, [
          'code' => $code,
          'display_name' => $display,
          'price_cents' => $price,
          'duration_days' => $days,
          'quota_bytes' => $quotaBytes,
          'rate_limit' => $rate,
          'address_list' => $addr,
          'active' => $active,
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_save_failed','detail'=>$e->getMessage()]);
        break;
      }

      // Keep legacy global radgroup sync only for default site compatibility.
      if (location_is_default_id($locationId)) {
        try {
          $r = rdb_pdo();
          $started = false;
          if (!$r->inTransaction()) { $r->beginTransaction(); $started = true; }

          $ph = implode(",", array_fill(0, count($planAttrs), "?"));
          foreach (['radgroupreply','radgroupcheck'] as $tbl) {
            $st = $r->prepare("DELETE FROM {$tbl} WHERE groupname=? AND attribute IN ($ph)");
            $st->execute(array_merge([$code], $planAttrs));
          }

          $ins = $r->prepare("INSERT INTO radgroupreply (groupname, attribute, op, value)
                              VALUES (:g, :a, ':=', :v)");
          foreach ($attrs as $a=>$v) {
            $ins->execute([':g'=>$code, ':a'=>$a, ':v'=>$v]);
          }

          if ($started && $r->inTransaction()) $r->commit();
        } catch (Throwable $e) {
          if (isset($r) && $r instanceof PDO && $r->inTransaction()) $r->rollBack();
          error_log('[admin/api plan_save global_sync] location='.$locationId.' code='.$code.' error='.$e->getMessage());
        }
      }

      $saved = null;
      try {
        foreach (radius_fetch_plans(true, $locationId) as $p) {
          if (strcasecmp($p['code'], $code) === 0) { $saved = $p; break; }
        }
      } catch (Throwable $e) { $saved = null; }
      echo json_encode(['ok'=>true,'plan'=>$saved,'location_id'=>$locationId]);
      break;
    }

    case 'plan_delete': {
      $scope = admin_location_scope($in, false);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'location_required')]); break;
      }
      $locationId = (int)($scope['location_id'] ?? 0);
      if ($locationId <= 0) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_required']); break;
      }

      $code = trim((string)from_any([$in],'plan_code',''));
      if ($code === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/', $code)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'invalid_plan_code']); break;
      }
      if (plan_reserved($code)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'reserved_plan_code']); break;
      }

      $planAttrs = [
        'Nister-Plan-Name',
        'Nister-Price-Cents',
        'Nister-Duration-Days',
        'Nister-Quota-Bytes',
        'Mikrotik-Total-Limit',
        'Mikrotik-Total-Limit-Gigawords',
        'Mikrotik-Rate-Limit',
        'Mikrotik-Address-List',
        'Nister-Active',
      ];

      try {
        location_delete_plan($locationId, $code);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_delete_failed','detail'=>$e->getMessage()]);
        break;
      }

      if (location_is_default_id($locationId)) {
        try {
          $r = rdb_pdo();
          $started = false;
          if (!$r->inTransaction()) { $r->beginTransaction(); $started = true; }
          $ph = implode(",", array_fill(0, count($planAttrs), "?"));
          foreach (['radgroupreply','radgroupcheck'] as $tbl) {
            $st = $r->prepare("DELETE FROM {$tbl} WHERE groupname=? AND attribute IN ($ph)");
            $st->execute(array_merge([$code], $planAttrs));
          }
          if ($started && $r->inTransaction()) $r->commit();
        } catch (Throwable $e) {
          if (isset($r) && $r instanceof PDO && $r->inTransaction()) $r->rollBack();
          error_log('[admin/api plan_delete global_sync] location='.$locationId.' code='.$code.' error='.$e->getMessage());
        }
      }

      echo json_encode(['ok'=>true,'location_id'=>$locationId]);
      break;
    }

    case 'user_lookup': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }

      $out = ['ok'=>true,'msisdn'=>$msisdn];
      try {
        $prof = location_profile_get($msisdn);
        if ($prof) {
          $out['location_id'] = (int)($prof['location_id'] ?? 0);
          $out['location_code'] = (string)($prof['code'] ?? $prof['last_location_code'] ?? '');
          $out['location_name'] = (string)($prof['name'] ?? '');
        }
      } catch (Throwable $e) { /* non-fatal */ }
      try {
        $out['balance_cents'] = wallet_balance($msisdn);
      } catch (Throwable $e) {
        $out['balance_cents'] = null;
        $out['wallet_error'] = $e->getMessage();
      }

      try {
        $out['status'] = radius_user_status($msisdn);
      } catch (Throwable $e) {
        $out['status'] = null;
      }

      // Canonical admin truth for usage/expiry/quota (aligns with user_state_list/enforcer model).
      try {
        $stateRow = radius_user_state_exact($msisdn);
        if (is_array($stateRow)) {
          $out['user_state'] = $stateRow;
          $status = is_array($out['status']) ? $out['status'] : [];
          if (!empty($stateRow['expires'])) $status['expires_at'] = (string)$stateRow['expires'];
          if (array_key_exists('quota_bytes', $stateRow)) $status['quota_bytes'] = $stateRow['quota_bytes'];
          if (array_key_exists('used_bytes', $stateRow)) $status['used_bytes'] = (int)($stateRow['used_bytes'] ?? 0);
          $status['expired'] = !empty($stateRow['expired_flag']);
          $status['exhausted'] = !empty($stateRow['exhausted_flag']);
          if (!empty($stateRow['groupname'])) $status['group'] = (string)$stateRow['groupname'];

          $g = strtoupper((string)($status['group'] ?? ''));
          if (in_array($g, ['HS_LIMITED','HS_NOPAID'], true)) {
            $status['policy_limited'] = true;
          }
          $policyLimited = !empty($status['policy_limited']);
          $paid = array_key_exists('paid', $status)
            ? (bool)$status['paid']
            : (!empty($status['group']) || !empty($status['expires_at']) || (($status['quota_bytes'] ?? null) !== null));
          $status['paid'] = $paid;
          $status['can_browse'] = $paid && !$status['expired'] && !$status['exhausted'] && !$policyLimited;
          $out['status'] = $status;
        }
      } catch (Throwable $e) {
        // keep legacy status result
      }

      try {
        $out['active_plan'] = radius_get_active_plan($msisdn);
      } catch (Throwable $e) {
        $out['active_plan'] = null;
      }
      if (isset($out['user_state']) && is_array($out['user_state'])) {
        $rowRate = trim((string)($out['user_state']['rate_limit'] ?? ''));
        if ($rowRate !== '') {
          if (!is_array($out['active_plan'])) $out['active_plan'] = [];
          if (empty($out['active_plan']['rate_limit'])) {
            $out['active_plan']['rate_limit'] = $rowRate;
          }
        }
      }

      try {
        if (table_exists($PDO, 'purchases')) {
          $st = $PDO->prepare("SELECT id, plan_code, price_cents, status, created_at, activated_at, expires_at
                               FROM purchases WHERE msisdn=:m ORDER BY id DESC LIMIT 1");
          $st->execute([':m'=>$msisdn]);
          $out['last_purchase'] = $st->fetch() ?: null;
        }
      } catch (Throwable $e) {
        $out['last_purchase'] = null;
      }

      try {
        if (table_exists($PDO, 'ledger')) {
          $st = $PDO->prepare("SELECT type, amount_cents, ref, notes, created_at
                               FROM ledger WHERE msisdn=:m ORDER BY id DESC LIMIT 10");
          $st->execute([':m'=>$msisdn]);
          $out['ledger'] = $st->fetchAll();
        }
      } catch (Throwable $e) {
        $out['ledger'] = [];
      }

      try {
        alerts_bootstrap($PDO);
        $vars = nister_username_variants($msisdn);
        $ph = implode(",", array_fill(0, count($vars), "?"));
        $st = $PDO->prepare("SELECT id, ts, msg, created_at
                             FROM admin_alerts
                             WHERE type='coa_fail' AND username IN ($ph)
                             ORDER BY id DESC LIMIT 1");
        $st->execute($vars);
        $out['last_coa_fail'] = $st->fetch() ?: null;
      } catch (Throwable $e) {
        $out['last_coa_fail'] = null;
      }

      echo json_encode($out);
      break;
    }

    case 'user_assign_location': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }

      $locRaw = (int)from_any([$in], 'location_id', 0);
      if ($locRaw <= 0) {
        $scope = admin_location_scope($in, false);
        if (!($scope['ok'] ?? false)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'location_required')]);
          break;
        }
        $locRaw = (int)($scope['location_id'] ?? 0);
      }
      if ($locRaw <= 0) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'location_required']);
        break;
      }

      $loc = location_find_by_id($locRaw);
      if (!$loc) {
        http_response_code(404);
        echo json_encode(['ok'=>false,'error'=>'location_not_found']);
        break;
      }

      try {
        location_profile_set($msisdn, $locRaw, (string)($loc['code'] ?? ''));
        echo json_encode([
          'ok'=>true,
          'msisdn'=>$msisdn,
          'location_id'=>$locRaw,
          'location_code'=>(string)($loc['code'] ?? ''),
          'location_name'=>(string)($loc['name'] ?? ''),
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'assign_location_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_password': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $pass = trim((string)from_any([$in],'password',''));
      if ($msisdn === '' || $pass === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and password required']); break; }
      if (strlen($pass) < 8) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'password_too_short','min_length'=>8]); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        $ph = implode(",", array_fill(0, count($targets), "?"));
        $st = $r->prepare("SELECT COUNT(*) FROM radcheck WHERE username IN ($ph) AND attribute='Cleartext-Password'");
        $st->execute($targets);
        $cnt = (int)$st->fetchColumn();
        if ($cnt <= 0) {
          http_response_code(404);
          echo json_encode(['ok'=>false,'error'=>'user_not_found']); break;
        }
        $upsert = $r->prepare(
          "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), op=':='"
        );
        foreach ($targets as $u) {
          $upsert->execute([$u, $pass]);
        }
        try {
          $tpl = trim((string)(sms_setting('SMS_PASSWORD_RESET_TEXT', '') ?? ''));
          if ($tpl !== '') {
            $msg = sms_template($tpl, [
              'NAME' => '',
              'MSISDN' => sms_normalize_local($msisdn),
            ]);
            sms_send($msisdn, $msg);
          }
        } catch (Throwable $e) { /* ignore */ }
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        error_log('[admin/api user_set_password] msisdn=' . $msisdn . ' err=' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'password_update_failed']);
      }
      break;
    }

    case 'user_reset_login': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $pass = trim((string)from_any([$in],'password',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      if ($pass === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'password_required']); break; }
      if (strlen($pass) < 8) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'password_too_short','min_length'=>8]); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }

      try {
        $r = rdb_pdo();
        $targets = array_values(array_unique(array_filter(nister_username_variants($msisdn))));
        if (!$targets) $targets = [$msisdn];
        $ph = implode(",", array_fill(0, count($targets), "?"));

        // Detect existing account footprint (not only Cleartext-Password).
        $exists = 0;
        foreach (['radcheck','radreply','radusergroup'] as $tbl) {
          if (!table_exists($r, $tbl)) continue;
          $st = $r->prepare("SELECT COUNT(*) FROM {$tbl} WHERE username IN ($ph)");
          $st->execute($targets);
          $exists += (int)$st->fetchColumn();
        }
        if ($exists <= 0) {
          http_response_code(404);
          echo json_encode(['ok'=>false,'error'=>'user_not_found']);
          break;
        }

        $started = false;
        if (!$r->inTransaction()) { $r->beginTransaction(); $started = true; }
        try {
          $passAttrs = [
            'Cleartext-Password','Password','Crypt-Password',
            'MD5-Password','SHA-Password','SSHA-Password','SMD5-Password',
            'NT-Password','LM-Password'
          ];
          $ph2 = implode(",", array_fill(0, count($passAttrs), "?"));
          $del = $r->prepare("DELETE FROM radcheck WHERE username IN ($ph) AND attribute IN ($ph2)");
          $del->execute(array_merge($targets, $passAttrs));

          $upsert = $r->prepare(
            "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), op=':='"
          );
          foreach ($targets as $u) {
            $upsert->execute([$u, $pass]);
          }

          // If one variant already has an HS_* group, mirror it to the others.
          $grp = null;
          if (table_exists($r, 'radusergroup')) {
            $st = $r->prepare("SELECT groupname FROM radusergroup WHERE username IN ($ph) AND groupname LIKE 'HS\\_%' ORDER BY priority ASC LIMIT 1");
            $st->execute($targets);
            $grp = (string)($st->fetchColumn() ?: '');
            if ($grp !== '') {
              $ins = $r->prepare(
                "INSERT INTO radusergroup (username, groupname, priority)
                 SELECT :u, :g, 0 FROM DUAL
                 WHERE NOT EXISTS (
                   SELECT 1 FROM radusergroup WHERE username=:u AND groupname=:g
                 )"
              );
              foreach ($targets as $u) {
                $ins->execute([':u'=>$u, ':g'=>$grp]);
              }
            }
          }

          if ($started && $r->inTransaction()) $r->commit();
        } catch (Throwable $e) {
          if ($started && $r->inTransaction()) $r->rollBack();
          throw $e;
        }

        try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }

        echo json_encode([
          'ok'=>true,
          'msisdn'=>$msisdn,
          'targets'=>$targets,
        ]);
      } catch (Throwable $e) {
        error_log('[admin/api user_reset_login] msisdn=' . $msisdn . ' err=' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'user_reset_login_failed']);
      }
      break;
    }

    case 'user_delete': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $targets = array_values(array_unique(array_filter(nister_username_variants($msisdn))));
        if (!$targets) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'invalid_msisdn']);
          break;
        }

        // Best-effort disconnect before removing auth records.
        try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }

        $r = rdb_pdo();
        $ph = implode(",", array_fill(0, count($targets), "?"));
        $deleted = [];

        foreach (['radcheck','radreply','radusergroup','radpostauth'] as $tbl) {
          if (!table_exists($r, $tbl)) continue;
          $st = $r->prepare("DELETE FROM {$tbl} WHERE username IN ($ph)");
          $st->execute($targets);
          $deleted[$tbl] = (int)$st->rowCount();
        }

        // Remove open accounting sessions only; keep closed session history for audit.
        if (table_exists($r, 'radacct')) {
          $st = $r->prepare("DELETE FROM radacct WHERE username IN ($ph) AND acctstoptime IS NULL");
          $st->execute($targets);
          $deleted['radacct_open'] = (int)$st->rowCount();
        }

        $portalDeleted = [];
        try {
          $ids = array_values(array_unique(array_filter([$msisdn, msisdn_local($msisdn)])));
          if ($ids) {
            $ph2 = implode(",", array_fill(0, count($ids), "?"));
            if (table_exists($PDO, 'signup_otp_challenges')) {
              $st = $PDO->prepare("DELETE FROM signup_otp_challenges WHERE msisdn IN ($ph2)");
              $st->execute($ids);
              $portalDeleted['signup_otp_challenges'] = (int)$st->rowCount();
            }
            if (table_exists($PDO, 'signup_otp_sessions')) {
              $st = $PDO->prepare("DELETE FROM signup_otp_sessions WHERE msisdn IN ($ph2)");
              $st->execute($ids);
              $portalDeleted['signup_otp_sessions'] = (int)$st->rowCount();
            }
          }
        } catch (Throwable $e) {
          // Do not fail account deletion if OTP cleanup fails.
        }

        echo json_encode([
          'ok'=>true,
          'targets'=>$targets,
          'deleted'=>$deleted,
          'portal_deleted'=>$portalDeleted,
        ]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'user_delete_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_purge': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $confirm = strtoupper(trim((string)from_any([$in], 'confirm', from_any([$in], 'confirm_text', ''))));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      if ($confirm !== 'PURGE') {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'confirm_required','detail'=>'Set confirm=PURGE to proceed']);
        break;
      }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $targets = array_values(array_unique(array_filter(nister_username_variants($msisdn))));
        $ids = array_values(array_unique(array_filter([$msisdn, msisdn_local($msisdn)])));
        if (!$targets) $targets = [$msisdn];
        if (!$ids) $ids = [$msisdn];

        // Best-effort disconnect before deleting everything.
        try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }

        $r = rdb_pdo();
        $startedR = false;
        $startedP = false;
        if (!$r->inTransaction()) { $r->beginTransaction(); $startedR = true; }
        if (!$PDO->inTransaction()) { $PDO->beginTransaction(); $startedP = true; }

        $deleted = [
          'radius' => [],
          'portal' => [],
        ];

        // Radius/full auth purge.
        $phU = implode(",", array_fill(0, count($targets), "?"));
        foreach (['radcheck','radreply','radusergroup','radpostauth','radacct','radippool'] as $tbl) {
          if (!table_exists($r, $tbl)) continue;
          $st = $r->prepare("DELETE FROM {$tbl} WHERE username IN ($phU)");
          $st->execute($targets);
          $deleted['radius'][$tbl] = (int)$st->rowCount();
        }

        // Pay portal purge (wallet, purchases, referrals, otp, payments, automation, alerts).
        $phM = implode(",", array_fill(0, count($ids), "?"));

        if (table_exists($PDO, 'referral_rewards')) {
          $st = $PDO->prepare("DELETE FROM referral_rewards WHERE referrer_msisdn IN ($phM) OR referred_msisdn IN ($phM)");
          $st->execute(array_merge($ids, $ids));
          $deleted['portal']['referral_rewards'] = (int)$st->rowCount();
        }
        if (table_exists($PDO, 'referral_links')) {
          $st = $PDO->prepare("DELETE FROM referral_links WHERE referrer_msisdn IN ($phM) OR referred_msisdn IN ($phM)");
          $st->execute(array_merge($ids, $ids));
          $deleted['portal']['referral_links'] = (int)$st->rowCount();
        }
        if (table_exists($PDO, 'referral_profiles')) {
          $st = $PDO->prepare("DELETE FROM referral_profiles WHERE msisdn IN ($phM)");
          $st->execute($ids);
          $deleted['portal']['referral_profiles'] = (int)$st->rowCount();
        }

        foreach ([
          'signup_otp_sessions',
          'signup_otp_challenges',
          'auto_renew_settings',
          'payments',
          'purchases',
          'ledger',
          'accounts',
        ] as $tbl) {
          if (!table_exists($PDO, $tbl)) continue;
          $st = $PDO->prepare("DELETE FROM {$tbl} WHERE msisdn IN ($phM)");
          $st->execute($ids);
          $deleted['portal'][$tbl] = (int)$st->rowCount();
        }

        $alertKeys = array_values(array_unique(array_filter(array_merge($targets, $ids))));
        if ($alertKeys && table_exists($PDO, 'admin_alerts')) {
          $phA = implode(",", array_fill(0, count($alertKeys), "?"));
          $st = $PDO->prepare("DELETE FROM admin_alerts WHERE username IN ($phA)");
          $st->execute($alertKeys);
          $deleted['portal']['admin_alerts'] = (int)$st->rowCount();
        }

        if ($startedR && $r->inTransaction()) $r->commit();
        if ($startedP && $PDO->inTransaction()) $PDO->commit();

        echo json_encode([
          'ok'=>true,
          'msisdn'=>$msisdn,
          'targets'=>$targets,
          'portal_ids'=>$ids,
          'deleted'=>$deleted,
        ]);
      } catch (Throwable $e) {
        try { if (isset($r) && $r instanceof PDO && $r->inTransaction()) $r->rollBack(); } catch (Throwable $x) {}
        try { if ($PDO->inTransaction()) $PDO->rollBack(); } catch (Throwable $x) {}
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'user_purge_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_force_expire': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        $expStr = (new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get())))->format('d M Y H:i:s');
        $ph = implode(",", array_fill(0, count($targets), "?"));
        foreach ($targets as $u) {
          radius_set_check($r, $u, 'Expiration', ':=', $expStr);
        }
        $r->prepare("DELETE FROM radusergroup WHERE username IN ($ph) AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid')")
          ->execute($targets);
        $vals = implode(",", array_fill(0, count($targets), "(?,'HS_LIMITED',0)"));
        $r->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES {$vals}")
          ->execute($targets);
        try { radius_clear_hotspot_cookies($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        echo json_encode(['ok'=>true,'expires_at'=>$expStr]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'force_expire_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_force_exhaust': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        foreach ($targets as $u) {
          radius_set_reply($r, $u, 'Nister-Quota-Bytes', ':=', '0');
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit', ':=', '0');
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit-Gigawords', ':=', '0');
          radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', 'HS_LIMITED');
        }
        $ph = implode(",", array_fill(0, count($targets), "?"));
        $r->prepare("DELETE FROM radusergroup WHERE username IN ($ph) AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid')")
          ->execute($targets);
        $vals = implode(",", array_fill(0, count($targets), "(?,'HS_LIMITED',0)"));
        $r->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES {$vals}")
          ->execute($targets);
        try { radius_clear_hotspot_cookies($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'force_exhaust_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_force_kick_ip': {
      $ip = trim((string)from_any([$in],'ip',''));
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($ip === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'ip required']); break; }
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $scopeLocationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;
      if ($scopeLocationId !== null && $scopeLocationId > 0) {
        if ($msisdn === '') {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'msisdn_required_for_scoped_kick','detail'=>'Provide msisdn when a site scope is selected.']);
          break;
        }
        $scopeCheck = admin_user_scope_check($in, $msisdn);
        if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      }
      try {
        $res = radius_force_kick_ip($ip, $msisdn !== '' ? $msisdn : null, $ENV);
        if (!empty($res['ok'])) {
          echo json_encode(['ok'=>true,'nas'=>$res['nas'] ?? null,'user'=>$res['user'] ?? null]);
        } else {
          http_response_code(500);
          echo json_encode([
            'ok'=>false,
            'error'=>'kick_ip_failed',
            'detail'=>$res['error'] ?? 'unknown',
            'out'=>$res['out'] ?? null,
            'nas'=>$res['nas'] ?? null,
            'user'=>$res['user'] ?? null,
          ]);
        }
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'kick_ip_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_expiry': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $raw = trim((string)from_any([$in],'expires_at',''));
      $days = (int)from_any([$in],'days',0);
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $tz = new DateTimeZone(date_default_timezone_get());
        if ($raw === '' && $days > 0) {
          $dt = (new DateTimeImmutable('now', $tz))->modify("+{$days} days")->setTime(23,59,59);
        } else {
          $dt = new DateTimeImmutable($raw, $tz);
        }
        $expStr = $dt->format('d M Y H:i:s');
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          radius_set_check($r, $u, 'Expiration', ':=', $expStr);
        }
        echo json_encode(['ok'=>true,'expires_at'=>$expStr]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'expiry_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_add_quota': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      $delta = bytes_from_input($in);
      if ($delta === null || $delta <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'quota bytes required']); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        $group = radius_pick_plan_group($r, $targets);
        $cur = nister_current_total_quota($r, $targets, $group) ?? 0;
        $new = (int)max(0, $cur + $delta);
        $hi = (int)floor($new / 4294967296);
        $lo = (int)($new % 4294967296);
        foreach ($targets as $u) {
          radius_set_reply($r, $u, 'Nister-Quota-Bytes', ':=', (string)$new);
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit-Gigawords', ':=', (string)$hi);
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit', ':=', (string)$lo);
        }
        echo json_encode(['ok'=>true,'quota_bytes'=>$new]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'quota_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_quota': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      $val = bytes_from_input($in);
      if ($val === null || $val <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'quota bytes required']); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        $hi = (int)floor($val / 4294967296);
        $lo = (int)($val % 4294967296);
        foreach ($targets as $u) {
          radius_set_reply($r, $u, 'Nister-Quota-Bytes', ':=', (string)$val);
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit-Gigawords', ':=', (string)$hi);
          radius_set_reply($r, $u, 'Mikrotik-Total-Limit', ':=', (string)$lo);
        }
        echo json_encode(['ok'=>true,'quota_bytes'=>$val]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'quota_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_clear_quota': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        $targets = nister_username_variants($msisdn);
        $ph = implode(",", array_fill(0, count($targets), "?"));
        $st = $r->prepare("DELETE FROM radreply WHERE username IN ($ph)
                            AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')");
        $st->execute($targets);
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'quota_clear_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_addrlist': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $addr = trim((string)from_any([$in],'addrlist',''));
      if ($msisdn === '' || $addr === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and addrlist required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      $addrUp = strtoupper($addr);
      try {
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', $addr);
          if ($addrUp === 'HS_ACTIVE') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_LIMITED','HS_NOPAID','nopaid')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_ACTIVE', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_ACTIVE'
                         )")->execute([':u'=>$u]);
          } elseif ($addrUp === 'HS_LIMITED') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_NOPAID','nopaid')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_LIMITED', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_LIMITED'
                         )")->execute([':u'=>$u]);
          } elseif ($addrUp === 'HS_NOPAID') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED','nopaid')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_NOPAID', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_NOPAID'
                        )")->execute([':u'=>$u]);
          }
        }
        if (in_array($addrUp, ['HS_LIMITED','HS_NOPAID'], true)) {
          try { radius_clear_hotspot_cookies($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        }
        echo json_encode(['ok'=>true,'addrlist'=>$addr]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'addrlist_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_rate': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $rate = trim((string)from_any([$in],'rate_limit',''));
      if ($msisdn === '' || $rate === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and rate_limit required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          radius_set_reply($r, $u, 'Mikrotik-Rate-Limit', ':=', $rate);
        }
        echo json_encode(['ok'=>true,'rate_limit'=>$rate]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'rate_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_set_group': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $group = trim((string)from_any([$in],'group',''));
      if ($msisdn === '' || $group === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and group required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        $g = strtoupper($group);
        if (!in_array($g, ['HS_ACTIVE','HS_LIMITED','HS_NOPAID'], true)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'group_invalid','detail'=>'Only HS_ACTIVE, HS_LIMITED, HS_NOPAID allowed']);
          break;
        }
        foreach (nister_username_variants($msisdn) as $u) {
          $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid')")->execute([':u'=>$u]);
          $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                       SELECT :u, :g, 0 FROM DUAL
                       WHERE NOT EXISTS (
                         SELECT 1 FROM radusergroup WHERE username=:u AND groupname=:g
                       )")->execute([':u'=>$u, ':g'=>$g]);
        }
        if (in_array($g, ['HS_LIMITED','HS_NOPAID'], true)) {
          try { radius_clear_hotspot_cookies($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        }
        echo json_encode(['ok'=>true,'group'=>$g]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'group_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'user_reset_nopaid': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid')")->execute([':u'=>$u]);
          $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                       SELECT :u, 'HS_NOPAID', 0 FROM DUAL
                       WHERE NOT EXISTS (
                         SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_NOPAID'
                       )")->execute([':u'=>$u]);
          radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', 'HS_NOPAID');
          $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Mikrotik-Rate-Limit','Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')")->execute([':u'=>$u]);
        }
        try { radius_clear_hotspot_cookies($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'reset_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'sms_send': {
      $message = trim((string)from_any([$in], 'message', ''));
      $audience = trim((string)from_any([$in], 'audience', 'list'));
      $group = trim((string)from_any([$in], 'group', ''));
      $sender = trim((string)from_any([$in], 'sender', ''));
      $recipientsRaw = $in['recipients'] ?? $in['recipient'] ?? '';

      if ($message === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'message required']); break; }
      $smsScope = admin_location_scope($in, true);
      if (!($smsScope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($smsScope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($smsScope['location_id']) && $smsScope['location_id'] !== null ? (int)$smsScope['location_id'] : null;

      $apiKey = settings_get('MNOTIFY_API_KEY', '') ?? '';
      $base = settings_get('MNOTIFY_BASE', '') ?? '';
      $senderDefault = settings_get('MNOTIFY_SENDER', '') ?? '';
      if ($sender === '') $sender = $senderDefault;
      if ($base === '') $base = 'https://api.pilosms.com/v1';
      $base = rtrim($base, '/');
      $provider = admin_sms_provider_from_base($base);
      if ($provider === 'pilosms') $base = preg_replace('~/send-message$~i', '', $base) ?? $base;
      if ($provider !== 'pilosms') $base = preg_replace('~/sms/quick$~i', '', $base) ?? $base;

      if ($apiKey === '' || $sender === '') {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'sms_settings_missing','detail'=>'SMS API key and Sender ID are required']);
        break;
      }

      $recipients = [];
      try {
        $r = rdb_pdo();
        if ($audience === 'all') {
          $recipients = sms_fetch_all_users($r);
        } elseif ($audience === 'group') {
          if ($group === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'group required']); break; }
          $recipients = sms_fetch_group_users($r, $group);
        } else {
          $recipients = sms_parse_recipient_list($recipientsRaw);
        }
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'recipients_failed','detail'=>$e->getMessage()]);
        break;
      }

      if (!$recipients) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'no_recipients']);
        break;
      }

      $url = ($provider === 'pilosms')
        ? ($base . '/send-message?apikey=' . rawurlencode($apiKey))
        : ($base . '/sms/quick?key=' . rawurlencode($apiKey));
      $chunkSize = 100;
      $sent = 0;
      $skipped = 0;
      $scopeSkipped = 0;
      $lastGateway = null;
      $skipped = count(array_values($recipients)) - count(array_unique($recipients));
      $recipients = array_values(array_unique($recipients));
      if ($locationId !== null && $locationId > 0) {
        $allowed = array_flip(location_filter_msisdns($recipients, $locationId));
        $filtered = [];
        foreach ($recipients as $rcpt) {
          $canon = normalize_msisdn((string)$rcpt);
          if ($canon !== '' && isset($allowed[$canon])) {
            $local = sms_recipient_normalize((string)$rcpt);
            if ($local !== '') $filtered[] = $local;
          } else {
            $scopeSkipped++;
          }
        }
        $recipients = array_values(array_unique($filtered));
      }
      if (!$recipients) {
        http_response_code(404);
        echo json_encode(['ok'=>false,'error'=>'no_recipients_in_scope','location_id'=>$locationId,'out_of_scope'=>$scopeSkipped]);
        break;
      }

      foreach (array_chunk(array_values($recipients), $chunkSize) as $idx => $chunk) {
        if ($provider === 'pilosms') {
          $targetChunk = [];
          foreach ($chunk as $rcpt) {
            $e164 = sms_recipient_e164((string)$rcpt);
            if ($e164 !== '') $targetChunk[] = $e164;
          }
          $targetChunk = array_values(array_unique($targetChunk));
          $skipped += max(0, count($chunk) - count($targetChunk));
          if (!$targetChunk) continue;
          $payload = [
            'sender' => $sender,
            'message' => $message,
            'receipients' => implode(',', $targetChunk),
          ];
        } else {
          $targetChunk = $chunk;
          $payload = [
            'recipient' => $targetChunk,
            'sender' => $sender,
            'message' => $message,
            'is_schedule' => false,
            'schedule_date' => '',
          ];
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        if ($provider === 'pilosms') {
          curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
          curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($payload));
        } else {
          curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
          curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        }
        $resp = curl_exec($ch);
        $err = curl_error($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($resp === false) {
          http_response_code(500);
          echo json_encode(['ok'=>false,'error'=>'sms_http_failed','detail'=>$err,'batch'=>$idx+1]);
          break 2;
        }

        $j = json_decode((string)$resp, true);
        if ($provider === 'pilosms') {
          $status = is_array($j) ? (int)($j['status'] ?? 0) : 0;
          if ($code < 200 || $code >= 300 || $status !== 1001) {
            $detail = '';
            if (is_array($j)) {
              if (!empty($j['detail'])) $detail = (string)$j['detail'];
              elseif (!empty($j['message'])) $detail = (string)$j['message'];
              elseif (!empty($j['error'])) $detail = (string)$j['error'];
            }
            if ($detail === '') $detail = 'PiloSMS send failed';
            http_response_code(502);
            echo json_encode([
              'ok'=>false,
              'error'=>'sms_gateway_error',
              'detail'=>$detail,
              'status_code'=>$code,
              'response'=>$j ?: $resp,
              'batch'=>$idx+1
            ]);
            break 2;
          }
        } elseif ($code < 200 || $code >= 300) {
          $detail = '';
          if (is_array($j)) {
            if (!empty($j['message'])) $detail = (string)$j['message'];
            elseif (!empty($j['error'])) $detail = (string)$j['error'];
          }
          http_response_code(502);
          echo json_encode([
            'ok'=>false,
            'error'=>'sms_gateway_error',
            'detail'=>$detail,
            'status_code'=>$code,
            'response'=>$j ?: $resp,
            'batch'=>$idx+1
          ]);
          break 2;
        }

        $lastGateway = $j;
        $sent += count($targetChunk);
        if (count($chunk) === $chunkSize) {
          usleep(200000);
        }
      }

      echo json_encode([
        'ok'=>true,
        'provider'=>$provider,
        'gateway'=>$lastGateway,
        'location_id'=>$locationId,
        'recipients'=>$sent,
        'skipped'=>$skipped,
        'out_of_scope'=>$scopeSkipped,
      ]);
      break;
    }

    case 'credit_wallet': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $amount = parse_amount_cents($in);
      $notes = trim((string)($in['notes'] ?? 'Admin credit'));
      if ($msisdn === '' || $amount <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and amount required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }

      $ref = 'ADM-' . date('YmdHis') . '-' . bin2hex(random_bytes(3));
      try {
        wallet_credit($msisdn, $amount, $ref, $notes);
        $bal = null;
        try { $bal = wallet_balance($msisdn); } catch (Throwable $e) { $bal = null; }
        try {
          $tpl = trim((string)(sms_setting('SMS_TOPUP_CONFIRM_TEXT', '') ?? ''));
          if ($tpl !== '') {
            $msg = sms_template($tpl, [
              'NAME' => '',
              'MSISDN' => sms_normalize_local($msisdn),
              'AMOUNT_GHS' => number_format($amount / 100, 2),
              'BALANCE_GHS' => $bal !== null ? number_format($bal / 100, 2) : '',
              'REF' => $ref,
            ]);
            sms_send($msisdn, $msg);
          }
        } catch (Throwable $e) { /* ignore */ }
        echo json_encode(['ok'=>true,'ref'=>$ref,'balance_cents'=>$bal]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'credit_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'debit_wallet': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $amount = parse_amount_cents($in);
      $notes = trim((string)($in['notes'] ?? 'Admin debit'));
      if ($msisdn === '' || $amount <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and amount required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }

      $ref = 'ADM-DB-' . date('YmdHis') . '-' . bin2hex(random_bytes(3));
      try {
        $ok = wallet_try_debit_typed($msisdn, $amount, $ref, $notes, 'admin_debit');
        if (!$ok) {
          http_response_code(409);
          echo json_encode(['ok'=>false,'error'=>'insufficient_funds']);
          break;
        }
        $bal = null;
        try { $bal = wallet_balance($msisdn); } catch (Throwable $e) { $bal = null; }
        echo json_encode(['ok'=>true,'ref'=>$ref,'balance_cents'=>$bal]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'debit_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'promo_run': {
      $locScope = admin_location_scope($in, true);
      if (!($locScope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($locScope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($locScope['location_id']) && $locScope['location_id'] !== null ? (int)$locScope['location_id'] : null;

      $kind = strtolower(trim((string)from_any([$in], 'kind', from_any([$in], 'promo_type', ''))));
      if (!in_array($kind, ['wallet','data'], true)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'invalid_kind','detail'=>'Use wallet or data']);
        break;
      }

      $scope = strtolower(trim((string)from_any([$in], 'scope', 'all')));
      if (!in_array($scope, ['all','group','recent'], true)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'invalid_scope','detail'=>'Use all, group, or recent']);
        break;
      }

      $r = rdb_pdo();
      $targets = promo_collect_targets($PDO, $r, $in, $locationId);
      if (!$targets) {
        http_response_code(404);
        echo json_encode(['ok'=>false,'error'=>'no_targets']);
        break;
      }

      $tz = new DateTimeZone(date_default_timezone_get());
      $exp = promo_parse_expiry($in, $tz);
      if (!$exp) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'expiry_required','detail'=>'Provide expires_at or days']);
        break;
      }
      $expUtc = $exp->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
      $notes = trim((string)from_any([$in], 'notes', 'Admin promo'));
      $createdBy = (string)($_SESSION['admin_user'] ?? 'admin');
      $baseRef = 'PROMO-' . date('YmdHis') . '-' . bin2hex(random_bytes(3));

      $created = 0;
      $failed = 0;
      $errors = [];

      if ($kind === 'wallet') {
        $amount = parse_amount_cents($in);
        if ($amount <= 0) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'amount_required','detail'=>'Wallet promo needs amount > 0']);
          break;
        }
        try { promo_bootstrap_wallet_table($PDO); } catch (Throwable $e) {
          http_response_code(500);
          echo json_encode(['ok'=>false,'error'=>'promo_table_failed','detail'=>$e->getMessage()]);
          break;
        }

        $i = 0;
        foreach ($targets as $msisdn) {
          $i++;
          $ref = $baseRef . '-W-' . $i;
          try {
            wallet_credit_promo_with_expiry($msisdn, $amount, $expUtc, $ref, $notes, $locationId);
            $created++;
          } catch (Throwable $e) {
            $failed++;
            if (count($errors) < 20) $errors[] = ['msisdn'=>$msisdn, 'detail'=>$e->getMessage()];
          }
        }

        echo json_encode([
          'ok'=>true,
          'kind'=>'wallet',
          'scope'=>$scope,
          'location_id'=>$locationId,
          'amount_cents'=>$amount,
          'expires_at_utc'=>$expUtc,
          'total_targets'=>count($targets),
          'created'=>$created,
          'failed'=>$failed,
          'errors'=>$errors,
        ]);
        break;
      }

      $bytes = parse_quota_bytes($in);
      if ($bytes === null || $bytes <= 0) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'quota_required','detail'=>'Data promo needs bytes/gb/mb > 0']);
        break;
      }

      try { promo_bootstrap_data_table($r); } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'promo_table_failed','detail'=>$e->getMessage()]);
        break;
      }

      $hasDataLoc = false;
      try { $hasDataLoc = column_exists($r, 'nister_data_promos', 'location_id'); } catch (Throwable $e) { $hasDataLoc = false; }
      if ($hasDataLoc) {
        $ins = $r->prepare("INSERT INTO nister_data_promos
                            (username, location_id, grant_bytes, expires_at, promo_ref, notes, created_by)
                            VALUES (:u,:l,:b,:e,:r,:n,:by)");
      } else {
        $ins = $r->prepare("INSERT INTO nister_data_promos
                            (username, grant_bytes, expires_at, promo_ref, notes, created_by)
                            VALUES (:u,:b,:e,:r,:n,:by)");
      }
      $i = 0;
      foreach ($targets as $msisdn) {
        $i++;
        $ref = $baseRef . '-D-' . $i;
        try {
          $bind = [
            ':u' => $msisdn,
            ':b' => $bytes,
            ':e' => $expUtc,
            ':r' => $ref,
            ':n' => $notes,
            ':by' => $createdBy,
          ];
          if ($hasDataLoc) $bind[':l'] = $locationId;
          $ins->execute($bind);
          $created++;
        } catch (Throwable $e) {
          $failed++;
          if (count($errors) < 20) $errors[] = ['msisdn'=>$msisdn, 'detail'=>$e->getMessage()];
        }
      }

      echo json_encode([
        'ok'=>true,
        'kind'=>'data',
        'scope'=>$scope,
        'location_id'=>$locationId,
        'quota_bytes'=>$bytes,
        'expires_at_utc'=>$expUtc,
        'total_targets'=>count($targets),
        'created'=>$created,
        'failed'=>$failed,
        'errors'=>$errors,
      ]);
      break;
    }

    case 'apply_plan': {
      $scope = admin_location_scope($in, true);
      if (!($scope['ok'] ?? false)) {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>(string)($scope['error'] ?? 'invalid_location_scope')]);
        break;
      }
      $locationId = isset($scope['location_id']) && $scope['location_id'] !== null ? (int)$scope['location_id'] : null;

      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $code = (string)from_any([$in],'plan_code','');
      if ($msisdn === '' || $code === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and plan_code required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }

      $effectiveLocationId = $locationId;
      if ($effectiveLocationId === null || $effectiveLocationId <= 0) {
        try {
          $prof = location_profile_get($msisdn);
          if ($prof && !empty($prof['location_id'])) {
            $effectiveLocationId = (int)$prof['location_id'];
          }
        } catch (Throwable $e) { /* non-fatal */ }
      }
      $strictLocationPlan = ($effectiveLocationId !== null && $effectiveLocationId > 0);
      $plan = radius_find_plan($code, $effectiveLocationId, $strictLocationPlan);
      if (!$plan) { http_response_code(404); echo json_encode(['ok'=>false,'error'=>'unknown_plan']); break; }

      $price = parse_amount_cents($in);
      if ($price <= 0 && isset($plan['price_cents'])) $price = (int)$plan['price_cents'];

      $days = (int)($plan['duration_days'] ?? 30);
      if ($days <= 0) $days = 30;
      $tz = new DateTimeZone(date_default_timezone_get());
      $purchaseAt = new DateTimeImmutable('now', $tz);

      $applyPlan = [
        'code'         => $plan['code'],
        'address_list' => $plan['address_list'] ?? 'HS_ACTIVE',
        'rate_limit'   => $plan['rate_limit'] ?? null,
        'quota_bytes'  => $plan['quota_bytes'] ?? null,
        'duration_days'=> $days
      ];

      try {
        radius_apply_plan($msisdn, $applyPlan, $purchaseAt);
        if (function_exists('radius_try_disconnect')) {
          try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : [], $effectiveLocationId); } catch (Throwable $e) { /* ignore */ }
        }
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'apply_failed','detail'=>$e->getMessage()]);
        break;
      }

      $actualExpires = $purchaseAt->modify('+'.$days.' days');
      try {
        $active = radius_get_active_plan($msisdn);
        if ($active && !empty($active['expires_at'])) {
          $parsed = nister_parse_expiry_datetime((string)$active['expires_at'], $tz);
          if ($parsed instanceof DateTimeImmutable) $actualExpires = $parsed;
        }
      } catch (Throwable $e) { /* keep computed expiry */ }

      $purchaseErr = null;
      $pid = null;
      try {
        if (table_exists($PDO, 'purchases')) {
          $cols = $PDO->query("SHOW COLUMNS FROM purchases")->fetchAll(PDO::FETCH_ASSOC) ?: [];
          $has = [];
          foreach ($cols as $c) $has[strtolower($c['Field'])] = true;
          $fields = [];
          $vals = [];
          $bind = [];
          $add = static function(string $c, $v) use (&$fields,&$vals,&$bind) {
            $fields[]="`$c`"; $vals[]=":$c"; $bind[":$c"]=$v;
          };
          if (!empty($has['msisdn'])) $add('msisdn', $msisdn);
          if (!empty($has['location_id']) && $effectiveLocationId !== null && $effectiveLocationId > 0) $add('location_id', $effectiveLocationId);
          if (!empty($has['plan_code'])) $add('plan_code', $plan['code']);
          if (!empty($has['price_cents']) && $price > 0) $add('price_cents', $price);
          if (!empty($has['status'])) $add('status', 'applied');
          if (!empty($has['activated_at'])) { $fields[]='`activated_at`'; $vals[]='NOW()'; }
          if (!empty($has['expires_at'])) $add('expires_at', $actualExpires->format('Y-m-d H:i:s'));

          if ($fields) {
            $sql = "INSERT INTO purchases (".implode(',', $fields).") VALUES (".implode(',', $vals).")";
            $st = $PDO->prepare($sql);
            foreach ($bind as $k=>$v) $st->bindValue($k,$v);
            $st->execute();
            $pid = (int)$PDO->lastInsertId();
          }
        }
      } catch (Throwable $e) {
        $purchaseErr = $e->getMessage();
      }

      $expiresStr = $actualExpires->format('Y-m-d H:i:s');
      try {
        $tpl = trim((string)(sms_setting('SMS_BACK_ONLINE_TEXT', '') ?? ''));
        if ($tpl !== '') {
          $msg = sms_template($tpl, [
            'NAME' => '',
            'MSISDN' => sms_normalize_local($msisdn),
            'PLAN' => (string)($plan['name'] ?? $plan['code'] ?? ''),
            'EXPIRES_AT' => $expiresStr,
          ]);
          sms_send($msisdn, $msg);
        }
      } catch (Throwable $e) { /* ignore */ }
      echo json_encode(['ok'=>true,'location_id'=>$effectiveLocationId,'expires_at'=>$expiresStr,'purchase_id'=>$pid,'purchase_error'=>$purchaseErr]);
      break;
    }

    case 'disconnect_user': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
      $scopeCheck = admin_user_scope_check($in, $msisdn);
      if (!($scopeCheck['ok'] ?? false)) { admin_emit_scope_error($scopeCheck); break; }
      try {
        radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []);
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'disconnect_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    default:
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>'unknown_fn']);
  }
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()]);
}
