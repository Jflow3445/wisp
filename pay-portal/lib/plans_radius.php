<?php
declare(strict_types=1);
require_once __DIR__.'/nister_pdo.php';
require_once __DIR__.'/common.php';

/**
 * Use rdb_pdo() from lib/radius.php if it exists; otherwise define it here.
 * This avoids "Cannot redeclare rdb_pdo()" fatals.
 */
if (!function_exists('rdb_pdo')) {
  if (!function_exists("rdb_pdo")) {
function rdb_pdo(): PDO {
    $env = app_boot();
    $dsn = $env['RADIUS_DSN'] ?? '';
    $u   = $env['RADIUS_USER'] ?? '';
    $p   = $env['RADIUS_PASS'] ?? '';
    if ($dsn === '' || $u === '') {
      throw new RuntimeException('RADIUS DB not configured in .env');
    }
    return new NisterPDO(
      $dsn, $u, $p,
      [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]
    );
  }
}

}

function radius_fetch_plans(bool $includeInactive=false): array {
  $r = rdb_pdo();
  $rows = [];
  foreach (['radgroupreply','radgroupcheck'] as $tbl) {
    $st = $r->query("SELECT groupname,attribute,value FROM {$tbl}");
    while ($x = $st->fetch()) {
      $g = $x['groupname'];
      if (in_array($g, ['HS_ACTIVE','HS_LIMITED'], true)) continue;
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

  $plans = array_values(array_filter($plans, function($p) use ($includeInactive){
    if (!$includeInactive && !$p['active']) return false;
    return ($p['price_cents'] !== null || $p['rate_limit'] !== null || $p['quota_bytes'] !== null || $p['display_name'] !== null);
  }));
  usort($plans, fn($a,$b)=> ($a['price_cents'] ?? PHP_INT_MAX) <=> ($b['price_cents'] ?? PHP_INT_MAX));
  return $plans;
}

function radius_find_plan(string $code): ?array {
  foreach (radius_fetch_plans() as $p) {
    if (strcasecmp($p['code'], $code) === 0) return $p;
  }
  return null;
}
