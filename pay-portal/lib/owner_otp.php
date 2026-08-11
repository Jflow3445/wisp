<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/owner_schema.php';
require_once __DIR__ . '/property_leads.php';

function owner_otp_config_int(array $env, string $key, int $default, int $min, int $max): int {
  $ownerKey = 'OWNER_' . $key;
  if (array_key_exists($ownerKey, $env)) {
    $raw = $env[$ownerKey];
  } elseif (array_key_exists($key, $env)) {
    $raw = $env[$key];
  } else {
    $ownerEnv = getenv($ownerKey);
    $raw = ($ownerEnv !== false && $ownerEnv !== '') ? $ownerEnv : getenv($key);
  }
  if ($raw === false || $raw === null || trim((string)$raw) === '') {
    $raw = $_ENV[$ownerKey] ?? $_ENV[$key] ?? null;
  }
  $value = is_numeric($raw) ? (int)$raw : $default;
  return max($min, min($max, $value));
}

function owner_otp_client_ip(array $server = [], array $env = []): string {
  if ($server === []) {
    return nister_client_ip($env);
  }
  $remote = trim((string)($server['REMOTE_ADDR'] ?? ''));
  if (!filter_var($remote, FILTER_VALIDATE_IP)) return '';
  if (!nister_ip_in_cidrs($remote, nister_trusted_proxy_cidrs($env))) return $remote;

  $xff = (string)($server['HTTP_X_FORWARDED_FOR'] ?? '');
  if ($xff !== '') {
    foreach (explode(',', $xff) as $part) {
      $part = trim((string)$part);
      if (filter_var($part, FILTER_VALIDATE_IP)) return $part;
    }
  }
  $realIp = trim((string)($server['HTTP_X_REAL_IP'] ?? ''));
  if (filter_var($realIp, FILTER_VALIDATE_IP)) return $realIp;
  return $remote;
}

function owner_otp_server_value(array $server, array $keys, int $limit): ?string {
  foreach ($keys as $key) {
    $value = trim((string)($server[$key] ?? ''));
    if ($value !== '') return substr($value, 0, $limit);
  }
  return null;
}

function owner_otp_count_recent(PDO $pdo, string $where, array $params, int $seconds): int {
  $seconds = max(1, $seconds);
  $sql = "SELECT COUNT(*) FROM owner_otp_challenges WHERE {$where} AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL {$seconds} SECOND)";
  $st = $pdo->prepare($sql);
  $st->execute($params);
  return (int)$st->fetchColumn();
}

function owner_otp_send_sms(PDO $pdo, string $msisdn, string $otp, int $ttl): array {
  $hadGlobalPdo = array_key_exists('PDO', $GLOBALS);
  $previousPdo = $GLOBALS['PDO'] ?? null;
  if (!$hadGlobalPdo) {
    $GLOBALS['PDO'] = $pdo;
  }
  try {
    require_once __DIR__ . '/sms.php';
    $ttlMin = (string)max(1, (int)ceil($ttl / 60));
    return sms_send_templated(
      $msisdn,
      'SMS_OWNER_OTP_TEXT',
      'Your NISTER owner verification code is {OTP}. It expires in {TTL_MIN} minutes.',
      [
        'OTP' => $otp,
        'TTL_MIN' => $ttlMin,
      ]
    );
  } finally {
    if (!$hadGlobalPdo) {
      unset($GLOBALS['PDO']);
    } else {
      $GLOBALS['PDO'] = $previousPdo;
    }
  }
}

function owner_otp_create(PDO $pdo, string $rawMsisdn, int $leadId, array $env, array $server = []): array {
  owner_schema_bootstrap($pdo);
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '' || !preg_match('/^233\d{9}$/', $msisdn)) {
    return ['ok' => false, 'error' => 'invalid_msisdn'];
  }
  if ($leadId <= 0) {
    return ['ok' => false, 'error' => 'lead_required'];
  }
  $lead = property_lead_find($pdo, $leadId);
  if (!is_array($lead)) {
    return ['ok' => false, 'error' => 'lead_not_found'];
  }
  if ((string)($lead['contact_phone'] ?? '') !== $msisdn) {
    return ['ok' => false, 'error' => 'lead_phone_mismatch'];
  }

  $requestServer = $server === [] ? $_SERVER : $server;
  $ip = owner_otp_client_ip($requestServer, $env);
  if ($ip === '') $ip = 'unknown';
  $userAgent = owner_otp_server_value($requestServer, ['HTTP_USER_AGENT'], 255);

  $len = owner_otp_config_int($env, 'OTP_CODE_LENGTH', 6, 4, 8);
  $ttl = owner_otp_config_int($env, 'OTP_TTL_SECONDS', 300, 60, 3600);
  $cooldown = owner_otp_config_int($env, 'OTP_RESEND_COOLDOWN_SECONDS', 60, 10, 3600);
  $maxMsisdnHour = owner_otp_config_int($env, 'OTP_MAX_SENDS_PER_MSISDN_HOUR', 6, 1, 100);
  $maxIpHour = owner_otp_config_int($env, 'OTP_MAX_SENDS_PER_IP_HOUR', 20, 1, 500);

  $msisdnGate = nister_rate_limit_allow('owner_otp_send_msisdn', $msisdn, $maxMsisdnHour, 3600, 3600);
  $ipGate = nister_rate_limit_allow('owner_otp_send_ip', $ip, $maxIpHour, 3600, 3600);
  if (!($msisdnGate['allowed'] ?? false)) {
    return ['ok' => false, 'error' => 'rate_limited', 'retry_after' => (int)($msisdnGate['retry_after'] ?? 0)];
  }
  if (!($ipGate['allowed'] ?? false)) {
    return ['ok' => false, 'error' => 'rate_limited_ip', 'retry_after' => (int)($ipGate['retry_after'] ?? 0)];
  }

  if (owner_otp_count_recent($pdo, 'msisdn = :m', [':m' => $msisdn], $cooldown) > 0) {
    return ['ok' => false, 'error' => 'cooldown_active', 'cooldown_seconds' => $cooldown];
  }
  if (owner_otp_count_recent($pdo, 'msisdn = :m', [':m' => $msisdn], 3600) >= $maxMsisdnHour) {
    return ['ok' => false, 'error' => 'rate_limited'];
  }
  if ($ip !== 'unknown' && owner_otp_count_recent($pdo, 'ip = :ip', [':ip' => $ip], 3600) >= $maxIpHour) {
    return ['ok' => false, 'error' => 'rate_limited_ip'];
  }

  $max = (10 ** $len) - 1;
  $otp = str_pad((string)random_int(0, $max), $len, '0', STR_PAD_LEFT);
  $expiresAt = gmdate('Y-m-d H:i:s', time() + $ttl);
  $st = $pdo->prepare(
    "INSERT INTO owner_otp_challenges (msisdn, otp_hash, purpose, expires_at, ip, user_agent)
     VALUES (:m, :hash, 'register_request', :expires_at, :ip, :user_agent)"
  );
  $st->execute([
    ':m' => $msisdn,
    ':hash' => password_hash($otp, PASSWORD_DEFAULT),
    ':expires_at' => $expiresAt,
    ':ip' => $ip === 'unknown' ? null : $ip,
    ':user_agent' => $userAgent,
  ]);
  property_lead_mark_otp_pending($pdo, $leadId);
  nister_rate_limit_hit('owner_otp_send_msisdn', $msisdn, $maxMsisdnHour, 3600, 3600);
  nister_rate_limit_hit('owner_otp_send_ip', $ip, $maxIpHour, 3600, 3600);

  $sms = owner_otp_send_sms($pdo, $msisdn, $otp, $ttl);
  if (($sms['sent'] ?? false) !== true) {
    return [
      'ok' => false,
      'error' => 'sms_send_failed',
      'lead_id' => $leadId,
      'msisdn' => $msisdn,
      'expires_seconds' => $ttl,
      'cooldown_seconds' => $cooldown,
      'sms' => $sms,
    ];
  }

  return [
    'ok' => true,
    'lead_id' => $leadId,
    'msisdn' => $msisdn,
    'expires_seconds' => $ttl,
    'cooldown_seconds' => $cooldown,
    'sms' => $sms,
  ];
}

function owner_otp_verify(PDO $pdo, string $rawMsisdn, string $otp): array {
  owner_schema_bootstrap($pdo);
  $msisdn = normalize_msisdn($rawMsisdn);
  $code = trim($otp);
  if ($msisdn === '' || !preg_match('/^233\d{9}$/', $msisdn)) {
    return ['ok' => false, 'error' => 'invalid_msisdn'];
  }
  if (!preg_match('/^\d{4,8}$/', $code)) {
    return ['ok' => false, 'error' => 'otp_invalid'];
  }

  $maxAttempts = owner_otp_config_int([], 'OTP_MAX_ATTEMPTS', 3, 1, 10);
  $gate = nister_rate_limit_allow('owner_otp_verify_msisdn', $msisdn, 12, 600, 900);
  if (!($gate['allowed'] ?? false)) {
    return ['ok' => false, 'error' => 'rate_limited', 'retry_after' => (int)($gate['retry_after'] ?? 0)];
  }

  $st = $pdo->prepare(
    "SELECT id, otp_hash, expires_at, attempts
     FROM owner_otp_challenges
     WHERE msisdn = :m
       AND purpose = 'register_request'
       AND verified_at IS NULL
     ORDER BY id DESC
     LIMIT 1"
  );
  $st->execute([':m' => $msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!is_array($row)) {
    nister_rate_limit_hit('owner_otp_verify_msisdn', $msisdn, 12, 600, 900);
    return ['ok' => false, 'error' => 'otp_not_requested'];
  }

  $attempts = (int)($row['attempts'] ?? 0);
  if ($attempts >= $maxAttempts) {
    return ['ok' => false, 'error' => 'otp_locked'];
  }

  $expiresAt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$row['expires_at'], new DateTimeZone('UTC'));
  if (!($expiresAt instanceof DateTimeImmutable) || $expiresAt->getTimestamp() < time()) {
    return ['ok' => false, 'error' => 'otp_expired'];
  }

  if (!password_verify($code, (string)($row['otp_hash'] ?? ''))) {
    $newAttempts = $attempts + 1;
    $up = $pdo->prepare("UPDATE owner_otp_challenges SET attempts = attempts + 1 WHERE id = :id");
    $up->execute([':id' => (int)$row['id']]);
    nister_rate_limit_hit('owner_otp_verify_msisdn', $msisdn, 12, 600, 900);
    if ($newAttempts >= $maxAttempts) {
      return ['ok' => false, 'error' => 'otp_locked'];
    }
    return ['ok' => false, 'error' => 'otp_invalid', 'attempts_left' => max(0, $maxAttempts - $newAttempts)];
  }

  $up = $pdo->prepare(
    "UPDATE owner_otp_challenges
     SET verified_at = UTC_TIMESTAMP()
     WHERE id = :id AND verified_at IS NULL"
  );
  $up->execute([':id' => (int)$row['id']]);
  if ($up->rowCount() !== 1) {
    return ['ok' => false, 'error' => 'otp_already_used'];
  }
  nister_rate_limit_clear('owner_otp_verify_msisdn', $msisdn);
  return ['ok' => true, 'msisdn' => $msisdn];
}
