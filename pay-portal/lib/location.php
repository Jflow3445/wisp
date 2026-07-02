<?php
declare(strict_types=1);

require_once __DIR__.'/common.php';
require_once __DIR__.'/db.php';

function location_db_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t' => $table]);
  return (bool)$st->fetchColumn();
}

function location_db_column_exists(PDO $pdo, string $table, string $column): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
  );
  $st->execute([':t' => $table, ':c' => $column]);
  return (bool)$st->fetchColumn();
}

function location_add_column_if_missing(PDO $pdo, string $table, string $column, string $definition): void {
  if (!location_db_table_exists($pdo, $table)) return;
  if (location_db_column_exists($pdo, $table, $column)) return;
  $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN {$definition}");
}

function location_default_code(): string {
  return 'DEFAULT';
}

function location_normalize_code(string $raw): string {
  $raw = trim($raw);
  if ($raw === '') return '';
  $raw = strtoupper(str_replace(' ', '_', $raw));
  $raw = preg_replace('/[^A-Z0-9_-]+/', '', $raw) ?? '';
  if ($raw === '') return '';
  return substr($raw, 0, 64);
}

function location_bootstrap(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;

  $PDO->exec("CREATE TABLE IF NOT EXISTS locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
    active TINYINT(1) NOT NULL DEFAULT 1,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_locations_code (code),
    KEY idx_locations_active (active, is_default)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS location_nas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    nas_ip VARCHAR(64) NULL,
    exporter_ip VARCHAR(64) NULL,
    exporter_id VARCHAR(64) NULL,
    label VARCHAR(128) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_location_nas_location (location_id),
    KEY idx_location_nas_nas_ip (nas_ip),
    KEY idx_location_nas_exporter (exporter_ip, exporter_id),
    CONSTRAINT fk_location_nas_location
      FOREIGN KEY (location_id) REFERENCES locations(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS location_router_discovery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identity_key VARCHAR(191) NOT NULL,
    nas_ip VARCHAR(64) NULL,
    exporter_ip VARCHAR(64) NULL,
    exporter_id VARCHAR(64) NULL,
    host_ip VARCHAR(64) NULL,
    router_ip_hint VARCHAR(64) NULL,
    remote_addr VARCHAR(64) NULL,
    x_forwarded_for VARCHAR(255) NULL,
    link_login_only VARCHAR(255) NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'router_context',
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    note VARCHAR(255) NULL,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    seen_count INT NOT NULL DEFAULT 1,
    assigned_location_id INT NULL,
    assigned_mapping_id INT NULL,
    assigned_by VARCHAR(64) NULL,
    assigned_at DATETIME NULL,
    UNIQUE KEY uq_router_discovery_identity (identity_key),
    KEY idx_router_discovery_status (status, last_seen_at),
    KEY idx_router_discovery_assigned_location (assigned_location_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS location_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT NOT NULL,
    plan_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NULL,
    price_cents INT NOT NULL,
    duration_days INT NOT NULL DEFAULT 30,
    quota_bytes BIGINT NULL,
    rate_limit VARCHAR(128) NULL,
    address_list VARCHAR(64) NOT NULL DEFAULT 'HS_ACTIVE',
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_location_plan (location_id, plan_code),
    KEY idx_location_plans_active (location_id, active),
    CONSTRAINT fk_location_plans_location
      FOREIGN KEY (location_id) REFERENCES locations(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS user_location_profiles (
    msisdn VARCHAR(32) PRIMARY KEY,
    location_id INT NOT NULL,
    signup_location_id INT NULL,
    last_location_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user_location_profiles_location (location_id),
    KEY idx_user_location_profiles_signup (signup_location_id),
    CONSTRAINT fk_user_location_profiles_location
      FOREIGN KEY (location_id) REFERENCES locations(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $st = $PDO->query("SELECT id FROM locations WHERE is_default=1 ORDER BY id ASC LIMIT 1");
  $defaultId = (int)($st->fetchColumn() ?: 0);
  if ($defaultId <= 0) {
    $code = location_default_code();
    $ins = $PDO->prepare(
      "INSERT INTO locations(code, name, active, is_default) VALUES(:c, :n, 1, 1)
       ON DUPLICATE KEY UPDATE is_default=1, active=1"
    );
    $ins->execute([':c' => $code, ':n' => 'Default Site']);
    $st = $PDO->prepare("SELECT id FROM locations WHERE code=:c LIMIT 1");
    $st->execute([':c' => $code]);
    $defaultId = (int)($st->fetchColumn() ?: 0);
  }
  if ($defaultId > 0) {
    $PDO->prepare("UPDATE locations SET is_default=CASE WHEN id=:id THEN 1 ELSE 0 END")
      ->execute([':id' => $defaultId]);
  }

  try {
    location_add_column_if_missing(
      $PDO,
      'purchases',
      'location_id',
      "`location_id` INT NULL AFTER `msisdn`, ADD KEY `idx_purchases_location` (`location_id`)"
    );
  } catch (Throwable $e) { /* non-fatal */ }
  try {
    location_add_column_if_missing(
      $PDO,
      'auto_renew_settings',
      'location_id',
      "`location_id` INT NULL AFTER `msisdn`, ADD KEY `idx_auto_renew_location` (`location_id`)"
    );
  } catch (Throwable $e) { /* non-fatal */ }
  try {
    location_add_column_if_missing(
      $PDO,
      'wallet_promo_grants',
      'location_id',
      "`location_id` INT NULL AFTER `msisdn`, ADD KEY `idx_wallet_promo_location` (`location_id`)"
    );
  } catch (Throwable $e) { /* non-fatal */ }
  try {
    location_add_column_if_missing(
      $PDO,
      'user_location_profiles',
      'signup_location_id',
      "`signup_location_id` INT NULL AFTER `location_id`, ADD KEY `idx_user_location_profiles_signup` (`signup_location_id`)"
    );
  } catch (Throwable $e) { /* non-fatal */ }

  if ($defaultId > 0) {
    if (location_db_table_exists($PDO, 'purchases') && location_db_column_exists($PDO, 'purchases', 'location_id')) {
      $PDO->prepare("UPDATE purchases SET location_id=:id WHERE location_id IS NULL")->execute([':id' => $defaultId]);
    }
    if (location_db_table_exists($PDO, 'auto_renew_settings') && location_db_column_exists($PDO, 'auto_renew_settings', 'location_id')) {
      $PDO->prepare("UPDATE auto_renew_settings SET location_id=:id WHERE location_id IS NULL")->execute([':id' => $defaultId]);
    }
    if (location_db_table_exists($PDO, 'wallet_promo_grants') && location_db_column_exists($PDO, 'wallet_promo_grants', 'location_id')) {
      $PDO->prepare("UPDATE wallet_promo_grants SET location_id=:id WHERE location_id IS NULL")->execute([':id' => $defaultId]);
    }
    if (location_db_table_exists($PDO, 'user_location_profiles') && location_db_column_exists($PDO, 'user_location_profiles', 'signup_location_id')) {
      $PDO->prepare("UPDATE user_location_profiles
                     SET signup_location_id=location_id
                     WHERE signup_location_id IS NULL AND location_id IS NOT NULL")
        ->execute();
    }
  }

  $ready = true;
}

function location_default_id(): int {
  location_bootstrap();
  global $PDO;
  $id = (int)($PDO->query("SELECT id FROM locations WHERE is_default=1 ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 0);
  if ($id > 0) return $id;
  $id = (int)($PDO->query("SELECT id FROM locations ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 0);
  if ($id > 0) return $id;

  $code = location_default_code();
  $PDO->prepare("INSERT INTO locations(code,name,active,is_default) VALUES(:c,'Default Site',1,1)")
    ->execute([':c' => $code]);
  return (int)$PDO->lastInsertId();
}

function location_find_by_id(int $id): ?array {
  if ($id <= 0) return null;
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare("SELECT id, code, name, timezone, active, is_default FROM locations WHERE id=:id LIMIT 1");
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  return $row ?: null;
}

function location_find_by_code(string $rawCode): ?array {
  location_bootstrap();
  global $PDO;
  $code = location_normalize_code($rawCode);
  if ($code === '') return null;
  $st = $PDO->prepare("SELECT id, code, name, timezone, active, is_default FROM locations WHERE code=:c LIMIT 1");
  $st->execute([':c' => $code]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  return $row ?: null;
}

function location_is_default_id(int $id): bool {
  $row = location_find_by_id($id);
  return $row ? ((int)($row['is_default'] ?? 0) === 1) : false;
}

function location_list(bool $includeInactive = true): array {
  location_bootstrap();
  global $PDO;
  $sql = "SELECT id, code, name, timezone, active, is_default FROM locations";
  if (!$includeInactive) $sql .= " WHERE active=1";
  $sql .= " ORDER BY is_default DESC, name ASC, id ASC";
  $rows = $PDO->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
  return array_map(static function(array $r): array {
    $r['id'] = (int)($r['id'] ?? 0);
    $r['active'] = (int)($r['active'] ?? 0);
    $r['is_default'] = (int)($r['is_default'] ?? 0);
    return $r;
  }, $rows);
}

function location_save(array $in): array {
  location_bootstrap();
  global $PDO;

  $id = (int)($in['id'] ?? 0);
  $code = location_normalize_code((string)($in['code'] ?? ''));
  $name = trim((string)($in['name'] ?? ''));
  $tz = trim((string)($in['timezone'] ?? 'Africa/Accra'));
  $active = !empty($in['active']) ? 1 : 0;

  if ($code === '') throw new RuntimeException('location_code_required');
  if ($name === '') throw new RuntimeException('location_name_required');
  if (strlen($name) > 128) $name = substr($name, 0, 128);
  if ($tz === '') $tz = 'Africa/Accra';
  if (strlen($tz) > 64) $tz = substr($tz, 0, 64);

  if ($id > 0) {
    $st = $PDO->prepare("UPDATE locations
                         SET code=:c, name=:n, timezone=:tz, active=:a
                         WHERE id=:id");
    $st->execute([':c'=>$code, ':n'=>$name, ':tz'=>$tz, ':a'=>$active, ':id'=>$id]);
  } else {
    $st = $PDO->prepare(
      "INSERT INTO locations(code,name,timezone,active,is_default)
       VALUES(:c,:n,:tz,:a,0)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         timezone=VALUES(timezone),
         active=VALUES(active)"
    );
    $st->execute([':c'=>$code, ':n'=>$name, ':tz'=>$tz, ':a'=>$active]);
    $id = (int)$PDO->lastInsertId();
    if ($id <= 0) {
      $x = $PDO->prepare("SELECT id FROM locations WHERE code=:c LIMIT 1");
      $x->execute([':c'=>$code]);
      $id = (int)($x->fetchColumn() ?: 0);
    }
  }

  $row = location_find_by_id($id);
  if (!$row) throw new RuntimeException('location_save_failed');
  return $row;
}

function location_profile_set(string $rawMsisdn, int $locationId, ?string $locationCode = null, bool $setSignupIfMissing = false): void {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '' || $locationId <= 0) return;
  location_bootstrap();
  global $PDO;

  if ($locationCode === null || trim($locationCode) === '') {
    $loc = location_find_by_id($locationId);
    $locationCode = $loc ? (string)$loc['code'] : null;
  } else {
    $locationCode = location_normalize_code($locationCode);
  }

  $hasSignupCol = location_db_column_exists($PDO, 'user_location_profiles', 'signup_location_id');
  if ($hasSignupCol) {
    $signupLocationId = $setSignupIfMissing ? $locationId : null;
    $st = $PDO->prepare(
      "INSERT INTO user_location_profiles (msisdn, location_id, signup_location_id, last_location_code)
       VALUES (:m, :l, :s, :c)
       ON DUPLICATE KEY UPDATE
         location_id=VALUES(location_id),
         last_location_code=VALUES(last_location_code),
         signup_location_id=CASE
           WHEN signup_location_id IS NULL OR signup_location_id<=0 THEN VALUES(signup_location_id)
           ELSE signup_location_id
         END"
    );
    $st->execute([':m' => $msisdn, ':l' => $locationId, ':s' => $signupLocationId, ':c' => $locationCode]);
    return;
  }

  $st = $PDO->prepare(
    "INSERT INTO user_location_profiles (msisdn, location_id, last_location_code)
     VALUES (:m, :l, :c)
     ON DUPLICATE KEY UPDATE location_id=VALUES(location_id), last_location_code=VALUES(last_location_code)"
  );
  $st->execute([':m' => $msisdn, ':l' => $locationId, ':c' => $locationCode]);
}

function location_profile_get(string $rawMsisdn): ?array {
  $msisdn = normalize_msisdn($rawMsisdn);
  if ($msisdn === '') return null;
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare(
    "SELECT p.msisdn, p.location_id, p.signup_location_id, p.last_location_code,
            l.code, l.name, l.active,
            ls.code AS signup_code, ls.name AS signup_name, ls.active AS signup_active
     FROM user_location_profiles p
     JOIN locations l ON l.id = p.location_id
     LEFT JOIN locations ls ON ls.id = p.signup_location_id
     WHERE p.msisdn=:m
     LIMIT 1"
  );
  $st->execute([':m' => $msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) return null;
  $row['location_id'] = (int)($row['location_id'] ?? 0);
  $row['signup_location_id'] = (int)($row['signup_location_id'] ?? 0);
  return $row;
}

function location_session_set(?int $locationId, ?string $locationCode = null): void {
  if (session_status() !== PHP_SESSION_ACTIVE) return;
  if ($locationId !== null && $locationId > 0) {
    $_SESSION['location_id'] = $locationId;
  }
  if ($locationCode !== null && trim($locationCode) !== '') {
    $_SESSION['location_code'] = location_normalize_code($locationCode);
  }
}

function location_session_get_id(): ?int {
  if (session_status() !== PHP_SESSION_ACTIVE) return null;
  $id = (int)($_SESSION['location_id'] ?? 0);
  return $id > 0 ? $id : null;
}

function location_session_get_code(): ?string {
  if (session_status() !== PHP_SESSION_ACTIVE) return null;
  $code = location_normalize_code((string)($_SESSION['location_code'] ?? ''));
  return $code !== '' ? $code : null;
}

function location_capture_from_request(): ?array {
  location_bootstrap();

  $rawCode = trim((string)from_any([
    $_POST ?? [],
    $_GET ?? [],
    $_REQUEST ?? [],
  ], 'location_code', from_any([
    $_POST ?? [],
    $_GET ?? [],
    $_REQUEST ?? [],
  ], 'site_code', '')));

  $row = null;
  if ($rawCode !== '') {
    $row = location_find_by_code($rawCode);
  }

  if (!$row) {
    $rawId = trim((string)from_any([
      $_POST ?? [],
      $_GET ?? [],
      $_REQUEST ?? [],
    ], 'location_id', ''));
    if ($rawId !== '' && ctype_digit($rawId)) {
      $row = location_find_by_id((int)$rawId);
    }
  }

  if (!$row) {
    try {
      $row = location_resolve_from_router_context([
        'link_login_only' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'link_login_only', ''),
        'link_login' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'link_login', ''),
        'router_ip' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'router_ip', ''),
        'server_address' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'server_address', ''),
        'exporter_ip' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'exporter_ip', ''),
        'exporter_id' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'exporter_id', ''),
        'router_id' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'router_id', ''),
        'identity' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'identity', ''),
        'nas_id' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'nas_id', ''),
        'nasid' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'nasid', ''),
        'router_name' => (string)from_any([$_REQUEST ?? [], $_GET ?? [], $_POST ?? []], 'router_name', ''),
        'remote_addr' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
        'x_forwarded_for' => (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
      ]);
    } catch (Throwable $e) {
      $row = null;
    }
  }

  if ($row) {
    location_session_set((int)$row['id'], (string)$row['code']);
    return $row;
  }

  return null;
}

function location_resolve_for_user(string $rawMsisdn, ?string $hintCode = null, bool $allowRequestHint = false, string $context = 'general'): array {
  $msisdn = normalize_msisdn($rawMsisdn);
  location_bootstrap();

  $loc = null;
  $profile = null;
  $profileLoc = null;
  $signupLoc = null;
  $hintLoc = null;
  $ctx = strtolower(trim($context));
  if ($ctx === '') $ctx = 'general';
  $preferHint = in_array($ctx, ['login','signup'], true);
  $setSignupIfMissing = in_array($ctx, ['login','signup'], true);

  if ($msisdn !== '') {
    $profile = location_profile_get($msisdn);
    if ($profile) {
      $lid = (int)($profile['location_id'] ?? 0);
      if ($lid > 0) $profileLoc = location_find_by_id($lid);
      $sid = (int)($profile['signup_location_id'] ?? 0);
      if ($sid > 0) $signupLoc = location_find_by_id($sid);
    }
  }

  // Security behavior: only allow request/session hints when explicitly enabled.
  if ($allowRequestHint) {
    if ($hintCode !== null && trim($hintCode) !== '') {
      $hintLoc = location_find_by_code($hintCode);
    }
    if (!$hintLoc) {
      $sid = location_session_get_id();
      if ($sid !== null) $hintLoc = location_find_by_id($sid);
    }
  }

  if ($preferHint && $hintLoc) {
    $loc = $hintLoc;
  } elseif ($profileLoc) {
    $loc = $profileLoc;
  } elseif ($hintLoc) {
    $loc = $hintLoc;
  } elseif ($signupLoc) {
    $loc = $signupLoc;
  }

  if (!$loc) {
    $loc = location_find_by_id(location_default_id());
  }

  $locId = (int)($loc['id'] ?? 0);
  $locCode = (string)($loc['code'] ?? location_default_code());
  if ($locId <= 0) {
    $locId = location_default_id();
    $locCode = (string)(location_find_by_id($locId)['code'] ?? location_default_code());
  }

  location_session_set($locId, $locCode);
  if ($msisdn !== '') {
    $curr = (int)($profile['location_id'] ?? 0);
    $currSignup = (int)($profile['signup_location_id'] ?? 0);
    if (!$profile || $curr !== $locId || ($setSignupIfMissing && $currSignup <= 0)) {
      location_profile_set($msisdn, $locId, $locCode, $setSignupIfMissing);
    }
  }

  return [
    'id' => $locId,
    'code' => $locCode,
    'name' => (string)($loc['name'] ?? 'Default Site'),
    'active' => (int)($loc['active'] ?? 1),
  ];
}

function location_scope_from_input(array $in, bool $allowAll = true): array {
  location_bootstrap();
  $raw = trim((string)from_any([$in, $_GET ?? [], $_POST ?? [], $_REQUEST ?? []], 'location_id', ''));
  if ($raw === '' || strtolower($raw) === 'all' || $raw === '0') {
    if ($allowAll) return ['ok' => true, 'location_id' => null, 'location' => null];
    return ['ok' => false, 'error' => 'location_required'];
  }
  if (!ctype_digit($raw)) return ['ok' => false, 'error' => 'invalid_location_id'];
  $id = (int)$raw;
  if ($id <= 0) return ['ok' => false, 'error' => 'invalid_location_id'];
  $loc = location_find_by_id($id);
  if (!$loc) return ['ok' => false, 'error' => 'location_not_found'];
  return ['ok' => true, 'location_id' => $id, 'location' => $loc];
}

function location_fetch_plan_catalog(?int $locationId, bool $includeInactive = false): array {
  if ($locationId === null || $locationId <= 0) return [];
  location_bootstrap();
  global $PDO;

  $sql = "SELECT
            plan_code AS code,
            COALESCE(NULLIF(display_name,''), plan_code) AS name,
            NULLIF(display_name,'') AS display_name,
            price_cents,
            duration_days,
            quota_bytes,
            rate_limit,
            address_list,
            active,
            location_id
          FROM location_plans
          WHERE location_id = :l";
  if (!$includeInactive) $sql .= " AND active = 1";
  $sql .= " ORDER BY sort_order ASC, price_cents ASC, plan_code ASC";

  $st = $PDO->prepare($sql);
  $st->execute([':l' => $locationId]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($rows as &$row) {
    $row['price_cents'] = isset($row['price_cents']) ? (int)$row['price_cents'] : null;
    $row['duration_days'] = isset($row['duration_days']) ? (int)$row['duration_days'] : 30;
    $row['quota_bytes'] = ($row['quota_bytes'] === null || $row['quota_bytes'] === '') ? null : (int)$row['quota_bytes'];
    $row['active'] = ((int)($row['active'] ?? 0)) === 1;
    $row['location_id'] = (int)($row['location_id'] ?? 0);
    if (($row['address_list'] ?? '') === '') $row['address_list'] = 'HS_ACTIVE';
  }
  unset($row);

  return $rows;
}

function location_upsert_plan(int $locationId, array $plan): void {
  if ($locationId <= 0) throw new RuntimeException('location_required');
  location_bootstrap();
  global $PDO;

  $code = trim((string)($plan['code'] ?? ''));
  if ($code === '') throw new RuntimeException('plan_code_required');
  $display = trim((string)($plan['display_name'] ?? ''));
  $price = (int)($plan['price_cents'] ?? 0);
  $days = max(1, (int)($plan['duration_days'] ?? 30));
  $quota = $plan['quota_bytes'];
  if ($quota !== null && $quota !== '') $quota = (int)$quota;
  else $quota = null;
  $rate = trim((string)($plan['rate_limit'] ?? ''));
  $addr = trim((string)($plan['address_list'] ?? 'HS_ACTIVE'));
  if ($addr === '') $addr = 'HS_ACTIVE';
  $active = !empty($plan['active']) ? 1 : 0;

  $st = $PDO->prepare(
    "INSERT INTO location_plans
      (location_id, plan_code, display_name, price_cents, duration_days, quota_bytes, rate_limit, address_list, active)
     VALUES
      (:l, :c, :d, :p, :days, :q, :r, :a, :ac)
     ON DUPLICATE KEY UPDATE
      display_name=VALUES(display_name),
      price_cents=VALUES(price_cents),
      duration_days=VALUES(duration_days),
      quota_bytes=VALUES(quota_bytes),
      rate_limit=VALUES(rate_limit),
      address_list=VALUES(address_list),
      active=VALUES(active)"
  );
  $st->execute([
    ':l' => $locationId,
    ':c' => $code,
    ':d' => $display !== '' ? $display : null,
    ':p' => $price,
    ':days' => $days,
    ':q' => $quota,
    ':r' => $rate !== '' ? $rate : null,
    ':a' => $addr,
    ':ac' => $active,
  ]);
}

function location_delete_plan(int $locationId, string $planCode): void {
  if ($locationId <= 0) throw new RuntimeException('location_required');
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare("DELETE FROM location_plans WHERE location_id=:l AND plan_code=:c");
  $st->execute([':l' => $locationId, ':c' => $planCode]);
}

function location_nas_ips(int $locationId): array {
  if ($locationId <= 0) return [];
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare(
    "SELECT DISTINCT nas_ip
     FROM location_nas
     WHERE location_id=:l
       AND active=1
       AND nas_ip IS NOT NULL
       AND nas_ip<>''"
  );
  $st->execute([':l' => $locationId]);
  $rows = $st->fetchAll(PDO::FETCH_COLUMN, 0) ?: [];
  $out = [];
  foreach ($rows as $ip) {
    $ip = trim((string)$ip);
    if ($ip !== '') $out[$ip] = true;
  }
  return array_values(array_map(static fn($v): string => (string)$v, array_keys($out)));
}

function location_nas_list(?int $locationId = null): array {
  location_bootstrap();
  global $PDO;
  $sql = "SELECT n.id, n.location_id, l.code AS location_code, l.name AS location_name,
                 COALESCE(n.nas_ip,'') AS nas_ip,
                 COALESCE(n.exporter_ip,'') AS exporter_ip,
                 COALESCE(n.exporter_id,'') AS exporter_id,
                 COALESCE(n.label,'') AS label,
                 n.active, n.created_at
          FROM location_nas n
          JOIN locations l ON l.id=n.location_id";
  $bind = [];
  if ($locationId !== null && $locationId > 0) {
    $sql .= " WHERE n.location_id=:l";
    $bind[':l'] = $locationId;
  }
  $sql .= " ORDER BY n.location_id ASC, n.id ASC";
  $st = $PDO->prepare($sql);
  $st->execute($bind);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  foreach ($rows as &$r) {
    $r['id'] = (int)($r['id'] ?? 0);
    $r['location_id'] = (int)($r['location_id'] ?? 0);
    $r['active'] = (int)($r['active'] ?? 0);
  }
  unset($r);
  return $rows;
}

function location_nas_save(array $in): array {
  location_bootstrap();
  global $PDO;

  $id = (int)($in['id'] ?? 0);
  $locationId = (int)($in['location_id'] ?? 0);
  $nasIp = trim((string)($in['nas_ip'] ?? ''));
  $exporterIp = trim((string)($in['exporter_ip'] ?? ''));
  $exporterId = trim((string)($in['exporter_id'] ?? ''));
  $label = trim((string)($in['label'] ?? ''));
  $active = !empty($in['active']) ? 1 : 0;

  if ($locationId <= 0 || !location_find_by_id($locationId)) throw new RuntimeException('location_required');
  if ($nasIp !== '' && !filter_var($nasIp, FILTER_VALIDATE_IP)) throw new RuntimeException('invalid_nas_ip');
  if ($exporterIp !== '' && !filter_var($exporterIp, FILTER_VALIDATE_IP)) throw new RuntimeException('invalid_exporter_ip');
  if ($nasIp === '' && $exporterIp === '' && $exporterId === '') throw new RuntimeException('mapping_identity_required');
  if (strlen($label) > 128) $label = substr($label, 0, 128);

  if ($id <= 0) {
    $conds = [];
    $bind = [':l' => $locationId];
    if ($nasIp !== '') {
      $conds[] = "(nas_ip IS NOT NULL AND nas_ip=:n)";
      $bind[':n'] = $nasIp;
    }
    if ($exporterIp !== '') {
      $conds[] = "(exporter_ip IS NOT NULL AND exporter_ip=:eip)";
      $bind[':eip'] = $exporterIp;
    }
    if ($exporterId !== '') {
      $conds[] = "(exporter_id IS NOT NULL AND exporter_id=:eid)";
      $bind[':eid'] = $exporterId;
    }
    if ($conds) {
      $st = $PDO->prepare(
        "SELECT id
         FROM location_nas
         WHERE location_id=:l
           AND (" . implode(' OR ', $conds) . ")
         ORDER BY id ASC
         LIMIT 1"
      );
      $st->execute($bind);
      $existing = (int)($st->fetchColumn() ?: 0);
      if ($existing > 0) $id = $existing;
    }
  }

  if ($id > 0) {
    $st = $PDO->prepare("UPDATE location_nas
                         SET location_id=:l, nas_ip=:n, exporter_ip=:eip, exporter_id=:eid, label=:lb, active=:a
                         WHERE id=:id");
    $st->execute([
      ':l'=>$locationId, ':n'=>$nasIp !== '' ? $nasIp : null, ':eip'=>$exporterIp !== '' ? $exporterIp : null,
      ':eid'=>$exporterId !== '' ? $exporterId : null, ':lb'=>$label !== '' ? $label : null, ':a'=>$active, ':id'=>$id
    ]);
  } else {
    $st = $PDO->prepare("INSERT INTO location_nas(location_id,nas_ip,exporter_ip,exporter_id,label,active)
                         VALUES(:l,:n,:eip,:eid,:lb,:a)");
    $st->execute([
      ':l'=>$locationId, ':n'=>$nasIp !== '' ? $nasIp : null, ':eip'=>$exporterIp !== '' ? $exporterIp : null,
      ':eid'=>$exporterId !== '' ? $exporterId : null, ':lb'=>$label !== '' ? $label : null, ':a'=>$active
    ]);
    $id = (int)$PDO->lastInsertId();
  }

  $st = $PDO->prepare(
    "SELECT n.id, n.location_id, l.code AS location_code, l.name AS location_name,
            COALESCE(n.nas_ip,'') AS nas_ip, COALESCE(n.exporter_ip,'') AS exporter_ip,
            COALESCE(n.exporter_id,'') AS exporter_id, COALESCE(n.label,'') AS label,
            n.active, n.created_at
     FROM location_nas n
     JOIN locations l ON l.id=n.location_id
     WHERE n.id=:id
     LIMIT 1"
  );
  $st->execute([':id'=>$id]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) throw new RuntimeException('mapping_save_failed');
  $row['id'] = (int)($row['id'] ?? 0);
  $row['location_id'] = (int)($row['location_id'] ?? 0);
  $row['active'] = (int)($row['active'] ?? 0);
  try {
    location_router_discovery_mark_assigned(
      $row['location_id'],
      (string)($row['nas_ip'] ?? ''),
      (string)($row['exporter_ip'] ?? ''),
      (string)($row['exporter_id'] ?? ''),
      (int)($row['id'] ?? 0),
      null
    );
  } catch (Throwable $e) { /* non-fatal */ }
  return $row;
}

function location_nas_delete(int $id): void {
  if ($id <= 0) throw new RuntimeException('mapping_id_required');
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare("DELETE FROM location_nas WHERE id=:id");
  $st->execute([':id'=>$id]);
}

function location_is_loopback_ip(string $raw): bool {
  $ip = trim($raw);
  if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) return false;
  if ($ip === '::1') return true;
  if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    return str_starts_with($ip, '127.');
  }
  return false;
}

function location_router_discovery_norm_ip(string $raw): string {
  $ip = trim($raw);
  if ($ip === '' || strpos($ip, '$(') !== false) return '';
  if (!filter_var($ip, FILTER_VALIDATE_IP)) return '';
  if (location_is_loopback_ip($ip)) return '';
  return $ip;
}

function location_router_discovery_norm_id(string $raw): string {
  $id = trim($raw);
  if ($id === '' || strpos($id, '$(') !== false) return '';
  $id = preg_replace('/\s+/', ' ', $id) ?? '';
  if ($id === '') return '';
  if (strlen($id) > 64) $id = substr($id, 0, 64);
  return $id;
}

function location_router_discovery_identity_key(array $in): string {
  $exporterId = strtolower(trim((string)($in['exporter_id'] ?? '')));
  $nasIp = strtolower(trim((string)($in['nas_ip'] ?? '')));
  $exporterIp = strtolower(trim((string)($in['exporter_ip'] ?? '')));
  $routerIpHint = strtolower(trim((string)($in['router_ip_hint'] ?? '')));
  $hostIp = strtolower(trim((string)($in['host_ip'] ?? '')));

  if ($exporterId !== '') return hash('sha256', 'exporter_id|'.$exporterId);
  if ($nasIp !== '') return hash('sha256', 'nas_ip|'.$nasIp);
  if ($exporterIp !== '') return hash('sha256', 'exporter_ip|'.$exporterIp);
  if ($routerIpHint !== '') return hash('sha256', 'router_ip_hint|'.$routerIpHint);
  if ($hostIp !== '') return hash('sha256', 'host_ip|'.$hostIp);

  return hash('sha256', 'empty');
}

function location_router_discovery_capture(array $in): ?array {
  $nasIp = location_router_discovery_norm_ip((string)($in['nas_ip'] ?? ''));
  $exporterIp = location_router_discovery_norm_ip((string)($in['exporter_ip'] ?? ''));
  $exporterId = location_router_discovery_norm_id((string)($in['exporter_id'] ?? ''));
  $routerIpHint = location_router_discovery_norm_ip((string)($in['router_ip_hint'] ?? ''));
  $hostIp = location_router_discovery_norm_ip((string)($in['host_ip'] ?? ''));
  $remoteAddr = location_router_discovery_norm_ip((string)($in['remote_addr'] ?? ''));
  $xff = trim((string)($in['x_forwarded_for'] ?? ''));
  if (strlen($xff) > 255) $xff = substr($xff, 0, 255);
  $linkLoginOnly = trim((string)($in['link_login_only'] ?? ''));
  if (strlen($linkLoginOnly) > 255) $linkLoginOnly = substr($linkLoginOnly, 0, 255);
  $source = trim((string)($in['source'] ?? 'router_context'));
  if ($source === '') $source = 'router_context';
  if (strlen($source) > 32) $source = substr($source, 0, 32);

  if ($nasIp === '' && $exporterIp === '' && $exporterId === '' && $routerIpHint === '' && $hostIp === '') {
    return null;
  }
  $row = [
    'nas_ip' => $nasIp,
    'exporter_ip' => $exporterIp,
    'exporter_id' => $exporterId,
    'router_ip_hint' => $routerIpHint,
    'host_ip' => $hostIp,
    'remote_addr' => $remoteAddr,
    'x_forwarded_for' => $xff,
    'link_login_only' => $linkLoginOnly,
    'source' => $source,
  ];
  $row['identity_key'] = location_router_discovery_identity_key($row);
  return $row;
}

function location_router_discovery_track(array $in, ?array $resolvedLocation = null): void {
  location_bootstrap();
  global $PDO;

  $cap = location_router_discovery_capture($in);
  if (!$cap) return;

  $locId = (int)($resolvedLocation['id'] ?? 0);
  $status = $locId > 0 ? 'assigned' : 'pending';
  $mappingId = isset($resolvedLocation['mapping_id']) ? (int)$resolvedLocation['mapping_id'] : null;
  if ($mappingId !== null && $mappingId <= 0) $mappingId = null;

  $st = $PDO->prepare(
    "INSERT INTO location_router_discovery
      (identity_key, nas_ip, exporter_ip, exporter_id, host_ip, router_ip_hint, remote_addr, x_forwarded_for, link_login_only, source, status, note, first_seen_at, last_seen_at, seen_count, assigned_location_id, assigned_mapping_id, assigned_by, assigned_at)
     VALUES
      (:k, :n, :eip, :eid, :h, :rh, :ra, :xff, :llo, :src, :st, NULL, NOW(), NOW(), 1, :loc, :mid, NULL, CASE WHEN :loc IS NULL THEN NULL ELSE NOW() END)
     ON DUPLICATE KEY UPDATE
      last_seen_at=NOW(),
      seen_count=seen_count+1,
      nas_ip=CASE WHEN COALESCE(location_router_discovery.nas_ip,'')='' THEN VALUES(nas_ip) ELSE location_router_discovery.nas_ip END,
      exporter_ip=CASE WHEN COALESCE(location_router_discovery.exporter_ip,'')='' THEN VALUES(exporter_ip) ELSE location_router_discovery.exporter_ip END,
      exporter_id=CASE WHEN COALESCE(location_router_discovery.exporter_id,'')='' THEN VALUES(exporter_id) ELSE location_router_discovery.exporter_id END,
      host_ip=CASE WHEN COALESCE(location_router_discovery.host_ip,'')='' THEN VALUES(host_ip) ELSE location_router_discovery.host_ip END,
      router_ip_hint=CASE WHEN COALESCE(location_router_discovery.router_ip_hint,'')='' THEN VALUES(router_ip_hint) ELSE location_router_discovery.router_ip_hint END,
      remote_addr=CASE WHEN COALESCE(location_router_discovery.remote_addr,'')='' THEN VALUES(remote_addr) ELSE location_router_discovery.remote_addr END,
      x_forwarded_for=CASE WHEN COALESCE(location_router_discovery.x_forwarded_for,'')='' THEN VALUES(x_forwarded_for) ELSE location_router_discovery.x_forwarded_for END,
      link_login_only=CASE WHEN COALESCE(location_router_discovery.link_login_only,'')='' THEN VALUES(link_login_only) ELSE location_router_discovery.link_login_only END,
      source=VALUES(source),
      status=CASE
        WHEN location_router_discovery.status='ignored' THEN 'ignored'
        WHEN COALESCE(location_router_discovery.assigned_location_id, VALUES(assigned_location_id)) IS NOT NULL THEN 'assigned'
        ELSE 'pending'
      END,
      assigned_location_id=COALESCE(location_router_discovery.assigned_location_id, VALUES(assigned_location_id)),
      assigned_mapping_id=COALESCE(location_router_discovery.assigned_mapping_id, VALUES(assigned_mapping_id)),
      assigned_at=CASE
        WHEN COALESCE(location_router_discovery.assigned_location_id, VALUES(assigned_location_id)) IS NOT NULL
          THEN COALESCE(location_router_discovery.assigned_at, NOW())
        ELSE location_router_discovery.assigned_at
      END"
  );
  $st->execute([
    ':k' => $cap['identity_key'],
    ':n' => $cap['nas_ip'] !== '' ? $cap['nas_ip'] : null,
    ':eip' => $cap['exporter_ip'] !== '' ? $cap['exporter_ip'] : null,
    ':eid' => $cap['exporter_id'] !== '' ? $cap['exporter_id'] : null,
    ':h' => $cap['host_ip'] !== '' ? $cap['host_ip'] : null,
    ':rh' => $cap['router_ip_hint'] !== '' ? $cap['router_ip_hint'] : null,
    ':ra' => $cap['remote_addr'] !== '' ? $cap['remote_addr'] : null,
    ':xff' => $cap['x_forwarded_for'] !== '' ? $cap['x_forwarded_for'] : null,
    ':llo' => $cap['link_login_only'] !== '' ? $cap['link_login_only'] : null,
    ':src' => $cap['source'],
    ':st' => $status,
    ':loc' => $locId > 0 ? $locId : null,
    ':mid' => $mappingId,
  ]);
}

function location_discovery_list(?int $locationId = null, bool $onlyUnassigned = true, int $limit = 200): array {
  location_bootstrap();
  global $PDO;
  $limit = max(1, min(1000, $limit));
  if ($onlyUnassigned) {
    try {
      location_router_discovery_reconcile_known();
    } catch (Throwable $e) { /* non-fatal */ }
  }

  $sql = "SELECT id, identity_key, nas_ip, exporter_ip, exporter_id, host_ip, router_ip_hint,
                 remote_addr, x_forwarded_for, link_login_only, source, status, note,
                 first_seen_at, last_seen_at, seen_count, assigned_location_id, assigned_mapping_id,
                 assigned_by, assigned_at
          FROM location_router_discovery d
          WHERE 1=1";
  $bind = [];
  if ($onlyUnassigned) {
    $sql .= " AND (d.assigned_location_id IS NULL OR d.assigned_location_id=0)
              AND d.status<>'ignored'
              AND NOT EXISTS (
                SELECT 1
                FROM location_nas n
                JOIN locations l ON l.id=n.location_id AND l.active=1
                WHERE n.active=1
                  AND (
                    (COALESCE(d.nas_ip,'')<>'' AND d.nas_ip=n.nas_ip)
                    OR (COALESCE(d.exporter_ip,'')<>'' AND d.exporter_ip=n.exporter_ip)
                    OR (COALESCE(d.exporter_id,'')<>'' AND d.exporter_id=n.exporter_id)
                    OR (COALESCE(d.host_ip,'')<>'' AND d.host_ip=n.nas_ip)
                    OR (COALESCE(d.router_ip_hint,'')<>'' AND d.router_ip_hint=n.nas_ip)
                  )
              )";
  }
  if (!$onlyUnassigned && $locationId !== null && $locationId > 0) {
    $sql .= " AND d.assigned_location_id=:l";
    $bind[':l'] = $locationId;
  }
  $sql .= " ORDER BY d.last_seen_at DESC, d.id DESC LIMIT :lim";

  $st = $PDO->prepare($sql);
  foreach ($bind as $k => $v) $st->bindValue($k, $v, PDO::PARAM_INT);
  $st->bindValue(':lim', $limit, PDO::PARAM_INT);
  $st->execute();
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  foreach ($rows as &$row) {
    $row['id'] = (int)($row['id'] ?? 0);
    $row['seen_count'] = (int)($row['seen_count'] ?? 0);
    $row['assigned_location_id'] = (int)($row['assigned_location_id'] ?? 0);
    $row['assigned_mapping_id'] = (int)($row['assigned_mapping_id'] ?? 0);
  }
  unset($row);
  return $rows;
}

function location_router_discovery_list(?int $locationId = null, bool $onlyUnassigned = true, int $limit = 200): array {
  return location_discovery_list($locationId, $onlyUnassigned, $limit);
}

function location_discovery_find(int $id): ?array {
  if ($id <= 0) return null;
  location_bootstrap();
  global $PDO;
  $st = $PDO->prepare(
    "SELECT id, identity_key, nas_ip, exporter_ip, exporter_id, host_ip, router_ip_hint,
            remote_addr, x_forwarded_for, link_login_only, source, status, note,
            first_seen_at, last_seen_at, seen_count, assigned_location_id, assigned_mapping_id,
            assigned_by, assigned_at
     FROM location_router_discovery
     WHERE id=:id
     LIMIT 1"
  );
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) return null;
  $row['id'] = (int)($row['id'] ?? 0);
  $row['seen_count'] = (int)($row['seen_count'] ?? 0);
  $row['assigned_location_id'] = (int)($row['assigned_location_id'] ?? 0);
  $row['assigned_mapping_id'] = (int)($row['assigned_mapping_id'] ?? 0);
  return $row;
}

function location_discovery_assign(int $id, int $locationId, ?string $assignedBy = null): array {
  if ($id <= 0) throw new RuntimeException('discovery_id_required');
  if ($locationId <= 0 || !location_find_by_id($locationId)) throw new RuntimeException('location_required');
  location_bootstrap();
  global $PDO;

  $row = location_discovery_find($id);
  if (!$row) throw new RuntimeException('discovery_not_found');

  $nas = trim((string)($row['nas_ip'] ?? ''));
  $eip = trim((string)($row['exporter_ip'] ?? ''));
  $eid = trim((string)($row['exporter_id'] ?? ''));
  if ($nas === '' && $eip === '' && $eid === '') throw new RuntimeException('mapping_identity_required');

  $label = trim((string)($row['note'] ?? ''));
  if ($label === '') {
    $hint = trim((string)($row['router_ip_hint'] ?? ''));
    if ($hint !== '') $label = 'Auto-detected '.$hint;
    elseif ($eid !== '') $label = 'Auto-detected '.$eid;
    elseif ($nas !== '') $label = 'Auto-detected '.$nas;
    else $label = 'Auto-detected router';
  }
  if (strlen($label) > 128) $label = substr($label, 0, 128);

  $existingId = 0;
  $st = $PDO->prepare(
    "SELECT id
     FROM location_nas
     WHERE COALESCE(nas_ip,'')=:n
       AND COALESCE(exporter_ip,'')=:eip
       AND COALESCE(exporter_id,'')=:eid
     ORDER BY id ASC
     LIMIT 1"
  );
  $st->execute([':n' => $nas, ':eip' => $eip, ':eid' => $eid]);
  $existingId = (int)($st->fetchColumn() ?: 0);

  $mapInput = [
    'location_id' => $locationId,
    'nas_ip' => $nas,
    'exporter_ip' => $eip,
    'exporter_id' => $eid,
    'label' => $label,
    'active' => 1,
  ];
  if ($existingId > 0) $mapInput['id'] = $existingId;
  $mapping = location_nas_save($mapInput);
  $mappingId = (int)($mapping['id'] ?? 0);

  if ($assignedBy !== null && strlen($assignedBy) > 64) $assignedBy = substr($assignedBy, 0, 64);
  $up = $PDO->prepare(
    "UPDATE location_router_discovery
     SET status='assigned',
         assigned_location_id=:l,
         assigned_mapping_id=:m,
         assigned_by=:u,
         assigned_at=NOW()
     WHERE id=:id"
  );
  $up->execute([
    ':l' => $locationId,
    ':m' => $mappingId > 0 ? $mappingId : null,
    ':u' => ($assignedBy !== null && trim($assignedBy) !== '') ? trim($assignedBy) : null,
    ':id' => $id,
  ]);

  $discovery = location_discovery_find($id);
  return [
    'discovery' => $discovery ?: [],
    'mapping' => $mapping,
  ];
}

function location_discovery_ignore(int $id, ?string $note = null, ?string $by = null): void {
  if ($id <= 0) throw new RuntimeException('discovery_id_required');
  location_bootstrap();
  global $PDO;
  $noteVal = $note !== null ? trim($note) : null;
  if ($noteVal !== null && strlen($noteVal) > 255) $noteVal = substr($noteVal, 0, 255);
  $byVal = $by !== null ? trim($by) : null;
  if ($byVal !== null && strlen($byVal) > 64) $byVal = substr($byVal, 0, 64);

  $st = $PDO->prepare(
    "UPDATE location_router_discovery
     SET status='ignored',
         note=CASE WHEN :note IS NULL OR :note='' THEN note ELSE :note END,
         assigned_by=CASE WHEN :by IS NULL OR :by='' THEN assigned_by ELSE :by END,
         assigned_at=NOW()
     WHERE id=:id"
  );
  $st->execute([':note' => $noteVal, ':by' => $byVal, ':id' => $id]);
}

function location_router_discovery_mark_assigned(
  int $locationId,
  string $nasIp = '',
  string $exporterIp = '',
  string $exporterId = '',
  ?int $mappingId = null,
  ?string $by = null
): void {
  if ($locationId <= 0) return;
  location_bootstrap();
  global $PDO;

  $nasIp = location_router_discovery_norm_ip($nasIp);
  $exporterIp = location_router_discovery_norm_ip($exporterIp);
  $exporterId = location_router_discovery_norm_id($exporterId);
  if ($nasIp === '' && $exporterIp === '' && $exporterId === '') return;
  $byVal = $by !== null ? trim($by) : '';
  if (strlen($byVal) > 64) $byVal = substr($byVal, 0, 64);

  $conds = [];
  $bind = [':l' => $locationId];
  if ($mappingId !== null && $mappingId > 0) $bind[':m'] = $mappingId;
  $bind[':by'] = $byVal !== '' ? $byVal : null;
  if ($nasIp !== '') {
    $conds[] = "nas_ip=:n";
    $bind[':n'] = $nasIp;
  }
  if ($exporterIp !== '') {
    $conds[] = "exporter_ip=:eip";
    $bind[':eip'] = $exporterIp;
  }
  if ($exporterId !== '') {
    $conds[] = "exporter_id=:eid";
    $bind[':eid'] = $exporterId;
  }
  if (!$conds) return;
  $bind[':m'] = ($mappingId !== null && $mappingId > 0) ? $mappingId : null;

  $sql = "UPDATE location_router_discovery
          SET status='assigned',
              assigned_location_id=:l,
              assigned_mapping_id=CASE WHEN :m IS NULL THEN assigned_mapping_id ELSE :m END,
              assigned_by=CASE WHEN :by IS NULL OR :by='' THEN assigned_by ELSE :by END,
              assigned_at=COALESCE(assigned_at, NOW()),
              last_seen_at=NOW()
          WHERE " . implode(" OR ", $conds);
  $st = $PDO->prepare($sql);
  $st->execute($bind);
}

function location_router_discovery_reconcile_known(): void {
  location_bootstrap();
  global $PDO;

  // Local app probes are not routers and should never appear as unassigned MikroTiks.
  $PDO->exec(
    "UPDATE location_router_discovery
     SET status='ignored',
         note=COALESCE(note, 'Ignored loopback router context'),
         assigned_at=COALESCE(assigned_at, NOW())
     WHERE status<>'ignored'
       AND COALESCE(assigned_location_id,0)=0
       AND (
         nas_ip='::1' OR exporter_ip='::1' OR host_ip='::1' OR router_ip_hint='::1'
         OR nas_ip LIKE '127.%'
         OR exporter_ip LIKE '127.%'
         OR host_ip LIKE '127.%'
         OR router_ip_hint LIKE '127.%'
       )
       AND COALESCE(exporter_id,'')=''"
  );

  // If a discovery fingerprint already matches a router map, mark it assigned.
  $PDO->exec(
    "UPDATE location_router_discovery d
     JOIN location_nas n
       ON n.active=1
      AND (
        (COALESCE(d.nas_ip,'')<>'' AND d.nas_ip=n.nas_ip)
        OR (COALESCE(d.exporter_ip,'')<>'' AND d.exporter_ip=n.exporter_ip)
        OR (COALESCE(d.exporter_id,'')<>'' AND d.exporter_id=n.exporter_id)
        OR (COALESCE(d.host_ip,'')<>'' AND d.host_ip=n.nas_ip)
        OR (COALESCE(d.router_ip_hint,'')<>'' AND d.router_ip_hint=n.nas_ip)
      )
     JOIN locations l ON l.id=n.location_id AND l.active=1
     SET d.status='assigned',
         d.assigned_location_id=n.location_id,
         d.assigned_mapping_id=n.id,
         d.assigned_at=COALESCE(d.assigned_at, NOW())
     WHERE d.status<>'ignored'
       AND COALESCE(d.assigned_location_id,0)=0"
  );

  // Legacy rows may have been assigned before a complete router map existed.
  // Keep later fingerprints for the same router from reappearing as pending.
  $PDO->exec(
    "UPDATE location_router_discovery d
     JOIN location_router_discovery a
       ON a.id<>d.id
      AND a.status='assigned'
      AND COALESCE(a.assigned_location_id,0)>0
      AND (
        (COALESCE(d.nas_ip,'')<>'' AND d.nas_ip=a.nas_ip)
        OR (COALESCE(d.exporter_ip,'')<>'' AND d.exporter_ip=a.exporter_ip)
        OR (COALESCE(d.exporter_id,'')<>'' AND d.exporter_id=a.exporter_id)
        OR (COALESCE(d.host_ip,'')<>'' AND (d.host_ip=a.host_ip OR d.host_ip=a.nas_ip OR d.host_ip=a.router_ip_hint))
        OR (COALESCE(d.router_ip_hint,'')<>'' AND (d.router_ip_hint=a.router_ip_hint OR d.router_ip_hint=a.nas_ip OR d.router_ip_hint=a.host_ip))
      )
     JOIN locations l ON l.id=a.assigned_location_id AND l.active=1
     SET d.status='assigned',
         d.assigned_location_id=a.assigned_location_id,
         d.assigned_mapping_id=COALESCE(d.assigned_mapping_id, a.assigned_mapping_id),
         d.assigned_by=COALESCE(d.assigned_by, a.assigned_by),
         d.assigned_at=COALESCE(d.assigned_at, NOW())
     WHERE d.status<>'ignored'
       AND COALESCE(d.assigned_location_id,0)=0"
  );
}

function location_resolve_assigned_discovery_context(array $ips, array $ids): ?array {
  location_bootstrap();
  global $PDO;

  $ips = array_values(array_filter(array_unique(array_map(static function($v): string {
    $ip = trim((string)$v);
    return ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP) && !location_is_loopback_ip($ip)) ? $ip : '';
  }, $ips))));
  $ids = array_values(array_filter(array_unique(array_map(static function($v): string {
    $id = location_router_discovery_norm_id((string)$v);
    return $id;
  }, $ids))));
  if (!$ips && !$ids) return null;

  $conds = [];
  $params = [];
  if ($ids) {
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $conds[] = "d.exporter_id IN ({$ph})";
    array_push($params, ...$ids);
  }
  if ($ips) {
    $ph = implode(',', array_fill(0, count($ips), '?'));
    $conds[] = "(d.nas_ip IN ({$ph}) OR d.exporter_ip IN ({$ph}) OR d.host_ip IN ({$ph}) OR d.router_ip_hint IN ({$ph}))";
    array_push($params, ...$ips, ...$ips, ...$ips, ...$ips);
  }
  if (!$conds) return null;

  $sql = "SELECT l.id, l.code, l.name, l.active, d.assigned_mapping_id
          FROM location_router_discovery d
          JOIN locations l ON l.id=d.assigned_location_id
          WHERE d.status='assigned'
            AND COALESCE(d.assigned_location_id,0)>0
            AND l.active=1
            AND (" . implode(' OR ', $conds) . ")
          ORDER BY d.last_seen_at DESC, d.id DESC
          LIMIT 1";
  $st = $PDO->prepare($sql);
  $st->execute($params);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) return null;

  return [
    'id' => (int)($row['id'] ?? 0),
    'code' => (string)($row['code'] ?? ''),
    'name' => (string)($row['name'] ?? ''),
    'active' => (int)($row['active'] ?? 0),
    'mapping_id' => (int)($row['assigned_mapping_id'] ?? 0),
  ];
}

function location_is_private_or_reserved_ip(string $raw): bool {
  $ip = trim($raw);
  if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) return false;
  return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
}

function location_link_host_ip(string $link): ?string {
  $u = parse_url(trim($link));
  if (!$u || empty($u['host'])) return null;
  $h = trim((string)$u['host']);
  if ($h === '') return null;
  if (filter_var($h, FILTER_VALIDATE_IP)) return $h;
  return null;
}

function location_resolve_from_router_context(array $in = []): ?array {
  location_bootstrap();
  global $PDO;

  $ipCands = [];
  $idCands = [];
  $addIp = static function(string $raw) use (&$ipCands): void {
    $ip = trim((string)$raw);
    if ($ip === '' || strpos($ip, '$(') !== false) return;
    if (!filter_var($ip, FILTER_VALIDATE_IP)) return;
    if (location_is_loopback_ip($ip)) return;
    $ipCands[$ip] = true;
  };
  $addId = static function(string $raw) use (&$idCands): void {
    $id = trim((string)$raw);
    if ($id === '' || strpos($id, '$(') !== false) return;
    if (strlen($id) > 64) $id = substr($id, 0, 64);
    if ($id === '') return;
    $idCands[$id] = true;
  };
  $fetchLoc = static function(string $sql, array $params) use ($PDO): ?array {
    $st = $PDO->prepare($sql);
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$row) return null;
    $out = [
      'id' => (int)($row['id'] ?? 0),
      'code' => (string)($row['code'] ?? ''),
      'name' => (string)($row['name'] ?? ''),
      'active' => (int)($row['active'] ?? 0),
    ];
    if (array_key_exists('mapping_id', $row)) $out['mapping_id'] = (int)($row['mapping_id'] ?? 0);
    return $out;
  };

  $remoteAddr = (string)($in['remote_addr'] ?? ($_SERVER['REMOTE_ADDR'] ?? ''));
  $xff = (string)($in['x_forwarded_for'] ?? ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
  $routerIp = (string)($in['router_ip'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'router_ip', ''));
  $serverAddress = (string)($in['server_address'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'server_address', ''));
  $exporterIpHint = (string)($in['exporter_ip'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'exporter_ip', ''));

  // Prioritize router-owned context first.
  $addIp($routerIp);
  $addIp($serverAddress);
  $addIp($exporterIpHint);
  $addId((string)($in['router_id'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'router_id', '')));
  $addId((string)($in['exporter_id'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'exporter_id', '')));
  $addId((string)($in['identity'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'identity', '')));
  $addId((string)($in['nas_id'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'nas_id', '')));
  $addId((string)($in['nasid'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'nasid', '')));
  $addId((string)($in['router_name'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'router_name', '')));

  $hostIp = location_link_host_ip((string)($in['link_login_only'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'link_login_only', '')));
  if ($hostIp !== null) $addIp($hostIp);
  $hostIp2 = location_link_host_ip((string)($in['link_login'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'link_login', '')));
  if ($hostIp2 !== null) $addIp($hostIp2);

  // Client IPs are noisy; only trust private/reserved addresses as weak hints.
  if (location_is_private_or_reserved_ip($remoteAddr)) {
    $addIp($remoteAddr);
  }
  if ($xff !== '') {
    foreach (explode(',', $xff) as $p) {
      $p = trim((string)$p);
      if (location_is_private_or_reserved_ip($p)) $addIp($p);
    }
  }

  $ips = array_keys($ipCands);
  $ids = array_keys($idCands);

  $primaryNas = '';
  if (filter_var(trim($routerIp), FILTER_VALIDATE_IP)) $primaryNas = trim($routerIp);
  elseif (filter_var(trim($serverAddress), FILTER_VALIDATE_IP)) $primaryNas = trim($serverAddress);
  elseif ($hostIp !== null) $primaryNas = (string)$hostIp;
  elseif ($hostIp2 !== null) $primaryNas = (string)$hostIp2;
  elseif ($ips) $primaryNas = (string)$ips[0];
  $primaryExporterIp = filter_var(trim($exporterIpHint), FILTER_VALIDATE_IP) ? trim($exporterIpHint) : '';
  $primaryExporterId = (string)($ids[0] ?? '');

  $trackDiscovery = static function(?array $resolvedLocation = null) use (
    $primaryNas,
    $primaryExporterIp,
    $primaryExporterId,
    $routerIp,
    $hostIp,
    $hostIp2,
    $remoteAddr,
    $xff,
    $in
  ): void {
    try {
      location_router_discovery_track([
        'nas_ip' => $primaryNas,
        'exporter_ip' => $primaryExporterIp,
        'exporter_id' => $primaryExporterId,
        'router_ip_hint' => $routerIp,
        'host_ip' => $hostIp ?? $hostIp2 ?? '',
        'remote_addr' => $remoteAddr,
        'x_forwarded_for' => $xff,
        'link_login_only' => (string)($in['link_login_only'] ?? from_any([$in, $_POST ?? [], $_GET ?? [], $_REQUEST ?? []], 'link_login_only', '')),
        'source' => (string)($in['source'] ?? 'router_context'),
      ], $resolvedLocation);
    } catch (Throwable $e) { /* non-fatal */ }
  };

  if (!$ips && !$ids) return null;

  if ($ids) {
    $idPh = implode(',', array_fill(0, count($ids), '?'));

    // Prefer mapping where both identity and IP context match.
    if ($ips) {
      $ipPh = implode(',', array_fill(0, count($ips), '?'));
      $sql = "SELECT l.id, l.code, l.name, l.active, n.id AS mapping_id
              FROM location_nas n
              JOIN locations l ON l.id = n.location_id
              WHERE n.active=1
                AND l.active=1
                AND n.exporter_id IN ({$idPh})
                AND (
                  (n.nas_ip IS NOT NULL AND n.nas_ip<>'' AND n.nas_ip IN ({$ipPh}))
                  OR
                  (n.exporter_ip IS NOT NULL AND n.exporter_ip<>'' AND n.exporter_ip IN ({$ipPh}))
                )
              ORDER BY n.id ASC
              LIMIT 1";
      $m = $fetchLoc($sql, array_merge($ids, $ips, $ips));
      if ($m) {
        $mid = (int)($m['mapping_id'] ?? 0);
        $trackDiscovery($m);
        try {
          location_router_discovery_mark_assigned((int)($m['id'] ?? 0), $primaryNas, $primaryExporterIp, $primaryExporterId, $mid > 0 ? $mid : null, null);
        } catch (Throwable $e) { /* non-fatal */ }
        unset($m['mapping_id']);
        return $m;
      }
    }

    // Fallback: identity-only mapping.
    $sql = "SELECT l.id, l.code, l.name, l.active, n.id AS mapping_id
            FROM location_nas n
            JOIN locations l ON l.id = n.location_id
            WHERE n.active=1
              AND l.active=1
              AND n.exporter_id IN ({$idPh})
            ORDER BY n.id ASC
            LIMIT 1";
    $m = $fetchLoc($sql, $ids);
    if ($m) {
      $mid = (int)($m['mapping_id'] ?? 0);
      $trackDiscovery($m);
      try {
        location_router_discovery_mark_assigned((int)($m['id'] ?? 0), $primaryNas, $primaryExporterIp, $primaryExporterId, $mid > 0 ? $mid : null, null);
      } catch (Throwable $e) { /* non-fatal */ }
      unset($m['mapping_id']);
      return $m;
    }
  }

  if ($ips) {
    $ipPh = implode(',', array_fill(0, count($ips), '?'));
    $sql = "SELECT l.id, l.code, l.name, l.active, n.id AS mapping_id
            FROM location_nas n
            JOIN locations l ON l.id = n.location_id
            WHERE n.active=1
              AND l.active=1
              AND (
                (n.nas_ip IS NOT NULL AND n.nas_ip<>'' AND n.nas_ip IN ({$ipPh}))
                OR
                (n.exporter_ip IS NOT NULL AND n.exporter_ip<>'' AND n.exporter_ip IN ({$ipPh}))
              )
            ORDER BY n.id ASC
            LIMIT 1";
    $m = $fetchLoc($sql, array_merge($ips, $ips));
    if ($m) {
      $mid = (int)($m['mapping_id'] ?? 0);
      $trackDiscovery($m);
      try {
        location_router_discovery_mark_assigned((int)($m['id'] ?? 0), $primaryNas, $primaryExporterIp, $primaryExporterId, $mid > 0 ? $mid : null, null);
      } catch (Throwable $e) { /* non-fatal */ }
      unset($m['mapping_id']);
      return $m;
    }
  }

  $m = location_resolve_assigned_discovery_context($ips, $ids);
  if ($m) {
    $trackDiscovery($m);
    try {
      $mid = (int)($m['mapping_id'] ?? 0);
      location_router_discovery_mark_assigned((int)($m['id'] ?? 0), $primaryNas, $primaryExporterIp, $primaryExporterId, $mid > 0 ? $mid : null, null);
    } catch (Throwable $e) { /* non-fatal */ }
    unset($m['mapping_id']);
    return $m;
  }

  $trackDiscovery(null);
  return null;
}

function location_exporter_map(?int $locationId = null): array {
  location_bootstrap();
  global $PDO;

  $sql = "SELECT n.location_id, l.code AS location_code,
                 TRIM(COALESCE(n.exporter_ip,'')) AS exporter_ip,
                 TRIM(COALESCE(n.exporter_id,'')) AS exporter_id
          FROM location_nas n
          JOIN locations l ON l.id = n.location_id
          WHERE n.active=1";
  $bind = [];
  if ($locationId !== null && $locationId > 0) {
    $sql .= " AND n.location_id=:l";
    $bind[':l'] = $locationId;
  }
  $sql .= " ORDER BY n.location_id ASC, n.id ASC";

  $st = $PDO->prepare($sql);
  $st->execute($bind);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $map = [
    'exact' => [],
    'ra' => [],
    'exid' => [],
    'rows' => [],
  ];
  foreach ($rows as $row) {
    $locId = (int)($row['location_id'] ?? 0);
    if ($locId <= 0) continue;
    $ra = trim((string)($row['exporter_ip'] ?? ''));
    $exid = trim((string)($row['exporter_id'] ?? ''));
    $payload = ['id' => $locId, 'code' => (string)($row['location_code'] ?? '')];
    if ($ra !== '' && $exid !== '') {
      $map['exact'][$ra.'|'.$exid] = $payload;
    }
    if ($ra !== '' && !isset($map['ra'][$ra])) {
      $map['ra'][$ra] = $payload;
    }
    if ($exid !== '' && !isset($map['exid'][$exid])) {
      $map['exid'][$exid] = $payload;
    }
    $map['rows'][] = [
      'location_id' => $locId,
      'location_code' => (string)($row['location_code'] ?? ''),
      'exporter_ip' => $ra,
      'exporter_id' => $exid,
    ];
  }
  return $map;
}

function location_resolve_by_exporter(array $map, string $exporterIp, string $exporterId): ?array {
  $ra = trim($exporterIp);
  $exid = trim($exporterId);
  if ($ra !== '' && $exid !== '') {
    $k = $ra.'|'.$exid;
    if (isset($map['exact'][$k])) return $map['exact'][$k];
  }
  if ($ra !== '' && isset($map['ra'][$ra])) return $map['ra'][$ra];
  if ($exid !== '' && isset($map['exid'][$exid])) return $map['exid'][$exid];
  return null;
}

function location_filter_msisdns(array $msisdns, ?int $locationId): array {
  if ($locationId === null || $locationId <= 0) return array_values(array_unique($msisdns));
  $canon = [];
  foreach ($msisdns as $m) {
    $n = normalize_msisdn((string)$m);
    if ($n !== '') $canon[$n] = true;
  }
  if (!$canon) return [];

  location_bootstrap();
  global $PDO;
  if (!location_db_table_exists($PDO, 'user_location_profiles')) {
    return [];
  }

  $vals = array_keys($canon);
  $ph = implode(',', array_fill(0, count($vals), '?'));
  $sql = "SELECT msisdn, location_id
          FROM user_location_profiles
          WHERE msisdn IN ({$ph})";
  $st = $PDO->prepare($sql);
  $st->execute($vals);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $profileMap = [];
  foreach ($rows as $row) {
    $m = normalize_msisdn((string)($row['msisdn'] ?? ''));
    if ($m === '') continue;
    $profileMap[$m] = (int)($row['location_id'] ?? 0);
  }

  $out = [];
  foreach ($vals as $m) {
    $boundLoc = $profileMap[$m] ?? null;
    if ($boundLoc !== null) {
      if ($boundLoc === $locationId) $out[$m] = true;
      continue;
    }
  }
  return array_keys($out);
}
