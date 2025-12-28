<?php
declare(strict_types=1);
require_once __DIR__ . '/common.php';
require_once __DIR__.'/common.php';

if (!function_exists("rdb_pdo")) {
function rdb_pdo(): PDO {
  $env=app_boot();
  $dsn=$env['RADIUS_DSN']??''; $u=$env['RADIUS_USER']??''; $p=$env['RADIUS_PASS']??'';
  if ($dsn===''||$u==='') throw new RuntimeException('RADIUS DB not configured in .env');
  return new PDO($dsn,$u,$p,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}
}


function radius_set_reply(PDO $r, string $user, string $attr, string $op, string $val): void {
  $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute=:a")->execute([':u'=>$user, ':a'=>$attr]);
  $r->prepare("INSERT INTO radreply (username, attribute, op, value) VALUES (:u,:a,:o,:v)")
    ->execute([':u'=>$user, ':a'=>$attr, ':o'=>$op, ':v'=>$val]);
}

function radius_set_user_group(PDO $r, string $user, string $group): void {
  // Single group model: clear others and set priority 1 for simplicity
  $r->prepare("DELETE FROM radusergroup WHERE username=:u")->execute([':u'=>$user]);
  $r->prepare("INSERT INTO radusergroup (username, groupname, priority) VALUES (:u,:g,1)")
    ->execute([':u'=>$user, ':g'=>$group]);
}

/**
 * Apply plan for a user:
 * - Set Expiration in radreply (user-specific)
 * - Ensure HS_ACTIVE or plan-specific address list in radreply (immediate effect)
 * - Optionally set Mikrotik-Rate-Limit in radreply (for instant effect; group also has it)
 * - Set radusergroup to the plan code (so we can read "active plan" later)
 */
function radius_apply_plan__old(string $msisdn, array $plan, DateTimeImmutable $expiresAt): void {
    $r = rdb_pdo();
    $expStr = $expiresAt->format('M d Y H:i:s'); // e.g., "Dec 04 2025 23:59:59"

    // Nister: apply to BOTH username variants (local 0xxxxxxxxx & canonical 233xxxxxxxxx)
    $___targets = nister_username_variants($msisdn);

    foreach ($___targets as $__u) {
        radius_set_user_group($r, $__u, (string)$plan['code']);
        radius_set_reply($r, $__u, 'Expiration', ':=', $expStr);
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
 * - Reads Expiration from radreply.
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
                 OR acctstoptime IS NULL
              )";
    $params = $users;
    $params[] = $startAt->format('Y-m-d H:i:s');
    $params[] = $startAt->format('Y-m-d H:i:s');
    if ($endAt) { $sql .= " AND acctstarttime <= ?"; $params[] = $endAt->format('Y-m-d H:i:s'); }
    $st = $r->prepare($sql);
    $st->execute($params);
    return (int)($st->fetchColumn() ?: 0);
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
 * - Reset expiry to "now + plan duration" (23:59:59 today+duration)
 * - Apply address list, rate limit, and set plan group
 * - Annotate with Nister-Duration-Days and Nister-Plan-Name
 */
function radius_apply_plan(string $msisdn, array $plan, DateTimeImmutable $newExpiresAt): void {
    $r = rdb_pdo();
    $tz = new DateTimeZone(date_default_timezone_get());
    $now = new DateTimeImmutable('now', $tz);
    $targets = nister_username_variants($msisdn);

    // Current group (if any) and Expiration (for window math)
    $ph = implode(",", array_fill(0, count($targets), "?"));
    $st = $r->prepare("SELECT groupname FROM radusergroup WHERE username IN ($ph) ORDER BY priority ASC LIMIT 1");
    $st->execute($targets);
    $currGroup = $st->fetchColumn() ?: null;

    $st = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Expiration' LIMIT 1");
    $st->execute($targets);
    $currExpStr = $st->fetchColumn() ?: null;
    $currExp = $currExpStr ? DateTimeImmutable::createFromFormat('M d Y H:i:s', $currExpStr, $tz) : null;

    // Duration for current window: user override -> group -> default(30)
    $currDur = null;
    $st = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Nister-Duration-Days' LIMIT 1");
    $st->execute($targets);
    $vd = $st->fetchColumn();
    if ($vd !== false && $vd !== null && $vd !== '') $currDur = (int)$vd;
    if ($currDur === null && $currGroup) {
        $st = $r->prepare("SELECT `value` FROM radgroupreply WHERE groupname=:g AND attribute='Nister-Duration-Days' LIMIT 1");
        $st->execute([':g'=>$currGroup]); $vd = $st->fetchColumn();
        if ($vd === false || $vd === null || $vd === '') {
            $st = $r->prepare("SELECT `value` FROM radgroupcheck WHERE groupname=:g AND attribute='Nister-Duration-Days' LIMIT 1");
            $st->execute([':g'=>$currGroup]); $vd = $st->fetchColumn();
        }
        if ($vd !== false && $vd !== null && $vd !== '') $currDur = (int)$vd;
    }
    if ($currDur === null) $currDur = 30;

    // Remaining from current window
    $carry = 0;
    $prevTotal = nister_current_total_quota($r, $targets, $currGroup);
    if ($prevTotal && $currExp) {
        $windowStart = $currExp->modify('-'.$currDur.' days');
        $used = nister_sum_used_bytes($r, $targets, $windowStart, $now);
        $rem = $prevTotal - $used;
        if ($rem > 0) $carry = $rem;
    }

    $newQuota = (int)($plan['quota_bytes'] ?? 0);
    $combined = $carry + $newQuota;

    // Expiration: strictly "now + plan duration" end-of-day
    $expStr = $newExpiresAt->format('M d Y H:i:s');

    foreach ($targets as $u) {
        radius_set_user_group($r, $u, (string)$plan['code']);
        // STACKING FIX: delegate to DB proc (adds new cap to remaining, extends from later of now/current expiry)
          $capBytes = (int)($plan['quota_bytes'] ?? 0);  // DB computes carry
        $durDays  = (int)($plan['duration_days'] ?? 30);
        $pname    = (string)($plan['code'] ?? 'UNKNOWN');
        try {
            $call = $r->prepare("CALL nister_apply_topup(?, ?, ?, ?)");
            $call->execute([$u, $capBytes, $durDays, $pname]);
              $call->closeCursor();
        } catch (Throwable $e) {
            // Fail loud so we don't silently reset quotas
            throw $e;
        }
        if (!empty($plan['address_list'])) {
            radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', (string)$plan['address_list']);
        }
        if (!empty($plan['rate_limit'])) {
            radius_set_reply($r, $u, 'Mikrotik-Rate-Limit', ':=', (string)$plan['rate_limit']);
        }
    }
}
function radius_get_active_plan(string $msisdn): ?array {
  $r = rdb_pdo();
  $targets = nister_username_variants($msisdn);
  $ph = implode(",", array_fill(0, count($targets), "?"));

  // Group (plan code)
  $g = null;
  $st = $r->prepare("SELECT groupname FROM radusergroup WHERE username IN ($ph) ORDER BY priority ASC LIMIT 1");
  $st->execute($targets);
  $g = $st->fetchColumn() ?: null;
  if (!$g) {
    // No group -> maybe not applied through group model; still try to surface expiration
    $exp = null;
    $st2 = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Expiration' LIMIT 1");
    $st2->execute($targets);
    $exp = $st2->fetchColumn() ?: null;
    return $exp ? ['plan_code'=>null,'expires_at'=>$exp] : null;
  }

  // Expiration
  $exp = null;
  $st2 = $r->prepare("SELECT `value` FROM radreply WHERE username IN ($ph) AND attribute='Expiration' LIMIT 1");
  $st2->execute($targets);
  $exp = $st2->fetchColumn() ?: null;

  // Gather plan attrs from group tables
  $attrs = [];
  foreach (['radgroupreply','radgroupcheck'] as $tbl) {
    $st3 = $r->prepare("SELECT attribute, `value` FROM {$tbl} WHERE groupname=:g");
    $st3->execute([':g'=>$g]);
    while ($row = $st3->fetch()) {
      $attrs[$row['attribute']] = $row['value'];
    }
  }

  $name = str_replace(['_','-'],' ', $g);
  return [
    'plan_code'     => $g,
    'name'          => $name,
    'rate_limit'    => $attrs['Mikrotik-Rate-Limit'] ?? null,
    'address_list'  => $attrs['Mikrotik-Address-List'] ?? 'HS_ACTIVE',
    'price_cents'   => isset($attrs['Nister-Price-Cents']) ? (int)$attrs['Nister-Price-Cents'] : null,
    'duration_days' => isset($attrs['Nister-Duration-Days']) ? (int)$attrs['Nister-Duration-Days'] : null,
    'expires_at'    => $exp,
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
