<?php
declare(strict_types=1);
require_once __DIR__.'/nister_pdo.php';
require_once __DIR__ . '/common.php';
require_once __DIR__.'/common.php';

if (!function_exists("rdb_pdo")) {
function rdb_pdo(): PDO {
  $env = app_boot();
  [$dsn, $u, $p] = nister_radius_db_params($env);
  if ($dsn === '' || $u === '') {
    throw new RuntimeException('RADIUS DB not configured (RADIUS_DSN/RADIUS_USER or /etc/nister/radius_db.php)');
  }
  return new NisterPDO($dsn, $u, $p, [
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC
  ]);
}
}


function radius_set_reply(PDO $r, string $user, string $attr, string $op, string $val): void {
  $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute=:a")->execute([':u'=>$user, ':a'=>$attr]);
  $r->prepare("INSERT INTO radreply (username, attribute, op, value) VALUES (:u,:a,:o,:v)")
    ->execute([':u'=>$user, ':a'=>$attr, ':o'=>$op, ':v'=>$val]);
}




function radius_set_check(PDO $r, string $user, string $attr, string $op, string $val): void {
  // Single source-of-truth for Expiration belongs in radcheck (NOT radreply).
  $r->prepare("DELETE FROM radcheck WHERE username=:u AND attribute=:a")->execute([':u'=>$user, ':a'=>$attr]);
  $r->prepare("INSERT INTO radcheck (username, attribute, op, value) VALUES (:u,:a,:o,:v)")
    ->execute([':u'=>$user, ':a'=>$attr, ':o'=>$op, ':v'=>$val]);

  // Defensive: kill any legacy duplicates in radreply so expiry never forks.
  if ($attr === 'Expiration') {
    $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute='Expiration'")->execute([':u'=>$user]);
  }
}


function radius_set_user_group(PDO $r, string $user, string $group): void {
  // Single group model: clear others and set priority 1 for simplicity
  $r->prepare("DELETE FROM radusergroup WHERE username=:u")->execute([':u'=>$user]);
  $r->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES (:u,:g,1)")
    ->execute([':u'=>$user, ':g'=>$group]);
}

function radius_user_groups(PDO $r, array $users): array {
  if (!$users) return [];
  $ph = implode(",", array_fill(0, count($users), "?"));
  $st = $r->prepare("SELECT groupname, priority FROM radusergroup WHERE username IN ($ph) ORDER BY priority ASC, groupname ASC");
  $st->execute($users);
  $groups = [];
  while ($row = $st->fetch()) {
    $g = (string)($row['groupname'] ?? '');
    if ($g !== '') $groups[] = $g;
  }
  return $groups;
}

function radius_pick_plan_group(PDO $r, array $users): ?string {
  // Legacy fallback: if a plan group exists, return it.
  $groups = radius_user_groups($r, $users);
  if (!$groups) return null;
  foreach ($groups as $g) {
    if (preg_match('/^hs_/i', $g)) continue;
    if (strtolower($g) === 'nopaid') continue;
    return $g;
  }
  return null;
}

function radius_plan_code_from_reply(PDO $r, array $users): ?string {
  if (!$users) return null;
  $ph = implode(",", array_fill(0, count($users), "?"));
  $st = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Nister-Plan-Code' LIMIT 1");
  $st->execute($users);
  $val = $st->fetchColumn();
  $code = ($val !== false && $val !== null) ? trim((string)$val) : '';
  return $code !== '' ? $code : null;
}

function radius_plan_name_from_reply(PDO $r, array $users): ?string {
  if (!$users) return null;
  $ph = implode(",", array_fill(0, count($users), "?"));
  $st = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Nister-Plan-Name' LIMIT 1");
  $st->execute($users);
  $val = $st->fetchColumn();
  $name = ($val !== false && $val !== null) ? trim((string)$val) : '';
  return $name !== '' ? $name : null;
}

function nister_duration_days(PDO $r, array $users, ?string $group, int $default=30): int {
  $days = null;
  if ($users) {
    $ph = implode(",", array_fill(0, count($users), "?"));
    $st = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Nister-Duration-Days' LIMIT 1");
    $st->execute($users);
    $vd = $st->fetchColumn();
    if ($vd !== false && $vd !== null && $vd !== '') $days = (int)$vd;
  }
  if ($days === null && $group) {
    $st = $r->prepare("SELECT `value` FROM radgroupreply WHERE groupname=:g AND attribute='Nister-Duration-Days' LIMIT 1");
    $st->execute([':g'=>$group]); $vd = $st->fetchColumn();
    if ($vd === false || $vd === null || $vd === '') {
      $st = $r->prepare("SELECT `value` FROM radgroupcheck WHERE groupname=:g AND attribute='Nister-Duration-Days' LIMIT 1");
      $st->execute([':g'=>$group]); $vd = $st->fetchColumn();
    }
    if ($vd !== false && $vd !== null && $vd !== '') $days = (int)$vd;
  }
  $out = ($days !== null && $days > 0) ? $days : $default;
  return $out > 0 ? $out : $default;
}

function nister_parse_expiry_datetime(?string $raw, DateTimeZone $tz): ?DateTimeImmutable {
  $v = trim((string)$raw);
  if ($v === '') return null;
  $dt = DateTimeImmutable::createFromFormat('d M Y H:i:s', $v, $tz);
  if (!$dt) $dt = DateTimeImmutable::createFromFormat('M d Y H:i:s', $v, $tz);
  if (!$dt) $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $v, $tz);
  if (!$dt) {
    try { $dt = new DateTimeImmutable($v, $tz); } catch (Throwable $e) { $dt = null; }
  }
  return ($dt instanceof DateTimeImmutable) ? $dt : null;
}

function nister_fetch_expiration(PDO $r, array $users, DateTimeZone $tz): ?DateTimeImmutable {
  if (!$users) return null;
  $st = $r->prepare("SELECT `value` FROM radcheck WHERE username=? AND attribute='Expiration' LIMIT 1");
  $best = null;
  foreach ($users as $u) {
    if ($u === '') continue;
    $st->execute([$u]);
    $val = $st->fetchColumn();
    if ($val === false || $val === null || $val === '') continue;
    $dt = nister_parse_expiry_datetime((string)$val, $tz);
    if ($dt instanceof DateTimeImmutable) {
      if (!$best || $dt > $best) $best = $dt;
    }
  }
  return $best;
}

function nister_fetch_window_start(PDO $r, array $users, DateTimeZone $tz): ?DateTimeImmutable {
  if (!$users) return null;
  $st = $r->prepare("SELECT `value` FROM radreply WHERE username=? AND attribute='Nister-Window-Start' LIMIT 1");
  $best = null;
  foreach ($users as $u) {
    if ($u === '') continue;
    $st->execute([$u]);
    $val = $st->fetchColumn();
    if ($val === false || $val === null || $val === '') continue;
    $v = (string)$val;
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $v, $tz);
    if (!$dt) {
      try { $dt = new DateTimeImmutable($v, $tz); } catch (Throwable $e) { $dt = null; }
    }
    if ($dt instanceof DateTimeImmutable) {
      if (!$best || $dt > $best) $best = $dt;
    }
  }
  return $best;
}

function nister_proc_missing(Throwable $e): bool {
  if ($e instanceof PDOException && isset($e->errorInfo[1]) && (int)$e->errorInfo[1] === 1305) {
    return true; // ER_SP_DOES_NOT_EXIST
  }
  $msg = strtolower($e->getMessage());
  return (str_contains($msg, 'nister_apply_topup') && (str_contains($msg, 'does not exist') || str_contains($msg, "doesn't exist") || str_contains($msg, 'not found')));
}

function nister_apply_topup_fallback(PDO $r, string $user, int $totalBytes, string $expStr, int $durDays, string $planName, ?string $planCode=null): void {
  radius_set_check($r, $user, 'Expiration', ':=', $expStr);
  radius_set_reply($r, $user, 'Nister-Duration-Days', ':=', (string)$durDays);
  if ($planCode !== null && $planCode !== '') {
    radius_set_reply($r, $user, 'Nister-Plan-Code', ':=', $planCode);
  }
  radius_set_reply($r, $user, 'Nister-Plan-Name', ':=', $planName);

  $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')")
    ->execute([':u'=>$user]);

  if ($totalBytes > 0) {
    radius_set_reply($r, $user, 'Nister-Quota-Bytes', ':=', (string)$totalBytes);
    $hi = intdiv($totalBytes, 4294967296);
    $lo = (int)($totalBytes - ($hi * 4294967296));
    radius_set_reply($r, $user, 'Mikrotik-Total-Limit', ':=', (string)$lo);
    if ($hi > 0) {
      radius_set_reply($r, $user, 'Mikrotik-Total-Limit-Gigawords', ':=', (string)$hi);
    }
  }
}

/**
 * Apply plan for a user:
 * - Set Expiration in radcheck (user-specific)
 * - Ensure HS_ACTIVE or plan-specific address list in radreply (immediate effect)
 * - Optionally set Mikrotik-Rate-Limit in radreply (for instant effect; group also has it)
 * - Set radusergroup to the plan code (so we can read "active plan" later)
 */
function radius_apply_plan__old(string $msisdn, array $plan, DateTimeImmutable $expiresAt): void {
    $r = rdb_pdo();
    // DB enforces "DD Mon YYYY HH:MM:SS"
    $expStr = $expiresAt->format('d M Y H:i:s'); // e.g., "04 Dec 2025 23:59:59"

    // Nister: apply to BOTH username variants (local 0xxxxxxxxx & canonical 233xxxxxxxxx)
    $___targets = nister_username_variants($msisdn);

    foreach ($___targets as $__u) {
        radius_set_user_group($r, $__u, (string)$plan['code']);
        radius_set_check($r, $__u, 'Expiration', ':=', $expStr);
        if (!empty($plan['address_list'])) {
            radius_set_reply($r, $__u, 'Mikrotik-Address-List', ':=', (string)$plan['address_list']);
        }
        if (!empty($plan['rate_limit'])) {
            radius_set_reply($r, $__u, 'Mikrotik-Rate-Limit',   ':=', (string)$plan['rate_limit']);
        }
    }
}

/**
 * Get current active plan from FreeRADIUS for a user.
 * - Reads primary group from radusergroup (lowest priority number).
 * - Reads Expiration from radcheck.
 * - Enriches with plan info from radgroupreply/radgroupcheck (rate-limit, price, days).
 */
/**
 * Sum octets across username variants in a window (handles 32-bit gigaword rollover).
 */
function nister_sum_used_bytes(PDO $r, array $users, DateTimeImmutable $startAt, ?DateTimeImmutable $endAt=null): int {
    if (empty($users)) return 0;
    $ph = implode(",", array_fill(0, count($users), "?"));
    $sql = "SELECT COALESCE(SUM(
                COALESCE(acctinputoctets,0)+COALESCE(acctoutputoctets,0)
                + 4294967296*(COALESCE(acctinputgigawords,0)+COALESCE(acctoutputgigawords,0))
            ),0)
            FROM radacct
            WHERE username IN ($ph)
              AND (
                    (acctstarttime IS NOT NULL AND acctstarttime >= ?)
                 OR (acctstoptime  IS NOT NULL AND acctstoptime  >= ?)
                 OR (acctstoptime IS NULL AND acctstarttime IS NOT NULL AND acctstarttime >= ?)
              )";
    $params = $users;
    $params[] = $startAt->format('Y-m-d H:i:s');
    $params[] = $startAt->format('Y-m-d H:i:s');
    $params[] = $startAt->format('Y-m-d H:i:s');
    if ($endAt) { $sql .= " AND acctstarttime <= ?"; $params[] = $endAt->format('Y-m-d H:i:s'); }
    $st = $r->prepare($sql);
    $st->execute($params);
    return (int)($st->fetchColumn() ?: 0);
}

/**
 * Estimate usage within [startAt, endAt] even when a session started before startAt.
 * For overlap sessions we prorate octets by overlap duration as a practical approximation.
 * This is used only for carry-over math during plan apply to avoid over-crediting data.
 */
function nister_sum_used_bytes_for_carry(PDO $r, array $users, DateTimeImmutable $startAt, DateTimeImmutable $endAt): int {
    if (empty($users)) return 0;
    if ($endAt <= $startAt) return 0;
    $ph = implode(",", array_fill(0, count($users), "?"));
    $sql = "SELECT acctstarttime, acctstoptime,
                   COALESCE(acctinputoctets,0) AS in_oct,
                   COALESCE(acctoutputoctets,0) AS out_oct,
                   COALESCE(acctinputgigawords,0) AS in_gw,
                   COALESCE(acctoutputgigawords,0) AS out_gw
            FROM radacct
            WHERE username IN ($ph)
              AND acctstarttime IS NOT NULL
              AND acctstarttime < ?
              AND (acctstoptime IS NULL OR acctstoptime > ?)";
    $params = $users;
    $params[] = $endAt->format('Y-m-d H:i:s');
    $params[] = $startAt->format('Y-m-d H:i:s');
    $st = $r->prepare($sql);
    $st->execute($params);

    $total = 0.0;
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $startRaw = (string)($row['acctstarttime'] ?? '');
        if ($startRaw === '') continue;
        try {
            $sessStart = new DateTimeImmutable($startRaw, $startAt->getTimezone());
        } catch (Throwable $e) {
            continue;
        }
        $stopRaw = trim((string)($row['acctstoptime'] ?? ''));
        if ($stopRaw !== '' && $stopRaw !== '0000-00-00 00:00:00') {
            try {
                $sessEnd = new DateTimeImmutable($stopRaw, $startAt->getTimezone());
            } catch (Throwable $e) {
                $sessEnd = $endAt;
            }
        } else {
            $sessEnd = $endAt;
        }

        if ($sessEnd <= $sessStart) continue;
        $winStart = ($sessStart > $startAt) ? $sessStart : $startAt;
        $winEnd = ($sessEnd < $endAt) ? $sessEnd : $endAt;
        if ($winEnd <= $winStart) continue;

        $dur = $sessEnd->getTimestamp() - $sessStart->getTimestamp();
        $overlap = $winEnd->getTimestamp() - $winStart->getTimestamp();
        if ($dur <= 0 || $overlap <= 0) continue;

        $bytes = (float)(
            (int)($row['in_oct'] ?? 0) + (int)($row['out_oct'] ?? 0)
            + 4294967296 * ((int)($row['in_gw'] ?? 0) + (int)($row['out_gw'] ?? 0))
        );
        if ($bytes <= 0) continue;

        if ($sessStart >= $startAt && $sessEnd <= $endAt) {
            $total += $bytes;
        } else {
            $ratio = $overlap / $dur;
            if ($ratio < 0) $ratio = 0;
            if ($ratio > 1) $ratio = 1;
            $total += ($bytes * $ratio);
        }
    }
    if ($total <= 0) return 0;
    return (int)floor($total);
}

/**
 * Get current total quota (bytes) for the user:
 * 1) user-level override (radreply.Mikrotik-Total-Limit), else
 * 2) group-level (radgroupreply/check.Nister-Quota-Bytes or Mikrotik-Total-Limit)
 */
function nister_current_total_quota(PDO $r, array $users, ?string $group): ?int {
  if (!empty($users)) {
    $ph = implode(",", array_fill(0, count($users), "?"));
    $st = $r->prepare("SELECT attribute, `value`
                           FROM radreply
                           WHERE attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')
                             AND username IN ($ph)");
        $st->execute($users);
        $vals = [];
        while ($row = $st->fetch()) { $vals[$row['attribute']] = $row['value']; }
        if (isset($vals['Nister-Quota-Bytes']) && $vals['Nister-Quota-Bytes'] !== '') {
            return (int)$vals['Nister-Quota-Bytes'];
        }
        if (isset($vals['Mikrotik-Total-Limit-Gigawords']) || isset($vals['Mikrotik-Total-Limit'])) {
            $hi = (int)($vals['Mikrotik-Total-Limit-Gigawords'] ?? 0);
            $lo = (int)($vals['Mikrotik-Total-Limit'] ?? 0);
            if ($hi || $lo) return (int)($hi * 4294967296 + $lo);
        }
    }
    if ($group) {
        foreach (['radgroupreply','radgroupcheck'] as $tbl) {
            $st = $r->prepare("SELECT attribute, `value` FROM {$tbl}
                               WHERE groupname=:g
                                 AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit-Gigawords','Mikrotik-Total-Limit')");
            $st->execute([':g'=>$group]);
            $vals = [];
            while ($row = $st->fetch()) { $vals[$row['attribute']] = $row['value']; }
            if (isset($vals['Nister-Quota-Bytes']) && $vals['Nister-Quota-Bytes'] !== '') {
                return (int)$vals['Nister-Quota-Bytes'];
            }
            if (isset($vals['Mikrotik-Total-Limit-Gigawords']) || isset($vals['Mikrotik-Total-Limit'])) {
                $hi = (int)($vals['Mikrotik-Total-Limit-Gigawords'] ?? 0);
                $lo = (int)($vals['Mikrotik-Total-Limit'] ?? 0);
                if ($hi || $lo) return (int)($hi * 4294967296 + $lo);
            }
        }
    }
    return null;
}

/**
 * Apply plan with ADDITIVE QUOTA semantics:
 * - Carry over remaining data from the current window, then add the new plan's quota
 * - Extend expiry from later of purchase time/current expiry (exact timestamp)
 * - Apply address list, rate limit, and set per-user plan attributes
 * - Annotate with Nister-Duration-Days and Nister-Plan-Name
 */
function radius_apply_plan(string $msisdn, array $plan, DateTimeImmutable $purchaseAt): void {
    $r = rdb_pdo();
    $tz = new DateTimeZone(date_default_timezone_get());
    $now = $purchaseAt->setTimezone($tz);
    $targets = nister_username_variants($msisdn);

    // Current plan code (reply or legacy group) and Expiration (for window math)
    $currCode = radius_plan_code_from_reply($r, $targets);
    $currGroup = $currCode ?: radius_pick_plan_group($r, $targets);
    $currExp = nister_fetch_expiration($r, $targets, $tz);
    $currDur = nister_duration_days($r, $targets, $currGroup, 30);
    $currWindow = nister_fetch_window_start($r, $targets, $tz);

    $strictQuota = !empty($plan['strict_quota']);

    // Remaining from current window (only for additive topups)
    $carry = 0;
    $prevTotal = nister_current_total_quota($r, $targets, $currGroup);
    if (!$strictQuota && $prevTotal && $currExp && $currExp > $now) {
        $windowStart = $currWindow ?: $currExp->modify('-'.$currDur.' days');
        $used = nister_sum_used_bytes_for_carry($r, $targets, $windowStart, $now);
        $rem = $prevTotal - $used;
        if ($rem > 0) $carry = $rem;
    }

    $newQuota = (int)($plan['quota_bytes'] ?? 0);
    if ($newQuota < 0) $newQuota = 0;
    $durDays = (int)($plan['duration_days'] ?? 30);
    if ($durDays <= 0) $durDays = 30;

    $combined = ($newQuota > 0)
      ? ($strictQuota ? $newQuota : ($carry + $newQuota))
      : 0;

    // Expiration: extend from later of now/current expiry
    $baseStart = ($currExp instanceof DateTimeImmutable && $currExp > $now) ? $currExp : $now;
    $expAt = $baseStart->modify('+' . $durDays . ' days');
    // DB enforces "DD Mon YYYY HH:MM:SS"
    $expStr = $expAt->format('d M Y H:i:s');

    foreach ($targets as $u) {
        if ($u === '') continue;
        $planCode = (string)($plan['code'] ?? 'UNKNOWN');
        $planName = (string)($plan['display_name'] ?? $plan['name'] ?? $planCode);
        $addrList = (string)($plan['address_list'] ?? 'HS_ACTIVE');
        $rateLimit = (string)($plan['rate_limit'] ?? '');
        $capBytes = $combined;

        $started = false;
        if (!$r->inTransaction()) {
            $r->beginTransaction();
            $started = true;
        }
        try {
            $applied = false;
            $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords') AND value='0'")->execute([':u'=>$u]);
            try {
                $call = $r->prepare("CALL nister_apply_topup(?, ?, ?, ?)");
                // NOTE: stored procedure semantics can be additive; pass only NEW quota,
                // then explicitly enforce final combined quota below.
                $call->execute([$u, $newQuota, $durDays, $planCode]);
                $call->closeCursor();
                $applied = true;
            } catch (Throwable $e) {
                if (!nister_proc_missing($e)) throw $e;
            }

            if (!$applied) {
                nister_apply_topup_fallback($r, $u, $combined, $expStr, $durDays, $planCode, $planCode);
            }
            radius_set_check($r, $u, 'Expiration', ':=', $expStr);

            // Enforce final combined quota after proc (avoid accidental double-add).
            $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')")
              ->execute([':u'=>$u]);
            if ($combined > 0) {
                radius_set_reply($r, $u, 'Nister-Quota-Bytes', ':=', (string)$combined);
                $hi = intdiv($combined, 4294967296);
                $lo = (int)($combined - ($hi * 4294967296));
                radius_set_reply($r, $u, 'Mikrotik-Total-Limit', ':=', (string)$lo);
                if ($hi > 0) {
                    radius_set_reply($r, $u, 'Mikrotik-Total-Limit-Gigawords', ':=', (string)$hi);
                }
            }

            // Set per-user plan metadata (no PLAN_* groups)
            radius_set_reply($r, $u, 'Nister-Plan-Code', ':=', $planCode);
            radius_set_reply($r, $u, 'Nister-Plan-Name', ':=', $planName);
            radius_set_reply($r, $u, 'Nister-Duration-Days', ':=', (string)$durDays);

            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_LIMITED','HS_NOPAID','nopaid')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_ACTIVE', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_ACTIVE'
                         )")->execute([':u'=>$u]);
            $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Mikrotik-Address-List','MT-Address-List')")->execute([':u'=>$u]);
            // Start a fresh usage window on every successful purchase/top-up.
            // This avoids immediate re-exhaustion when old usage is already at/above cap.
            $windowStartStr = $now->format('Y-m-d H:i:s');
            radius_set_reply($r, $u, 'Nister-Window-Start', ':=', $windowStartStr);
            if ($addrList !== '') {
                radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', $addrList);
            }
            if ($rateLimit !== '') {
                radius_set_reply($r, $u, 'Mikrotik-Rate-Limit', ':=', $rateLimit);
            }

            if ($started && $r->inTransaction()) $r->commit();
        } catch (Throwable $e) {
            if ($started && $r->inTransaction()) $r->rollBack();
            throw $e;
        }
    }
}

/**
 * Single-user state row aligned with admin user_state_list/enforcer math.
 * This is the shared source for used/quota/expiry flags across admin + hotspot APIs.
 */
function radius_user_state_exact(string $msisdn, ?PDO $r=null): ?array {
  if (!$r) $r = rdb_pdo();
  $targets = array_values(array_unique(array_filter(nister_username_variants($msisdn))));
  if (!$targets) return null;
  $ph = implode(",", array_fill(0, count($targets), "?"));

  $groupname = '';
  $st = $r->prepare("
    SELECT groupname
    FROM radusergroup
    WHERE username IN ($ph)
      AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid')
    ORDER BY
      CASE groupname
        WHEN 'HS_ACTIVE' THEN 1
        WHEN 'HS_LIMITED' THEN 2
        WHEN 'HS_NOPAID' THEN 3
        WHEN 'nopaid' THEN 4
        ELSE 9
      END,
      priority ASC
    LIMIT 1
  ");
  $st->execute($targets);
  $groupname = (string)($st->fetchColumn() ?: '');

  $st = $r->prepare("SELECT value FROM radcheck WHERE attribute='Expiration' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
  $st->execute($targets);
  $expires = trim((string)($st->fetchColumn() ?: ''));

  $st = $r->prepare("SELECT value FROM radreply WHERE attribute='Nister-Window-Start' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
  $st->execute($targets);
  $windowStart = trim((string)($st->fetchColumn() ?: ''));

  $st = $r->prepare("SELECT value FROM radreply WHERE attribute='Mikrotik-Rate-Limit' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
  $st->execute($targets);
  $rateLimit = trim((string)($st->fetchColumn() ?: ''));

  $quotaBytes = null;
  $st = $r->prepare("SELECT value FROM radreply WHERE attribute='Nister-Quota-Bytes' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
  $st->execute($targets);
  $qv = $st->fetchColumn();
  if ($qv !== false && $qv !== null && $qv !== '') {
    $quotaBytes = (int)$qv;
  } else {
    $st = $r->prepare("SELECT value FROM radreply WHERE attribute='Mikrotik-Total-Limit-Gigawords' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
    $st->execute($targets);
    $hiRaw = $st->fetchColumn();
    $st = $r->prepare("SELECT value FROM radreply WHERE attribute='Mikrotik-Total-Limit' AND username IN ($ph) ORDER BY id DESC LIMIT 1");
    $st->execute($targets);
    $loRaw = $st->fetchColumn();
    $hasHi = ($hiRaw !== false && $hiRaw !== null && $hiRaw !== '');
    $hasLo = ($loRaw !== false && $loRaw !== null && $loRaw !== '');
    if ($hasHi || $hasLo) {
      $hi = (int)($hiRaw ?: 0);
      $lo = (int)($loRaw ?: 0);
      $quotaBytes = (int)($hi * 4294967296 + $lo);
    }
  }

  $sqlUsed = "
    SELECT COALESCE(SUM(
      COALESCE(ra.acctinputoctets,0)+COALESCE(ra.acctoutputoctets,0) +
      4294967296*(COALESCE(ra.acctinputgigawords,0)+COALESCE(ra.acctoutputgigawords,0))
    ),0)
    FROM radacct ra
    WHERE ra.username IN ($ph)
      AND ra.acctstarttime >= COALESCE(
        (
          SELECT ws.value
          FROM radreply ws
          WHERE ws.attribute='Nister-Window-Start'
            AND ws.username IN ($ph)
          ORDER BY ws.id DESC LIMIT 1
        ),
        DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
  ";
  $st = $r->prepare($sqlUsed);
  $st->execute(array_merge($targets, $targets));
  $usedBytes = (int)($st->fetchColumn() ?: 0);

  $expiredFlag = 0;
  if ($expires !== '') {
    $tz = new DateTimeZone(date_default_timezone_get());
    $exp = nister_parse_expiry_datetime($expires, $tz);
    if ($exp instanceof DateTimeImmutable) {
      $expiredFlag = ($exp <= new DateTimeImmutable('now', $tz)) ? 1 : 0;
    }
  }

  $exhaustedFlag = 0;
  if ($quotaBytes !== null) {
    if ($quotaBytes <= 0) $exhaustedFlag = 1;
    elseif ($usedBytes >= $quotaBytes) $exhaustedFlag = 1;
  }

  return [
    'username' => $msisdn,
    'groupname' => $groupname,
    'expires' => $expires,
    'window_start' => $windowStart,
    'quota_bytes' => $quotaBytes,
    'used_bytes' => $usedBytes,
    'expired_flag' => $expiredFlag,
    'exhausted_flag' => $exhaustedFlag,
    'rate_limit' => $rateLimit,
  ];
}

function radius_user_status(string $msisdn): array {
  $r = rdb_pdo();
  $tz = new DateTimeZone(date_default_timezone_get());
  $now = new DateTimeImmutable('now', $tz);
  $targets = nister_username_variants($msisdn);
  if (!$targets) {
    return ['paid'=>false,'expired'=>false,'exhausted'=>false,'can_browse'=>false];
  }

  $groups = radius_user_groups($r, $targets);
  $planGroup = radius_plan_code_from_reply($r, $targets) ?: radius_pick_plan_group($r, $targets);

  $limitedGroup = false;
  $hsGroup = null;
  foreach ($groups as $g) {
    $lg = strtolower($g);
    if ($lg === 'hs_nopaid') { $limitedGroup = true; $hsGroup = 'HS_NOPAID'; break; }
    if ($lg === 'nopaid') { $limitedGroup = true; if ($hsGroup === null) $hsGroup = 'HS_NOPAID'; continue; }
    if ($lg === 'hs_limited') { $limitedGroup = true; $hsGroup = 'HS_LIMITED'; }
    if ($lg === 'hs_active' && $hsGroup === null) { $hsGroup = 'HS_ACTIVE'; }
  }

  $addrList = null;
  $ph = implode(",", array_fill(0, count($targets), "?"));
  $st = $r->prepare("SELECT attribute, value FROM radreply WHERE username IN ($ph) AND attribute IN ('Mikrotik-Address-List','MT-Address-List')");
  $st->execute($targets);
  while ($row = $st->fetch()) {
    $val = trim((string)($row['value'] ?? ''));
    if ($val !== '') $addrList = $val;
  }

  if ($addrList === null && $hsGroup !== null) {
    $addrList = $hsGroup;
  }

  $policyLimited = $limitedGroup;
  if ($addrList !== null) {
    $al = strtoupper($addrList);
    if (in_array($al, ['HS_LIMITED','HS_NOPAID'], true)) $policyLimited = true;
  }

  $expiry = nister_fetch_expiration($r, $targets, $tz);
  $expired = ($expiry instanceof DateTimeImmutable) ? ($expiry <= $now) : false;

  $durDays = nister_duration_days($r, $targets, $planGroup, 30);
  $quotaBytes = nister_current_total_quota($r, $targets, $planGroup);
  $usedBytes = 0;
  $exhausted = false;
  if ($quotaBytes !== null) {
    // Prefer explicit window anchor written at plan/top-up apply time.
    $windowStart = nister_fetch_window_start($r, $targets, $tz);
    if (!($windowStart instanceof DateTimeImmutable)) {
      $windowStart = ($expiry instanceof DateTimeImmutable)
        ? $expiry->modify('-'.$durDays.' days')
        : $now->modify('-'.$durDays.' days');
    }
    $usedBytes = nister_sum_used_bytes($r, $targets, $windowStart, $now);
    $exhausted = ($usedBytes >= $quotaBytes);
  }

  $paid = false;
  if ($planGroup) $paid = true;
  if (!$paid && ($expiry instanceof DateTimeImmutable || $quotaBytes !== null)) $paid = true;

  $canBrowse = $paid && !$expired && !$exhausted && !$policyLimited;

  return [
    'paid' => $paid,
    'expired' => $expired,
    'exhausted' => $exhausted,
    'can_browse' => $canBrowse,
    'policy_limited' => $policyLimited,
    'group' => $planGroup,
    'addrlist' => $addrList,
    'expires_at' => $expiry ? $expiry->format('d M Y H:i:s') : null,
    'quota_bytes' => $quotaBytes,
    'used_bytes' => $usedBytes,
  ];
}
function radius_get_active_plan(string $msisdn): ?array {
  $r = rdb_pdo();
  $targets = nister_username_variants($msisdn);
  $ph = implode(",", array_fill(0, count($targets), "?"));

  // Plan code (reply or legacy group)
  $g = radius_plan_code_from_reply($r, $targets);
  if (!$g) {
    $groups = radius_user_groups($r, $targets);
    if ($groups) {
      foreach ($groups as $cand) {
        if (preg_match('/^hs_/i', $cand)) continue;
        if (strtolower($cand) === 'nopaid') continue;
        $g = $cand;
        break;
      }
    }
  }
  $tz = new DateTimeZone(date_default_timezone_get());
  if (!$g) {
    // No group -> maybe not applied through group model; still try to surface expiration
    $exp = nister_fetch_expiration($r, $targets, $tz);
    return $exp ? ['plan_code'=>null,'expires_at'=>$exp->format('d M Y H:i:s')] : null;
  }

  // Expiration
  $exp = nister_fetch_expiration($r, $targets, $tz);
  $exp = $exp ? $exp->format('d M Y H:i:s') : null;

  // Gather plan attrs from group tables (plan catalog)
  $attrs = [];
  foreach (['radgroupreply','radgroupcheck'] as $tbl) {
    $st3 = $r->prepare("SELECT attribute, `value` FROM {$tbl} WHERE groupname=:g");
    $st3->execute([':g'=>$g]);
    while ($row = $st3->fetch()) {
      $attrs[$row['attribute']] = $row['value'];
    }
  }

  $displayName = radius_plan_name_from_reply($r, $targets);
  if ($displayName === null && isset($attrs['Nister-Plan-Name']) && trim((string)$attrs['Nister-Plan-Name']) !== '') {
    $displayName = (string)$attrs['Nister-Plan-Name'];
  }
  $name = $displayName ?: str_replace(['_','-'],' ', $g);
  $active = null;
  if (isset($attrs['Nister-Active'])) {
    $lv = strtolower(trim((string)$attrs['Nister-Active']));
    $active = !in_array($lv, ['0','false','no','off'], true);
  }
  return [
    'plan_code'     => $g,
    'name'          => $name,
    'display_name'  => $displayName,
    'rate_limit'    => $attrs['Mikrotik-Rate-Limit'] ?? null,
    'address_list'  => $attrs['Mikrotik-Address-List'] ?? 'HS_ACTIVE',
    'price_cents'   => isset($attrs['Nister-Price-Cents']) ? (int)$attrs['Nister-Price-Cents'] : null,
    'duration_days' => isset($attrs['Nister-Duration-Days']) ? (int)$attrs['Nister-Duration-Days'] : null,
    'expires_at'    => $exp,
    'active'        => $active,
  ];
}
// --- Nister helper: return local & canonical MSISDN variants (unique, in-order)
if (!function_exists('nister_username_variants')) {
  function nister_username_variants(string $u): array {
    $d = preg_replace('/\D+/', '', $u);
    $out = [];
    if (preg_match('/^233\d{9}$/', $d)) {
      $out[] = '0'.substr($d,3);
      $out[] = $d;
    } elseif (preg_match('/^0\d{9}$/', $d)) {
      $out[] = $d;
      $out[] = '233'.substr($d,1);
    } else {
      $out[] = $u; // unknown format; leave as-is
    }
    return array_values(array_unique($out));
  }
}


/**
 * Best-effort CoA/Disconnect to force a hotspot user to re-auth so new RADIUS attrs apply.
 * Safe no-op if radclient/secret not configured.
 */

function radius_try_disconnect(string $msisdn, array $ENV=[]): void {
  $nasRaw = (string)($ENV['NAS_IPS'] ?? ($ENV['NAS_IP'] ?? ''));
  $nasIps = [];
  foreach (preg_split('/[,\s]+/', $nasRaw, -1, PREG_SPLIT_NO_EMPTY) as $ip) {
    $ip = trim($ip);
    if ($ip !== '') $nasIps[$ip] = true;
  }
  $nasIps = array_keys($nasIps);
  $port  = (int)($ENV['COA_PORT'] ?? 3799);
  if (!$nasIps || $port <= 0) return;

  // Secret: inline or file
  $secret = trim((string)($ENV['COA_SECRET'] ?? ''));
  if ($secret === '') {
    $sf = trim((string)($ENV['COA_SECRET_FILE'] ?? ''));
    if ($sf !== '' && is_readable($sf)) $secret = trim((string)file_get_contents($sf));
  }
  if ($secret === '') return;

  // radclient path
  $radclient = trim((string)@shell_exec('command -v radclient 2>/dev/null'));
  if ($radclient === '') $radclient = '/usr/bin/radclient';
  if (!is_file($radclient) || !is_executable($radclient)) return;
  // COA_SRC_IP is handled at OS routing level; radclient has no -i flag in this build.
  $srcIp = trim((string)($ENV['COA_SRC_IP'] ?? ''));
  if ($srcIp !== '' && !filter_var($srcIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $srcIp = '';

  // Normalize digits
  $raw = preg_replace('/\D+/', '', (string)$msisdn);
  if ($raw === '') return;

  $canon = $raw;
  if (function_exists('normalize_msisdn')) {
    $canon = preg_replace('/\D+/', '', (string)normalize_msisdn($raw));
  }
  if ($canon === '' || strlen($canon) < 9) $canon = $raw;
  if (strlen($canon) < 9) return;

  $last9 = substr($canon, -9);

  // What MikroTik hotspot commonly uses vs what DB commonly stores
  $local = '0'.$last9;
  $e164  = '233'.$last9;

  // DB handle
  $pdo = null;
  if (function_exists('rdb_pdo')) $pdo = rdb_pdo();
  elseif (function_exists('radius_pdo')) $pdo = radius_pdo($ENV);
  elseif (function_exists('db_pdo')) $pdo = db_pdo($ENV);
  if (!$pdo instanceof PDO) return;

  // Find active sessions across configured NAS IPs; match by trailing last9 digits.
  $nasPlaceholders = implode(',', array_fill(0, count($nasIps), '?'));
  $st = $pdo->prepare(
    "SELECT username, acctsessionid, framedipaddress, callingstationid, acctstarttime, nasipaddress
     FROM radacct
     WHERE acctstoptime IS NULL
       AND nasipaddress IN ($nasPlaceholders)
       AND username LIKE CONCAT('%', ?)
     ORDER BY acctstarttime DESC
     LIMIT 200"
  );
  $st->execute(array_merge($nasIps, [$last9]));
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);
  if (!$rows) return;

  // Username candidates (order matters: try hotspot local first)
  $tryUsersMap = [];
  $addUser = static function(array &$m, string $u): void {
    $u = preg_replace('/\D+/', '', $u);
    if ($u !== '') $m[$u] = true;
  };

  $addUser($tryUsersMap, $local);
  $addUser($tryUsersMap, $raw);
  $addUser($tryUsersMap, $canon);
  $addUser($tryUsersMap, $e164);
  if (function_exists('msisdn_local')) $addUser($tryUsersMap, (string)msisdn_local($canon));

  // Dedup sessions by (sid|ip|mac)
  $sessions = [];
  foreach ($rows as $r) {
    $uRaw = (string)($r['username'] ?? '');
    $uDig = preg_replace('/\D+/', '', $uRaw);
    if ($uRaw !== '') $addUser($tryUsersMap, $uRaw);
    if ($uDig !== '') $addUser($tryUsersMap, $uDig);

    $sid = (string)($r['acctsessionid'] ?? '');
    if ($sid === '') continue;
    $sidSafe = preg_replace('/[^A-Za-z0-9._:-]/', '', $sid);
    if ($sidSafe === '') continue;

    $fip = trim((string)($r['framedipaddress'] ?? ''));
    $mac = strtoupper(trim((string)($r['callingstationid'] ?? '')));

    $nas = trim((string)($r['nasipaddress'] ?? ''));
    if ($nas === '') continue;
    $k = $sidSafe.'|'.$fip.'|'.$mac.'|'.$nas;
    if (!isset($sessions[$k])) {
      $sessions[$k] = ['sid'=>$sidSafe,'fip'=>$fip,'mac'=>$mac,'nas'=>$nas];
    }
  }
  if (!$sessions) return;

  $tryUsers = array_keys($tryUsersMap);

  foreach ($sessions as $sess) {
    $nas = $sess['nas'] ?? '';
    if ($nas === '') continue;
    $base = [];
    $base[] = 'Acct-Session-Id = "'.$sess['sid'].'"';

    // These two are what made your manual CoA work
    if (filter_var($sess['fip'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
      $base[] = 'Framed-IP-Address = '.$sess['fip'];
    }
    if (preg_match('/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/', $sess['mac'])) {
      $base[] = 'Calling-Station-Id = "'.$sess['mac'].'"';
    }

    $base[] = 'Message-Authenticator = 0x00';
    $basePayload = implode("\n", $base)."\n";

    foreach ($tryUsers as $u) {
      $u = preg_replace('/\D+/', '', (string)$u);
      if ($u === '') continue;

      $payload = 'User-Name = "'.$u."\"\n".$basePayload;

      $cmd = [$radclient, '-x'];
      $cmd[] = $nas.':'.$port;
      $cmd[] = 'disconnect';
      $cmd[] = $secret;
      $out = '';
      $err = '';
      $des = [0=>['pipe','w'], 1=>['pipe','r'], 2=>['pipe','r']];
      $proc = @proc_open($cmd, $des, $pipes, null, null, ['bypass_shell'=>true]);
      if (is_resource($proc)) {
        $okWrite = @fwrite($pipes[0], $payload);
        @fclose($pipes[0]);
        $out = @stream_get_contents($pipes[1]) ?: '';
        @fclose($pipes[1]);
        $err = @stream_get_contents($pipes[2]) ?: '';
        @fclose($pipes[2]);
        @proc_close($proc);
        if ($okWrite === false) {
          $out = '';
          $err = '';
        }
      }
      if ($out === '' && $err === '') {
        // Fallback: shell pipeline (some PHP builds break proc_open pipes)
        $shell = 'printf %s ' . escapeshellarg($payload)
          . ' | ' . escapeshellarg($radclient) . ' -x ' . escapeshellarg($nas.':'.$port)
          . ' disconnect ' . escapeshellarg($secret);
        $out = @shell_exec($shell) ?: '';
      }

      if (strpos($out, 'Disconnect-ACK') !== false || strpos($err, 'Disconnect-ACK') !== false) {
        break; // success for this session -> next session
      }
    }
  }
}

/**
 * Force a CoA disconnect by framed IP (Hotspot-friendly).
 * Uses radacct to resolve NAS + username when possible.
 */
function radius_force_kick_ip(string $ip, ?string $msisdn=null, array $ENV=[]): array {
  $ip = trim($ip);
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    return ['ok'=>false,'error'=>'invalid_ip'];
  }

  $port  = (int)($ENV['COA_PORT'] ?? 3799);
  if ($port <= 0) return ['ok'=>false,'error'=>'missing_port'];

  $secret = trim((string)($ENV['COA_SECRET'] ?? ''));
  if ($secret === '') {
    $sf = trim((string)($ENV['COA_SECRET_FILE'] ?? ''));
    if ($sf !== '' && is_readable($sf)) $secret = trim((string)file_get_contents($sf));
  }
  if ($secret === '') return ['ok'=>false,'error'=>'missing_secret'];

  $radclient = trim((string)@shell_exec('command -v radclient 2>/dev/null'));
  if ($radclient === '') $radclient = '/usr/bin/radclient';
  if (!is_file($radclient) || !is_executable($radclient)) return ['ok'=>false,'error'=>'radclient_missing'];
  // COA_SRC_IP is handled at OS routing level; radclient has no -i flag in this build.
  $srcIp = trim((string)($ENV['COA_SRC_IP'] ?? ''));
  if ($srcIp !== '' && !filter_var($srcIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $srcIp = '';

  $pdo = null;
  if (function_exists('rdb_pdo')) $pdo = rdb_pdo();
  elseif (function_exists('radius_pdo')) $pdo = radius_pdo($ENV);
  elseif (function_exists('db_pdo')) $pdo = db_pdo($ENV);
  if (!$pdo instanceof PDO) return ['ok'=>false,'error'=>'db_unavailable'];

  // Resolve NAS + username from active radacct session
  $st = $pdo->prepare("SELECT username, nasipaddress FROM radacct WHERE framedipaddress=:ip AND acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 1");
  $st->execute([':ip'=>$ip]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  $nas = trim((string)($row['nasipaddress'] ?? ''));
  $user = preg_replace('/\s+/', '', (string)($row['username'] ?? ''));

  // Normalize NAS allow-list (if provided) and ensure target is allowed
  $nasRaw = (string)($ENV['NAS_IPS'] ?? ($ENV['NAS_IP'] ?? ''));
  $nasList = array_values(array_filter(preg_split('/[,\s]+/', $nasRaw, -1, PREG_SPLIT_NO_EMPTY), static function($v){
    return (bool)filter_var($v, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4);
  }));

  // Fallback NAS target if not in radacct or not allowed
  if ($nas === '' || ($nasList && !in_array($nas, $nasList, true))) {
    $nas = $nasList[0] ?? '';
  }
  if ($nas === '') return ['ok'=>false,'error'=>'nas_missing'];

  // Build user candidates (radacct user, provided msisdn, local/e164, and blank)
  $candidates = [];
  $addUser = static function(array &$list, string $u): void {
    $u = preg_replace('/\D+/', '', $u);
    if ($u !== '') $list[$u] = true;
  };
  if ($user !== '') $addUser($candidates, $user);
  $msisdn = $msisdn ? preg_replace('/\D+/', '', $msisdn) : '';
  if ($msisdn !== '') {
    $addUser($candidates, $msisdn);
    if (preg_match('/^0[0-9]{9}$/', $msisdn)) $addUser($candidates, '233'.substr($msisdn, 1));
    if (preg_match('/^233[0-9]{9}$/', $msisdn)) $addUser($candidates, '0'.substr($msisdn, 3));
  }
  $tryUsers = array_keys($candidates);
  $tryUsers[] = ''; // allow payload without User-Name

  $cmd = [$radclient, '-x'];
  $cmd[] = $nas.':'.$port;
  $cmd[] = 'disconnect';
  $cmd[] = $secret;

  $lastOut = '';
  foreach ($tryUsers as $u) {
    $payload = '';
    if ($u !== '') $payload .= 'User-Name = "'.$u."\"\n";
    $payload .= 'Framed-IP-Address = '.$ip."\n";
    $payload .= "Message-Authenticator = 0x00\n";

    $out = '';
    $err = '';
    $des = [0=>['pipe','w'], 1=>['pipe','r'], 2=>['pipe','r']];
    $proc = @proc_open($cmd, $des, $pipes, null, null, ['bypass_shell'=>true]);
    if (is_resource($proc)) {
      $okWrite = @fwrite($pipes[0], $payload);
      @fclose($pipes[0]);
      $out = @stream_get_contents($pipes[1]) ?: '';
      @fclose($pipes[1]);
      $err = @stream_get_contents($pipes[2]) ?: '';
      @fclose($pipes[2]);
      @proc_close($proc);
      if ($okWrite === false) {
        $out = '';
        $err = '';
      }
    }
    if ($out === '' && $err === '') {
      // Fallback: shell pipeline (some PHP builds break proc_open pipes)
      $shell = 'printf %s ' . escapeshellarg($payload)
        . ' | ' . escapeshellarg($radclient) . ' -x ' . escapeshellarg($nas.':'.$port)
        . ' disconnect ' . escapeshellarg($secret);
      $out = @shell_exec($shell) ?: '';
    }

    $combined = trim($out."\n".$err);
    $lastOut = $combined;
    if (strpos($combined, 'Disconnect-ACK') !== false) {
      return ['ok'=>true, 'out'=>$combined, 'nas'=>$nas, 'user'=>$u !== '' ? $u : $user];
    }
  }

  $errCode = ($lastOut === '') ? 'no_reply' : 'no_ack';
  return ['ok'=>false, 'error'=>$errCode, 'out'=>$lastOut, 'nas'=>$nas, 'user'=>$user];
}
