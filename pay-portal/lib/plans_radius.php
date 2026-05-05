<?php
declare(strict_types=1);
require_once __DIR__.'/nister_pdo.php';
require_once __DIR__.'/common.php';
require_once __DIR__.'/location.php';

function radius_plan_key(?string $code): string {
  return strtoupper(trim((string)$code));
}

function radius_plan_visible(array $p, bool $includeInactive): bool {
  if (!$includeInactive && array_key_exists('active', $p) && !$p['active']) return false;
  return ($p['price_cents'] !== null || $p['rate_limit'] !== null || $p['quota_bytes'] !== null || $p['display_name'] !== null);
}

function radius_plan_sort(array &$plans): void {
  usort($plans, function($a, $b) {
    $ap = ($a['price_cents'] ?? PHP_INT_MAX);
    $bp = ($b['price_cents'] ?? PHP_INT_MAX);
    if ($ap !== $bp) return $ap <=> $bp;
    return strcasecmp((string)($a['code'] ?? ''), (string)($b['code'] ?? ''));
  });
}

function radius_merge_location_overrides(array $globalPlansAll, array $sitePlansAll): array {
  $merged = [];
  foreach ($globalPlansAll as $p) {
    $k = radius_plan_key((string)($p['code'] ?? ''));
    if ($k === '') continue;
    $merged[$k] = $p;
  }

  foreach ($sitePlansAll as $site) {
    $k = radius_plan_key((string)($site['code'] ?? ''));
    if ($k === '') continue;

    $base = $merged[$k] ?? [
      'code' => (string)($site['code'] ?? $k),
      'name' => (string)($site['name'] ?? $site['code'] ?? $k),
      'display_name' => null,
      'price_cents' => null,
      'duration_days' => 30,
      'quota_bytes' => null,
      'rate_limit' => null,
      'address_list' => 'HS_ACTIVE',
      'active' => true,
    ];

    foreach (['display_name','name','price_cents','duration_days','quota_bytes','rate_limit','address_list'] as $f) {
      if (!array_key_exists($f, $site)) continue;
      $v = $site[$f];
      if ($v === null || $v === '') continue;
      $base[$f] = $v;
    }

    if (array_key_exists('active', $site)) {
      $base['active'] = (bool)$site['active'];
    }
    if (!empty($base['display_name'])) {
      $base['name'] = (string)$base['display_name'];
    }
    if (!isset($base['duration_days']) || (int)$base['duration_days'] <= 0) {
      $base['duration_days'] = 30;
    }
    if (!isset($base['address_list']) || trim((string)$base['address_list']) === '') {
      $base['address_list'] = 'HS_ACTIVE';
    }
    $base['code'] = (string)($base['code'] ?? $site['code'] ?? $k);
    $merged[$k] = $base;
  }

  return array_values($merged);
}

/**
 * Use rdb_pdo() from lib/radius.php if it exists; otherwise define it here.
 * This avoids "Cannot redeclare rdb_pdo()" fatals.
 */
if (!function_exists('rdb_pdo')) {
  function rdb_pdo(): PDO {
    $env = app_boot();
    [$dsn, $u, $p] = nister_radius_db_params($env);
    if ($dsn === '' || $u === '') {
      throw new RuntimeException('RADIUS DB not configured (RADIUS_DSN/RADIUS_USER or /etc/nister/radius_db.php)');
    }
    return new NisterPDO(
      $dsn, $u, $p,
      [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]
    );
  }
}

function radius_fetch_global_plans(bool $includeInactive=false): array {
  $r = rdb_pdo();
  $rows = [];
  foreach (['radgroupreply','radgroupcheck'] as $tbl) {
    $st = $r->query("SELECT groupname,attribute,value FROM {$tbl}");
    while ($x = $st->fetch()) {
      $g = $x['groupname'];
      if (in_array($g, ['HS_ACTIVE','HS_LIMITED','HS_NOPAID','nopaid'], true)) continue;
      $rows[] = $x;
    }
  }

  $plans = [];
  foreach ($rows as $row) {
    $g = $row['groupname'];
    $attr = $row['attribute'];
    $val = trim((string)$row['value']);
    $p = $plans[$g] ?? [
      'code'=>$g,'name'=>$g,'display_name'=>null,
      'price_cents'=>null,'duration_days'=>null,'quota_bytes'=>null,
      'rate_limit'=>null,'address_list'=>null,'active'=>true,
      '_mt_hi'=>null,'_mt_lo'=>null
    ];
    switch ($attr) {
      case 'Nister-Plan-Name':
        $p['display_name'] = $val;
        $p['name'] = $val;
        break;
      case 'Nister-Price-Cents':   $p['price_cents']   = (int)$val; break;
      case 'Nister-Duration-Days': $p['duration_days'] = (int)$val; break;
      case 'Nister-Quota-Bytes':   $p['quota_bytes']   = (int)$val; break;
      case 'Nister-Active':
        $lv = strtolower($val);
        $p['active'] = !in_array($lv, ['0','false','no','off'], true);
        break;
      case 'Mikrotik-Rate-Limit':  $p['rate_limit']    = $val;      break;
      case 'Mikrotik-Total-Limit-Gigawords': $p['_mt_hi'] = (int)$val; break;
      case 'Mikrotik-Total-Limit':           $p['_mt_lo'] = (int)$val; break;
      case 'Mikrotik-Address-List':$p['address_list']  = $val;      break;
      default:
        if ($p['name'] === $g) $p['name'] = str_replace(['_','-'],' ',$g);
    }
    $plans[$g] = $p;
  }

  foreach ($plans as $k=>&$p) {
    if ($p['quota_bytes'] === null) {
      $hi = (int)($p['_mt_hi'] ?? 0);
      $lo = (int)($p['_mt_lo'] ?? 0);
      if ($hi || $lo) {
        $p['quota_bytes'] = (int)($hi * 4294967296 + $lo);
      }
    }
    unset($p['_mt_hi'], $p['_mt_lo']);
    if ($p['duration_days'] === null) $p['duration_days'] = 30;
    if ($p['address_list'] === null)  $p['address_list']  = 'HS_ACTIVE';
  } unset($p);

  $plans = array_values(array_filter($plans, fn($p) => radius_plan_visible($p, $includeInactive)));
  radius_plan_sort($plans);
  return $plans;
}

function radius_fetch_plans(bool $includeInactive=false, ?int $locationId=null, bool $strictLocation=false): array {
  if ($locationId !== null && $locationId > 0) {
    try {
      // Site catalog rows act as per-plan overrides. Missing site rows should not hide
      // global plans, otherwise a partial catalog collapses visibility to a single plan.
      $sitePlansAll = location_fetch_plan_catalog($locationId, true);
      if ($sitePlansAll) {
        $globalAll = radius_fetch_global_plans(true);
        $merged = radius_merge_location_overrides($globalAll, $sitePlansAll);
        $merged = array_values(array_filter($merged, fn($p) => radius_plan_visible($p, $includeInactive)));
        radius_plan_sort($merged);
        return $merged;
      }
      if ($strictLocation) {
        // Compatibility hotfix:
        // keep strict site catalog behavior when a site catalog exists,
        // but do not break legacy auth/renew/purchase flows on sites that
        // have not been configured yet.
        $hasAnySiteCatalog = !empty(location_fetch_plan_catalog($locationId, true));
        if ($hasAnySiteCatalog) return [];
      }
    } catch (Throwable $e) {
      if ($strictLocation) return radius_fetch_global_plans($includeInactive);
      // fall back to global RADIUS plan attrs
    }
  }
  return radius_fetch_global_plans($includeInactive);
}

function radius_find_plan(string $code, ?int $locationId=null, bool $strictLocation=false): ?array {
  foreach (radius_fetch_plans(true, $locationId, $strictLocation) as $p) {
    if (strcasecmp($p['code'], $code) === 0) return $p;
  }
  if (!$strictLocation && $locationId !== null && $locationId > 0) {
    foreach (radius_fetch_global_plans(true) as $p) {
      if (strcasecmp($p['code'], $code) === 0) return $p;
    }
  }
  return null;
}
