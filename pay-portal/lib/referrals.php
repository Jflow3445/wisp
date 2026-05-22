<?php
declare(strict_types=1);

require_once __DIR__.'/db.php';
require_once __DIR__.'/settings.php';
require_once __DIR__.'/wallet.php';

function referrals_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t'=>$table]);
  return (bool)$st->fetchColumn();
}

function referrals_bootstrap_tables(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;

  $PDO->exec("CREATE TABLE IF NOT EXISTS referral_profiles (
    msisdn VARCHAR(32) PRIMARY KEY,
    invite_code VARCHAR(16) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invite_code (invite_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS referral_links (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    referrer_msisdn VARCHAR(32) NOT NULL,
    referred_msisdn VARCHAR(32) NOT NULL,
    referral_code_used VARCHAR(16) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_referred_msisdn (referred_msisdn),
    KEY idx_referrer_status (referrer_msisdn, status),
    KEY idx_starts_ends (starts_at, ends_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS referral_rewards (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    link_id BIGINT UNSIGNED NOT NULL,
    purchase_id BIGINT UNSIGNED NOT NULL,
    referrer_msisdn VARCHAR(32) NOT NULL,
    referred_msisdn VARCHAR(32) NOT NULL,
    source_price_cents INT NOT NULL,
    reward_cents INT NOT NULL DEFAULT 0,
    month_key CHAR(6) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    hold_expires_at DATETIME NULL,
    released_at DATETIME NULL,
    wallet_ref VARCHAR(64) NULL,
    reason VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchase_id (purchase_id),
    UNIQUE KEY uq_wallet_ref (wallet_ref),
    KEY idx_referrer_state (referrer_msisdn, state, created_at),
    KEY idx_state_hold (state, hold_expires_at),
    KEY idx_link (link_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS signup_otp_challenges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    msisdn VARCHAR(32) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts_left INT NOT NULL,
    resend_after DATETIME NOT NULL,
    ip VARCHAR(45) NULL,
    ua_hash CHAR(64) NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msisdn_created (msisdn, created_at),
    KEY idx_ip_created (ip, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS signup_otp_sessions (
    token VARCHAR(64) PRIMARY KEY,
    msisdn VARCHAR(32) NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msisdn_created (msisdn, created_at),
    KEY idx_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  referrals_ensure_default_settings();
  $ready = true;
}

function referrals_ensure_default_settings(): void {
  $defaults = [
    'REFERRAL_RATE_BPS' => '1000',
    'REFERRAL_MONTHLY_CAP_CENTS' => '6000',
    'REFERRAL_LIFETIME_CAP_CENTS' => '30000',
    'REFERRAL_WINDOW_DAYS' => '365',
    'REFERRAL_PENDING_HOLD_DAYS' => '60',
    'OTP_CODE_LENGTH' => '6',
    'OTP_TTL_SECONDS' => '300',
    'OTP_MAX_ATTEMPTS' => '3',
    'OTP_RESEND_COOLDOWN_SECONDS' => '60',
    'OTP_SESSION_TTL_SECONDS' => '900',
    'OTP_MAX_SENDS_PER_MSISDN_HOUR' => '6',
    'OTP_MAX_SENDS_PER_IP_HOUR' => '20',
  ];
  foreach ($defaults as $k => $v) {
    if (settings_get($k, null) === null) settings_set($k, $v);
  }
}

function referrals_cfg_int(string $key, int $default, int $min, int $max): int {
  $raw = settings_get($key, (string)$default);
  $v = is_numeric($raw) ? (int)$raw : $default;
  if ($v < $min) $v = $min;
  if ($v > $max) $v = $max;
  return $v;
}

function referrals_now(): DateTimeImmutable {
  return new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get()));
}

function referrals_canon_msisdn(string $raw): string {
  $msisdn = normalize_msisdn($raw);
  if (!preg_match('/^233\d{9}$/', $msisdn)) return '';
  return $msisdn;
}

function referrals_now_sql(?DateTimeImmutable $when = null): string {
  return ($when ?? referrals_now())->format('Y-m-d H:i:s');
}

function referrals_month_key(?DateTimeImmutable $when = null): string {
  return ($when ?? referrals_now())->format('Ym');
}

function referrals_is_user_active(string $rawMsisdn, ?DateTimeImmutable $when = null): bool {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') return false;
  $at = referrals_now_sql($when);
  $st = $PDO->prepare(
    "SELECT 1 FROM purchases
     WHERE msisdn=:m AND status='applied'
       AND (expires_at IS NULL OR expires_at>=:at)
     ORDER BY id DESC LIMIT 1"
  );
  try {
    $st->execute([':m'=>$msisdn, ':at'=>$at]);
    return (bool)$st->fetchColumn();
  } catch (Throwable $e) {
    return false;
  }
}

function referrals_generate_code(int $len = 8): string {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $max = strlen($alphabet) - 1;
  $out = '';
  for ($i = 0; $i < $len; $i++) {
    $out .= $alphabet[random_int(0, $max)];
  }
  return $out;
}

function referrals_get_profile(string $rawMsisdn): ?array {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') return null;
  $st = $PDO->prepare("SELECT msisdn, invite_code FROM referral_profiles WHERE msisdn=:m LIMIT 1");
  $st->execute([':m'=>$msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) return null;
  return [
    'msisdn' => (string)$row['msisdn'],
    'invite_code' => (string)$row['invite_code'],
  ];
}

function referrals_ensure_profile(string $rawMsisdn): ?array {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') return null;

  $existing = referrals_get_profile($msisdn);
  if ($existing) return $existing;

  $len = 8;
  for ($i = 0; $i < 20; $i++) {
    $code = referrals_generate_code($len);
    try {
      $st = $PDO->prepare("INSERT INTO referral_profiles(msisdn, invite_code) VALUES(:m,:c)");
      $st->execute([':m'=>$msisdn, ':c'=>$code]);
      return ['msisdn'=>$msisdn, 'invite_code'=>$code];
    } catch (Throwable $e) {
      $msg = (string)$e->getMessage();
      $sqlState = (string)$e->getCode();
      if ($sqlState === '23000' || stripos($msg, 'duplicate') !== false) {
        $row = referrals_get_profile($msisdn);
        if ($row) return $row;
        continue;
      }
      throw $e;
    }
  }
  return referrals_get_profile($msisdn);
}

function referrals_normalize_code(string $code): string {
  $c = strtoupper(trim($code));
  $c = preg_replace('/[^A-Z0-9]/', '', $c);
  return substr((string)$c, 0, 16);
}

function referrals_resolve_referrer_msisdn(string $referralCode): ?string {
  referrals_bootstrap_tables();
  global $PDO;
  $code = referrals_normalize_code($referralCode);
  if ($code === '') return null;
  $st = $PDO->prepare("SELECT msisdn FROM referral_profiles WHERE invite_code=:c LIMIT 1");
  $st->execute([':c'=>$code]);
  $m = $st->fetchColumn();
  $msisdn = is_string($m) ? referrals_canon_msisdn($m) : '';
  return $msisdn !== '' ? $msisdn : null;
}

function referrals_bind_referral(string $referredRaw, string $referralCodeRaw): array {
  referrals_bootstrap_tables();
  global $PDO;
  $referred = referrals_canon_msisdn($referredRaw);
  $code = referrals_normalize_code($referralCodeRaw);
  if ($referred === '' || $code === '') return ['ok'=>false, 'status'=>'invalid_referral_code'];
  $referrer = referrals_resolve_referrer_msisdn($code);
  if (!$referrer) return ['ok'=>false, 'status'=>'invalid_referral_code'];
  if ($referrer === $referred) return ['ok'=>true, 'status'=>'self_referral_ignored'];

  $starts = referrals_now();
  $days = referrals_cfg_int('REFERRAL_WINDOW_DAYS', 365, 1, 3660);
  $ends = $starts->modify("+{$days} days");

  $PDO->beginTransaction();
  try {
    $check = $PDO->prepare("SELECT id, referrer_msisdn FROM referral_links WHERE referred_msisdn=:m LIMIT 1 FOR UPDATE");
    $check->execute([':m'=>$referred]);
    $row = $check->fetch(PDO::FETCH_ASSOC);
    if ($row) {
      $PDO->commit();
      return [
        'ok'=>true,
        'status'=>'already_linked',
        'id'=>(int)$row['id'],
        'referrer_msisdn'=>(string)$row['referrer_msisdn'],
      ];
    }

    $ins = $PDO->prepare(
      "INSERT INTO referral_links(
        referrer_msisdn, referred_msisdn, referral_code_used, starts_at, ends_at, status
      ) VALUES(:r,:d,:c,:s,:e,'active')"
    );
    $ins->execute([
      ':r'=>$referrer,
      ':d'=>$referred,
      ':c'=>$code,
      ':s'=>$starts->format('Y-m-d H:i:s'),
      ':e'=>$ends->format('Y-m-d H:i:s'),
    ]);
    $id = (int)$PDO->lastInsertId();
    $PDO->commit();
    return ['ok'=>true, 'status'=>'created', 'id'=>$id, 'referrer_msisdn'=>$referrer];
  } catch (Throwable $e) {
    if ($PDO->inTransaction()) $PDO->rollBack();
    $msg = (string)$e->getMessage();
    if (stripos($msg, 'duplicate') !== false) {
      $st = $PDO->prepare("SELECT id, referrer_msisdn FROM referral_links WHERE referred_msisdn=:m LIMIT 1");
      $st->execute([':m'=>$referred]);
      $row = $st->fetch(PDO::FETCH_ASSOC);
      if ($row) {
        return [
          'ok'=>true,
          'status'=>'already_linked',
          'id'=>(int)$row['id'],
          'referrer_msisdn'=>(string)$row['referrer_msisdn'],
        ];
      }
    }
    throw $e;
  }
}

function referrals_otp_send(string $rawMsisdn, ?string $ip = null, ?string $ua = null): array {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') return ['ok'=>false, 'error'=>'invalid_phone'];

  $now = referrals_now();
  $len = referrals_cfg_int('OTP_CODE_LENGTH', 6, 4, 8);
  $ttl = referrals_cfg_int('OTP_TTL_SECONDS', 300, 60, 3600);
  $attempts = referrals_cfg_int('OTP_MAX_ATTEMPTS', 3, 1, 10);
  $cooldown = referrals_cfg_int('OTP_RESEND_COOLDOWN_SECONDS', 60, 10, 3600);
  $maxMsisdnHour = referrals_cfg_int('OTP_MAX_SENDS_PER_MSISDN_HOUR', 6, 1, 100);
  $maxIpHour = referrals_cfg_int('OTP_MAX_SENDS_PER_IP_HOUR', 20, 1, 500);

  $st = $PDO->prepare(
    "SELECT resend_after
     FROM signup_otp_challenges
     WHERE msisdn=:m AND used_at IS NULL AND expires_at>=:now
     ORDER BY id DESC LIMIT 1"
  );
  $st->execute([':m'=>$msisdn, ':now'=>$now->format('Y-m-d H:i:s')]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if ($row && !empty($row['resend_after'])) {
    $resendAt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$row['resend_after'], $now->getTimezone());
    if ($resendAt instanceof DateTimeImmutable && $resendAt > $now) {
      return [
        'ok'=>false,
        'error'=>'cooldown_active',
        'cooldown_seconds'=>max(1, $resendAt->getTimestamp() - $now->getTimestamp()),
      ];
    }
  }

  $pastHour = $now->modify('-1 hour')->format('Y-m-d H:i:s');
  $countMsisdn = $PDO->prepare("SELECT COUNT(*) FROM signup_otp_challenges WHERE msisdn=:m AND created_at>=:ts");
  $countMsisdn->execute([':m'=>$msisdn, ':ts'=>$pastHour]);
  if ((int)$countMsisdn->fetchColumn() >= $maxMsisdnHour) {
    return ['ok'=>false, 'error'=>'rate_limited'];
  }

  $ip = trim((string)$ip);
  if ($ip !== '') {
    $countIp = $PDO->prepare("SELECT COUNT(*) FROM signup_otp_challenges WHERE ip=:ip AND created_at>=:ts");
    $countIp->execute([':ip'=>$ip, ':ts'=>$pastHour]);
    if ((int)$countIp->fetchColumn() >= $maxIpHour) {
      return ['ok'=>false, 'error'=>'rate_limited_ip'];
    }
  }

  $max = (10 ** $len) - 1;
  $min = (10 ** ($len - 1));
  $code = (string)random_int($min, $max);
  $hash = password_hash($code, PASSWORD_DEFAULT);
  $expiresAt = $now->modify("+{$ttl} seconds");
  $resendAfter = $now->modify("+{$cooldown} seconds");
  $uaHash = $ua !== null && $ua !== '' ? hash('sha256', $ua) : null;

  $ins = $PDO->prepare(
    "INSERT INTO signup_otp_challenges(
      msisdn, otp_hash, expires_at, attempts_left, resend_after, ip, ua_hash
    ) VALUES(:m,:h,:e,:a,:r,:ip,:ua)"
  );
  $ins->execute([
    ':m'=>$msisdn,
    ':h'=>$hash,
    ':e'=>$expiresAt->format('Y-m-d H:i:s'),
    ':a'=>$attempts,
    ':r'=>$resendAfter->format('Y-m-d H:i:s'),
    ':ip'=>$ip !== '' ? $ip : null,
    ':ua'=>$uaHash,
  ]);

  return [
    'ok'=>true,
    'msisdn'=>$msisdn,
    'code'=>$code,
    'cooldown_seconds'=>$cooldown,
    'expires_seconds'=>$ttl,
  ];
}

function referrals_otp_verify(string $rawMsisdn, string $code): array {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') return ['ok'=>false, 'error'=>'invalid_phone'];
  $code = preg_replace('/\D+/', '', trim($code));
  $len = referrals_cfg_int('OTP_CODE_LENGTH', 6, 4, 8);
  if (strlen((string)$code) !== $len) return ['ok'=>false, 'error'=>'invalid_code_format'];
  $now = referrals_now();
  $PDO->beginTransaction();
  try {
    $st = $PDO->prepare(
      "SELECT id, otp_hash, expires_at, attempts_left
       FROM signup_otp_challenges
       WHERE msisdn=:m AND used_at IS NULL
       ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    $st->execute([':m'=>$msisdn]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
      $PDO->rollBack();
      return ['ok'=>false, 'error'=>'otp_not_requested'];
    }

    $expiresAt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$row['expires_at'], $now->getTimezone());
    if (!($expiresAt instanceof DateTimeImmutable) || $expiresAt < $now) {
      $PDO->rollBack();
      return ['ok'=>false, 'error'=>'otp_expired'];
    }

    $attemptsLeft = (int)($row['attempts_left'] ?? 0);
    if ($attemptsLeft <= 0) {
      $PDO->rollBack();
      return ['ok'=>false, 'error'=>'otp_locked'];
    }

    $valid = password_verify((string)$code, (string)$row['otp_hash']);
    if (!$valid) {
      $dec = $PDO->prepare(
        "UPDATE signup_otp_challenges
         SET attempts_left = GREATEST(attempts_left - 1, 0)
         WHERE id=:id AND attempts_left > 0"
      );
      $dec->execute([':id'=>(int)$row['id']]);
      $leftSt = $PDO->prepare("SELECT attempts_left FROM signup_otp_challenges WHERE id=:id");
      $leftSt->execute([':id'=>(int)$row['id']]);
      $newAttempts = (int)($leftSt->fetchColumn() ?: 0);
      $PDO->commit();
      if ($newAttempts <= 0) return ['ok'=>false, 'error'=>'otp_locked'];
      return ['ok'=>false, 'error'=>'otp_invalid', 'attempts_left'=>$newAttempts];
    }

    $token = bin2hex(random_bytes(32));
    $sessionTtl = referrals_cfg_int('OTP_SESSION_TTL_SECONDS', 900, 60, 3600);
    $sessionExp = $now->modify("+{$sessionTtl} seconds");

    $consume = $PDO->prepare("UPDATE signup_otp_challenges SET used_at=:now WHERE id=:id AND used_at IS NULL");
    $consume->execute([':now'=>$now->format('Y-m-d H:i:s'), ':id'=>(int)$row['id']]);
    if ($consume->rowCount() < 1) {
      $PDO->rollBack();
      return ['ok'=>false, 'error'=>'otp_already_used'];
    }

    $ins = $PDO->prepare(
      "INSERT INTO signup_otp_sessions(token, msisdn, expires_at, consumed_at)
       VALUES(:t,:m,:e,NULL)"
    );
    $ins->execute([
      ':t'=>$token,
      ':m'=>$msisdn,
      ':e'=>$sessionExp->format('Y-m-d H:i:s'),
    ]);
    $PDO->commit();
    return ['ok'=>true, 'signup_token'=>$token, 'token_expires_seconds'=>$sessionTtl];
  } catch (Throwable $e) {
    if ($PDO->inTransaction()) $PDO->rollBack();
    throw $e;
  }
}

function referrals_signup_token_valid(string $rawMsisdn, string $token): bool {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  $token = trim($token);
  if ($msisdn === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) return false;
  $st = $PDO->prepare(
    "SELECT 1 FROM signup_otp_sessions
     WHERE token=:t AND msisdn=:m
       AND consumed_at IS NULL AND expires_at>=:now
     LIMIT 1"
  );
  $st->execute([
    ':t'=>$token,
    ':m'=>$msisdn,
    ':now'=>referrals_now_sql(),
  ]);
  return (bool)$st->fetchColumn();
}

function referrals_consume_signup_token(string $rawMsisdn, string $token): bool {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  $token = trim($token);
  if ($msisdn === '' || !preg_match('/^[a-f0-9]{64}$/', $token)) return false;
  $st = $PDO->prepare(
    "UPDATE signup_otp_sessions
     SET consumed_at=:consume_now
     WHERE token=:t AND msisdn=:m
       AND consumed_at IS NULL AND expires_at>=:expires_now"
  );
  $now = referrals_now_sql();
  $st->execute([
    ':consume_now'=>$now,
    ':expires_now'=>$now,
    ':t'=>$token,
    ':m'=>$msisdn,
  ]);
  return $st->rowCount() > 0;
}

function referrals_insert_reward_row(array $data): int {
  global $PDO;
  $ins = $PDO->prepare(
    "INSERT INTO referral_rewards(
      link_id, purchase_id, referrer_msisdn, referred_msisdn, source_price_cents, reward_cents, month_key,
      state, hold_expires_at, released_at, wallet_ref, reason
    ) VALUES(
      :link_id, :purchase_id, :referrer_msisdn, :referred_msisdn, :source_price_cents, :reward_cents, :month_key,
      :state, :hold_expires_at, :released_at, :wallet_ref, :reason
    )"
  );
  $ins->execute($data);
  return (int)$PDO->lastInsertId();
}

function referrals_create_reward_for_purchase(int $purchaseId, string $referredRaw, int $priceCents, ?DateTimeImmutable $purchaseAt = null): array {
  referrals_bootstrap_tables();
  global $PDO;
  $referred = referrals_canon_msisdn($referredRaw);
  if ($purchaseId <= 0 || $referred === '' || $priceCents <= 0) {
    return ['ok'=>false, 'status'=>'invalid_input'];
  }

  $when = $purchaseAt ?? referrals_now();
  $whenSql = $when->format('Y-m-d H:i:s');
  $monthKey = $when->format('Ym');

  $exists = $PDO->prepare("SELECT id, state FROM referral_rewards WHERE purchase_id=:p LIMIT 1");
  $exists->execute([':p'=>$purchaseId]);
  $existing = $exists->fetch(PDO::FETCH_ASSOC);
  if ($existing) {
    return ['ok'=>true, 'status'=>'already_processed', 'reward_id'=>(int)$existing['id'], 'state'=>(string)$existing['state']];
  }

  $linkQ = $PDO->prepare(
    "SELECT id, referrer_msisdn, starts_at, ends_at
     FROM referral_links
     WHERE referred_msisdn=:m AND status='active'
       AND starts_at<=:ts AND ends_at>=:ts
     ORDER BY id DESC LIMIT 1"
  );
  $linkQ->execute([':m'=>$referred, ':ts'=>$whenSql]);
  $link = $linkQ->fetch(PDO::FETCH_ASSOC);
  if (!$link) {
    return ['ok'=>true, 'status'=>'no_active_link'];
  }

  $referrer = referrals_canon_msisdn((string)$link['referrer_msisdn']);
  if ($referrer === '' || $referrer === $referred) {
    return ['ok'=>true, 'status'=>'invalid_link'];
  }

  $rateBps = referrals_cfg_int('REFERRAL_RATE_BPS', 1000, 1, 10000);
  $rawReward = (int)floor(($priceCents * $rateBps) / 10000);
  $monthlyCap = referrals_cfg_int('REFERRAL_MONTHLY_CAP_CENTS', 6000, 0, 1000000000);
  $lifetimeCap = referrals_cfg_int('REFERRAL_LIFETIME_CAP_CENTS', 30000, 0, 1000000000);
  $holdDays = referrals_cfg_int('REFERRAL_PENDING_HOLD_DAYS', 60, 1, 3650);
  $walletRef = 'REFBONUS-PUR-'.$purchaseId;
  $holdExpires = $when->modify("+{$holdDays} days")->format('Y-m-d H:i:s');

  $PDO->beginTransaction();
  try {
    $exists = $PDO->prepare("SELECT id, state FROM referral_rewards WHERE purchase_id=:p LIMIT 1 FOR UPDATE");
    $exists->execute([':p'=>$purchaseId]);
    $dup = $exists->fetch(PDO::FETCH_ASSOC);
    if ($dup) {
      $PDO->commit();
      return ['ok'=>true, 'status'=>'already_processed', 'reward_id'=>(int)$dup['id'], 'state'=>(string)$dup['state']];
    }

    $sumMonthSt = $PDO->prepare(
      "SELECT COALESCE(SUM(reward_cents),0)
       FROM referral_rewards
       WHERE referrer_msisdn=:m AND month_key=:mk AND state IN ('pending','releasing','released')"
    );
    $sumMonthSt->execute([':m'=>$referrer, ':mk'=>$monthKey]);
    $monthUsed = (int)$sumMonthSt->fetchColumn();

    $sumLifeSt = $PDO->prepare(
      "SELECT COALESCE(SUM(reward_cents),0)
       FROM referral_rewards
       WHERE referrer_msisdn=:m AND state IN ('pending','releasing','released')"
    );
    $sumLifeSt->execute([':m'=>$referrer]);
    $lifeUsed = (int)$sumLifeSt->fetchColumn();

    $monthRemain = max(0, $monthlyCap - $monthUsed);
    $lifeRemain = max(0, $lifetimeCap - $lifeUsed);
    $eligible = min($rawReward, $monthRemain, $lifeRemain);

    if ($rawReward <= 0 || $eligible <= 0) {
      $id = referrals_insert_reward_row([
        ':link_id'=>(int)$link['id'],
        ':purchase_id'=>$purchaseId,
        ':referrer_msisdn'=>$referrer,
        ':referred_msisdn'=>$referred,
        ':source_price_cents'=>$priceCents,
        ':reward_cents'=>0,
        ':month_key'=>$monthKey,
        ':state'=>'skipped',
        ':hold_expires_at'=>null,
        ':released_at'=>null,
        ':wallet_ref'=>null,
        ':reason'=>$rawReward <= 0 ? 'below_minimum' : 'cap_reached',
      ]);
      $PDO->commit();
      return ['ok'=>true, 'status'=>'skipped', 'reward_id'=>$id];
    }

    $id = referrals_insert_reward_row([
      ':link_id'=>(int)$link['id'],
      ':purchase_id'=>$purchaseId,
      ':referrer_msisdn'=>$referrer,
      ':referred_msisdn'=>$referred,
      ':source_price_cents'=>$priceCents,
      ':reward_cents'=>$eligible,
      ':month_key'=>$monthKey,
      ':state'=>'pending',
      ':hold_expires_at'=>$holdExpires,
      ':released_at'=>null,
      ':wallet_ref'=>$walletRef,
      ':reason'=>$eligible < $rawReward ? 'cap_clipped' : 'pending_release',
    ]);
    $PDO->commit();
  } catch (Throwable $e) {
    if ($PDO->inTransaction()) $PDO->rollBack();
    $msg = strtolower((string)$e->getMessage());
    if (str_contains($msg, 'duplicate') || str_contains($msg, 'uq_purchase_id')) {
      return ['ok'=>true, 'status'=>'already_processed'];
    }
    throw $e;
  }

  if (referrals_is_user_active($referrer, $when)) {
    referrals_release_reward((int)$id);
  }
  return ['ok'=>true, 'status'=>'pending_or_released', 'reward_id'=>(int)$id];
}

function referrals_release_reward(int $rewardId): array {
  referrals_bootstrap_tables();
  global $PDO;
  if ($rewardId <= 0) return ['ok'=>false, 'status'=>'invalid_reward'];

  $st = $PDO->prepare(
    "SELECT id, referrer_msisdn, reward_cents, state, hold_expires_at, wallet_ref
     FROM referral_rewards WHERE id=:id LIMIT 1"
  );
  $st->execute([':id'=>$rewardId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) return ['ok'=>false, 'status'=>'not_found'];
  if ((string)$row['state'] !== 'pending') return ['ok'=>true, 'status'=>'not_pending'];

  $now = referrals_now();
  $hold = (string)($row['hold_expires_at'] ?? '');
  if ($hold !== '') {
    $holdAt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $hold, $now->getTimezone());
    if ($holdAt instanceof DateTimeImmutable && $holdAt < $now) {
      $up = $PDO->prepare("UPDATE referral_rewards SET state='expired', reason='hold_expired' WHERE id=:id AND state='pending'");
      $up->execute([':id'=>$rewardId]);
      return ['ok'=>true, 'status'=>'expired'];
    }
  }

  $referrer = referrals_canon_msisdn((string)$row['referrer_msisdn']);
  if ($referrer === '' || !referrals_is_user_active($referrer, $now)) {
    return ['ok'=>true, 'status'=>'referrer_inactive'];
  }

  $claim = $PDO->prepare("UPDATE referral_rewards SET state='releasing', reason='releasing' WHERE id=:id AND state='pending'");
  $claim->execute([':id'=>$rewardId]);
  if ($claim->rowCount() < 1) return ['ok'=>true, 'status'=>'already_claimed'];

  try {
    wallet_credit_typed(
      $referrer,
      (int)$row['reward_cents'],
      (string)$row['wallet_ref'],
      'Referral bonus',
      'referral_bonus'
    );
    $done = $PDO->prepare(
      "UPDATE referral_rewards
       SET state='released', released_at=:now, reason='released'
       WHERE id=:id AND state='releasing'"
    );
    $done->execute([':now'=>$now->format('Y-m-d H:i:s'), ':id'=>$rewardId]);
    return ['ok'=>true, 'status'=>'released'];
  } catch (Throwable $e) {
    $revert = $PDO->prepare("UPDATE referral_rewards SET state='pending', reason='release_retry' WHERE id=:id AND state='releasing'");
    $revert->execute([':id'=>$rewardId]);
    throw $e;
  }
}

function referrals_expire_pending(?string $rawReferrerMsisdn = null): int {
  referrals_bootstrap_tables();
  global $PDO;
  $sql = "UPDATE referral_rewards
          SET state='expired', reason='hold_expired'
          WHERE state='pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < :now";
  $params = [':now'=>referrals_now_sql()];
  if ($rawReferrerMsisdn !== null) {
    $m = referrals_canon_msisdn($rawReferrerMsisdn);
    if ($m === '') return 0;
    $sql .= " AND referrer_msisdn=:m";
    $params[':m'] = $m;
  }
  $st = $PDO->prepare($sql);
  $st->execute($params);
  return $st->rowCount();
}

function referrals_release_pending_for_referrer(string $rawReferrerMsisdn, int $limit = 200): array {
  referrals_bootstrap_tables();
  global $PDO;
  $referrer = referrals_canon_msisdn($rawReferrerMsisdn);
  if ($referrer === '') return ['ok'=>false, 'status'=>'invalid_msisdn', 'released'=>0, 'expired'=>0];

  $expired = referrals_expire_pending($referrer);
  if (!referrals_is_user_active($referrer, referrals_now())) {
    return ['ok'=>true, 'status'=>'inactive', 'released'=>0, 'expired'=>$expired];
  }

  $limit = max(1, min(2000, $limit));
  $st = $PDO->prepare(
    "SELECT id
     FROM referral_rewards
     WHERE referrer_msisdn=:m AND state='pending'
       AND (hold_expires_at IS NULL OR hold_expires_at>=:now)
     ORDER BY id ASC
     LIMIT {$limit}"
  );
  $st->execute([':m'=>$referrer, ':now'=>referrals_now_sql()]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $released = 0;
  foreach ($rows as $r) {
    $res = referrals_release_reward((int)$r['id']);
    if (($res['status'] ?? '') === 'released') $released++;
  }
  return ['ok'=>true, 'status'=>'processed', 'released'=>$released, 'expired'=>$expired];
}

function referrals_release_pending_global(int $limitReferrers = 200, int $limitPerReferrer = 100): array {
  referrals_bootstrap_tables();
  global $PDO;
  $expired = referrals_expire_pending(null);
  $limitReferrers = max(1, min(2000, $limitReferrers));
  $limitPerReferrer = max(1, min(2000, $limitPerReferrer));

  $st = $PDO->query(
    "SELECT DISTINCT referrer_msisdn
     FROM referral_rewards
     WHERE state='pending' AND (hold_expires_at IS NULL OR hold_expires_at>=NOW())
     ORDER BY referrer_msisdn
     LIMIT {$limitReferrers}"
  );
  $refs = $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: [];

  $released = 0;
  foreach ($refs as $m) {
    $res = referrals_release_pending_for_referrer((string)$m, $limitPerReferrer);
    $released += (int)($res['released'] ?? 0);
  }
  return ['ok'=>true, 'expired'=>$expired, 'released'=>$released, 'referrers'=>count($refs)];
}

function referrals_user_summary(string $rawMsisdn): array {
  referrals_bootstrap_tables();
  global $PDO;
  $msisdn = referrals_canon_msisdn($rawMsisdn);
  if ($msisdn === '') {
    return [
      'invite_code'=>null,
      'pending_cents'=>0,
      'released_cents_month'=>0,
      'released_cents_lifetime'=>0,
      'links_total'=>0,
      'links_active'=>0,
      'rewards_pending_cnt'=>0,
      'rewards_released_cnt'=>0,
      'rewards_expired_cnt'=>0,
      'rewards_skipped_cnt'=>0,
      'last_reward_at'=>null,
      'last_released_at'=>null,
      'rate_bps'=>0,
      'rate_pct'=>0,
      'monthly_cap_cents'=>0,
      'lifetime_cap_cents'=>0,
      'window_days'=>0,
      'hold_days'=>0,
    ];
  }
  $profile = referrals_ensure_profile($msisdn);
  $month = referrals_month_key();

  $pending = $PDO->prepare(
    "SELECT COALESCE(SUM(reward_cents),0)
     FROM referral_rewards
     WHERE referrer_msisdn=:m AND state='pending'
       AND (hold_expires_at IS NULL OR hold_expires_at>=:now)"
  );
  $pending->execute([':m'=>$msisdn, ':now'=>referrals_now_sql()]);
  $pendingCents = (int)$pending->fetchColumn();

  $monthSt = $PDO->prepare(
    "SELECT COALESCE(SUM(reward_cents),0)
     FROM referral_rewards
     WHERE referrer_msisdn=:m AND state='released' AND month_key=:mk"
  );
  $monthSt->execute([':m'=>$msisdn, ':mk'=>$month]);
  $monthCents = (int)$monthSt->fetchColumn();

  $lifeSt = $PDO->prepare(
    "SELECT COALESCE(SUM(reward_cents),0)
     FROM referral_rewards
     WHERE referrer_msisdn=:m AND state='released'"
  );
  $lifeSt->execute([':m'=>$msisdn]);
  $lifeCents = (int)$lifeSt->fetchColumn();

  $linkTotal = 0;
  $linkActive = 0;
  try {
    $lt = $PDO->prepare("SELECT COUNT(*) FROM referral_links WHERE referrer_msisdn=:m");
    $lt->execute([':m'=>$msisdn]);
    $linkTotal = (int)$lt->fetchColumn();
    $la = $PDO->prepare(
      "SELECT COUNT(*) FROM referral_links
       WHERE referrer_msisdn=:m AND status='active' AND ends_at>=NOW()"
    );
    $la->execute([':m'=>$msisdn]);
    $linkActive = (int)$la->fetchColumn();
  } catch (Throwable $e) { /* keep defaults */ }

  $rewardCounts = [
    'pending'=>0,
    'released'=>0,
    'expired'=>0,
    'skipped'=>0,
  ];
  try {
    $rc = $PDO->prepare(
      "SELECT state, COUNT(*) AS c
       FROM referral_rewards
       WHERE referrer_msisdn=:m
       GROUP BY state"
    );
    $rc->execute([':m'=>$msisdn]);
    foreach ($rc->fetchAll() as $row) {
      $state = (string)($row['state'] ?? '');
      if ($state !== '' && array_key_exists($state, $rewardCounts)) {
        $rewardCounts[$state] = (int)($row['c'] ?? 0);
      }
    }
  } catch (Throwable $e) { /* keep defaults */ }

  $lastRewardAt = null;
  $lastReleasedAt = null;
  try {
    $lr = $PDO->prepare("SELECT MAX(created_at) FROM referral_rewards WHERE referrer_msisdn=:m");
    $lr->execute([':m'=>$msisdn]);
    $lastRewardAt = $lr->fetchColumn() ?: null;
    $lrel = $PDO->prepare("SELECT MAX(released_at) FROM referral_rewards WHERE referrer_msisdn=:m AND released_at IS NOT NULL");
    $lrel->execute([':m'=>$msisdn]);
    $lastReleasedAt = $lrel->fetchColumn() ?: null;
  } catch (Throwable $e) { /* keep defaults */ }

  $rateBps = referrals_cfg_int('REFERRAL_RATE_BPS', 1000, 1, 10000);
  $monthlyCap = referrals_cfg_int('REFERRAL_MONTHLY_CAP_CENTS', 6000, 0, 1000000000);
  $lifetimeCap = referrals_cfg_int('REFERRAL_LIFETIME_CAP_CENTS', 30000, 0, 1000000000);
  $windowDays = referrals_cfg_int('REFERRAL_WINDOW_DAYS', 365, 1, 3660);
  $holdDays = referrals_cfg_int('REFERRAL_PENDING_HOLD_DAYS', 60, 1, 3650);
  $ratePct = round($rateBps / 100, 2);

  return [
    'invite_code'=>$profile['invite_code'] ?? null,
    'pending_cents'=>$pendingCents,
    'released_cents_month'=>$monthCents,
    'released_cents_lifetime'=>$lifeCents,
    'links_total'=>$linkTotal,
    'links_active'=>$linkActive,
    'rewards_pending_cnt'=>$rewardCounts['pending'],
    'rewards_released_cnt'=>$rewardCounts['released'],
    'rewards_expired_cnt'=>$rewardCounts['expired'],
    'rewards_skipped_cnt'=>$rewardCounts['skipped'],
    'last_reward_at'=>$lastRewardAt,
    'last_released_at'=>$lastReleasedAt,
    'rate_bps'=>$rateBps,
    'rate_pct'=>$ratePct,
    'monthly_cap_cents'=>$monthlyCap,
    'lifetime_cap_cents'=>$lifetimeCap,
    'window_days'=>$windowDays,
    'hold_days'=>$holdDays,
  ];
}

function referrals_admin_stats(): array {
  referrals_bootstrap_tables();
  global $PDO;

  if (!referrals_table_exists($PDO, 'referral_rewards')) {
    return [
      'pending_cents'=>0,
      'released_cents'=>0,
      'expired_cents'=>0,
      'skipped_cnt'=>0,
      'pending_cnt'=>0,
      'released_cnt'=>0,
      'expired_cnt'=>0,
    ];
  }

  $row = $PDO->query(
    "SELECT
      COALESCE(SUM(CASE WHEN state='pending' THEN reward_cents ELSE 0 END),0) AS pending_cents,
      COALESCE(SUM(CASE WHEN state='released' THEN reward_cents ELSE 0 END),0) AS released_cents,
      COALESCE(SUM(CASE WHEN state='expired' THEN reward_cents ELSE 0 END),0) AS expired_cents,
      COALESCE(SUM(CASE WHEN state='skipped' THEN 1 ELSE 0 END),0) AS skipped_cnt,
      COALESCE(SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END),0) AS pending_cnt,
      COALESCE(SUM(CASE WHEN state='released' THEN 1 ELSE 0 END),0) AS released_cnt,
      COALESCE(SUM(CASE WHEN state='expired' THEN 1 ELSE 0 END),0) AS expired_cnt
     FROM referral_rewards"
  )->fetch(PDO::FETCH_ASSOC) ?: [];

  return [
    'pending_cents'=>(int)($row['pending_cents'] ?? 0),
    'released_cents'=>(int)($row['released_cents'] ?? 0),
    'expired_cents'=>(int)($row['expired_cents'] ?? 0),
    'skipped_cnt'=>(int)($row['skipped_cnt'] ?? 0),
    'pending_cnt'=>(int)($row['pending_cnt'] ?? 0),
    'released_cnt'=>(int)($row['released_cnt'] ?? 0),
    'expired_cnt'=>(int)($row['expired_cnt'] ?? 0),
  ];
}
