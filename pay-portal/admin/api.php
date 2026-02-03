<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/wallet.php'; // still used elsewhere
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/plans_radius.php';
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/settings.php';
require_once __DIR__.'/../lib/alerts.php';
require_once __DIR__.'/../lib/admin_auth.php';

$ENV = admin_boot();
header('Content-Type: application/json; charset=utf-8');

if (!admin_logged_in()) {
  http_response_code(401);
  echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit;
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

function settings_allowed_keys(): array {
  return [
    'HOTSPOT_API_BASE',
    'PAY_BASE',
    'WHATSAPP_SUPPORT',
    'TOPUP_NETWORK',
    'TOPUP_NAME',
    'TOPUP_NUMBER',
    'TOPUP_WA_TEXT',
  ];
}

function normalize_setting_value(string $k, ?string $v): string {
  $v = trim((string)$v);
  if ($k === 'HOTSPOT_API_BASE' || $k === 'PAY_BASE') {
    $v = rtrim($v, '/');
  }
  if ($k === 'WHATSAPP_SUPPORT') {
    $v = preg_replace('/\D+/', '', $v);
  }
  return $v;
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

    case 'settings_get': {
      $keys = settings_allowed_keys();
      $out = [];
      foreach ($keys as $k) {
        $out[$k] = settings_get($k, '') ?? '';
      }
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

    case 'user_state_list': {
      $r = rdb_pdo();
      $limit = isset($in['limit']) ? max(1, min(1000, (int)$in['limit'])) : 300;
      $where = "rug.groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID')";
      $params = [];
      if (!empty($in['group'])) {
        $g = (string)$in['group'];
        if (in_array($g, ['HS_ACTIVE','HS_LIMITED','HS_NOPAID'], true)) {
          $where = "rug.groupname = :g";
          $params[':g'] = $g;
        }
      }
      if (!empty($in['search'])) {
        $where .= " AND rug.username LIKE :q";
        $params[':q'] = '%'.preg_replace('/\D+/', '', (string)$in['search']).'%';
      }
      $having = [];
      if (!empty($in['expired_only'])) $having[] = "expired_flag = 1";
      if (!empty($in['exhausted_only'])) $having[] = "exhausted_flag = 1";
      $havingSql = $having ? ("HAVING ".implode(" AND ", $having)) : "";

      $st = $r->prepare("
        SELECT
          rug.username,
          rug.groupname,
          rc.value AS expires,
          ws.value AS window_start,
          rq.value AS quota_bytes,
          rl.value AS rate_limit,
          (
            SELECT COALESCE(SUM(
              COALESCE(ra.acctinputoctets,0)+COALESCE(ra.acctoutputoctets,0) +
              4294967296*(COALESCE(ra.acctinputgigawords,0)+COALESCE(ra.acctoutputgigawords,0))
            ),0)
            FROM radacct ra
            WHERE ra.username = rug.username
              AND ra.acctstarttime >= COALESCE(ws.value, DATE_SUB(NOW(), INTERVAL 30 DAY))
          ) AS used_bytes,
          CASE
            WHEN rc.value IS NULL THEN 0
            WHEN STR_TO_DATE(rc.value, '%d %b %Y %H:%i:%s') <= NOW() THEN 1
            ELSE 0
          END AS expired_flag,
          CASE
            WHEN rq.value IS NULL THEN 0
            WHEN (
              SELECT COALESCE(SUM(
                COALESCE(ra.acctinputoctets,0)+COALESCE(ra.acctoutputoctets,0) +
                4294967296*(COALESCE(ra.acctinputgigawords,0)+COALESCE(ra.acctoutputgigawords,0))
              ),0)
              FROM radacct ra
              WHERE ra.username = rug.username
                AND ra.acctstarttime >= COALESCE(ws.value, DATE_SUB(NOW(), INTERVAL 30 DAY))
            ) >= CAST(rq.value AS UNSIGNED) THEN 1
            ELSE 0
          END AS exhausted_flag
        FROM radusergroup rug
        LEFT JOIN radcheck rc
          ON rc.username = rug.username AND rc.attribute='Expiration'
        LEFT JOIN radreply rq
          ON rq.username = rug.username AND rq.attribute='Nister-Quota-Bytes'
        LEFT JOIN radreply ws
          ON ws.username = rug.username AND ws.attribute='Nister-Window-Start'
        LEFT JOIN radreply rl
          ON rl.username = rug.username AND rl.attribute='Mikrotik-Rate-Limit'
        WHERE {$where}
        {$havingSql}
        ORDER BY rug.groupname, rug.username
        LIMIT :lim
      ");
      $st->bindValue(':lim', $limit, PDO::PARAM_INT);
      foreach ($params as $k=>$v) $st->bindValue($k, $v);
      $st->execute();
      $rows = $st->fetchAll() ?: [];
      echo json_encode(['ok'=>true,'users'=>$rows]);
      break;
    }

    case 'stats': {
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
      if (table_exists($PDO, 'purchases')) {
        $ap = $PDO->query("
          SELECT COUNT(DISTINCT msisdn) AS active_users
          FROM purchases
          WHERE status='applied'
            AND (expires_at IS NULL OR expires_at >= NOW())
        ")->fetch() ?: $ap;
      }

      $pay_series = [];
      $pur_series = [];
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

      $active_sessions = null;
      try {
        $r = rdb_pdo();
        $active_sessions = (int)($r->query("SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL")->fetchColumn() ?: 0);
      } catch (Throwable $e) {
        $active_sessions = null;
      }

      echo json_encode([
        'ok' => true,
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
        'active_users' => (int)($ap['active_users'] ?? 0),
        'active_sessions' => $active_sessions,
      ]);
      break;
    }

    case 'pending': {
      $st = $PDO->query("
        SELECT id, ref, msisdn, amount, method, payer_name, notes, status, created_at
        FROM payments
        WHERE status='pending'
        ORDER BY id DESC
        LIMIT 200
      ");
      echo json_encode(['ok'=>true,'pending'=>$st->fetchAll()]);
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

      $outerStarted = false;
      if (!$PDO->inTransaction()) { $PDO->beginTransaction(); $outerStarted = true; }

      try {
        // Lock row
        $st = $PDO->prepare("SELECT * FROM payments WHERE ref=:r FOR UPDATE");
        $st->execute([':r'=>$ref]);
        $row = $st->fetch();
        if (!$row) { throw new RuntimeException('not_found'); }
        if ($row['status'] !== 'pending') {
          echo json_encode(['ok'=>true,'status'=>$row['status'],'ref'=>$ref]);
          if ($outerStarted) $PDO->commit();
          break;
        }

        if ($act === 'approve') {
          // mark approved
          $st = $PDO->prepare("UPDATE payments
            SET status='approved',
                notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END),
                approved_at=NOW()
            WHERE ref=:r");
          $st->execute([':n'=>$notes, ':r'=>$ref]);

          // Inline credit (avoid nested transactions)
          $msisdn = (string)$row['msisdn'];
          $amount_cents = 0;
          if (isset($row['amount_cents']) && is_numeric($row['amount_cents'])) {
            $amount_cents = (int)$row['amount_cents'];
          }
          if ($amount_cents <= 0 && isset($row['amount'])) {
            $amount_cents = (int)round(((float)$row['amount']) * 100);
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
          $st = $PDO->prepare("UPDATE payments
            SET status='declined',
                notes=CONCAT(COALESCE(notes,''), CASE WHEN :n<>'' THEN CONCAT(' | ', :n) ELSE '' END)
            WHERE ref=:r");
          $st->execute([':n'=>$notes, ':r'=>$ref]);
        }

        if ($outerStarted) $PDO->commit();
        echo json_encode(['ok'=>true,'ref'=>$ref,'status'=>$act === 'approve' ? 'approved':'declined']);
      } catch (Throwable $e) {
        if ($outerStarted && $PDO->inTransaction()) $PDO->rollBack();
        if ($e->getMessage() === 'not_found') {
          http_response_code(404); echo json_encode(['ok'=>false,'error'=>'not_found']);
        } else {
          http_response_code(500); echo json_encode(['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()]);
        }
      }
      break;
    }

    case 'plans': {
      try {
        $plans = radius_fetch_plans(true);
        echo json_encode(['ok'=>true,'plans'=>$plans]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_list_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'plan_save': {
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
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_save_failed','detail'=>$e->getMessage()]);
        break;
      }

      $saved = null;
      try {
        foreach (radius_fetch_plans(true) as $p) {
          if (strcasecmp($p['code'], $code) === 0) { $saved = $p; break; }
        }
      } catch (Throwable $e) { $saved = null; }
      echo json_encode(['ok'=>true,'plan'=>$saved]);
      break;
    }

    case 'plan_delete': {
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
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'plan_delete_failed','detail'=>$e->getMessage()]);
        break;
      }

      echo json_encode(['ok'=>true]);
      break;
    }

    case 'user_lookup': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }

      $out = ['ok'=>true,'msisdn'=>$msisdn];
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

      try {
        $out['active_plan'] = radius_get_active_plan($msisdn);
      } catch (Throwable $e) {
        $out['active_plan'] = null;
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

    case 'user_set_expiry': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $raw = trim((string)from_any([$in],'expires_at',''));
      $days = (int)from_any([$in],'days',0);
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
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
      $addrUp = strtoupper($addr);
      try {
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', $addr);
          if ($addrUp === 'HS_ACTIVE') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_LIMITED','HS_NOPAID')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_ACTIVE', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_ACTIVE'
                         )")->execute([':u'=>$u]);
          } elseif ($addrUp === 'HS_LIMITED') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname='HS_ACTIVE'")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_LIMITED', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_LIMITED'
                         )")->execute([':u'=>$u]);
          } elseif ($addrUp === 'HS_NOPAID') {
            $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED')")->execute([':u'=>$u]);
            $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                         SELECT :u, 'HS_NOPAID', 0 FROM DUAL
                         WHERE NOT EXISTS (
                           SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_NOPAID'
                         )")->execute([':u'=>$u]);
          }
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
      try {
        $r = rdb_pdo();
        $g = strtoupper($group);
        if (!in_array($g, ['HS_ACTIVE','HS_LIMITED','HS_NOPAID'], true)) {
          http_response_code(400);
          echo json_encode(['ok'=>false,'error'=>'group_invalid','detail'=>'Only HS_ACTIVE, HS_LIMITED, HS_NOPAID allowed']);
          break;
        }
        foreach (nister_username_variants($msisdn) as $u) {
          $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID')")->execute([':u'=>$u]);
          $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                       SELECT :u, :g, 0 FROM DUAL
                       WHERE NOT EXISTS (
                         SELECT 1 FROM radusergroup WHERE username=:u AND groupname=:g
                       )")->execute([':u'=>$u, ':g'=>$g]);
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
      try {
        $r = rdb_pdo();
        foreach (nister_username_variants($msisdn) as $u) {
          $r->prepare("DELETE FROM radusergroup WHERE username=:u AND groupname IN ('HS_ACTIVE','HS_LIMITED','HS_NOPAID')")->execute([':u'=>$u]);
          $r->prepare("INSERT INTO radusergroup (username, groupname, priority)
                       SELECT :u, 'HS_NOPAID', 0 FROM DUAL
                       WHERE NOT EXISTS (
                         SELECT 1 FROM radusergroup WHERE username=:u AND groupname='HS_NOPAID'
                       )")->execute([':u'=>$u]);
          radius_set_reply($r, $u, 'Mikrotik-Address-List', ':=', 'HS_NOPAID');
          $r->prepare("DELETE FROM radreply WHERE username=:u AND attribute IN ('Mikrotik-Rate-Limit','Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')")->execute([':u'=>$u]);
        }
        echo json_encode(['ok'=>true]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'reset_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'credit_wallet': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $amount = parse_amount_cents($in);
      $notes = trim((string)($in['notes'] ?? 'Admin credit'));
      if ($msisdn === '' || $amount <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and amount required']); break; }

      $ref = 'ADM-' . date('YmdHis') . '-' . bin2hex(random_bytes(3));
      try {
        wallet_credit($msisdn, $amount, $ref, $notes);
        $bal = null;
        try { $bal = wallet_balance($msisdn); } catch (Throwable $e) { $bal = null; }
        echo json_encode(['ok'=>true,'ref'=>$ref,'balance_cents'=>$bal]);
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'credit_failed','detail'=>$e->getMessage()]);
      }
      break;
    }

    case 'apply_plan': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      $code = (string)from_any([$in],'plan_code','');
      if ($msisdn === '' || $code === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn and plan_code required']); break; }

      $plan = radius_find_plan($code);
      if (!$plan) { http_response_code(404); echo json_encode(['ok'=>false,'error'=>'unknown_plan']); break; }

      $price = parse_amount_cents($in);
      if ($price <= 0 && isset($plan['price_cents'])) $price = (int)$plan['price_cents'];

      $days = (int)($plan['duration_days'] ?? 30);
      if ($days <= 0) $days = 30;
      $expires = (new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get())))
        ->modify('+'.$days.' days')->setTime(23,59,59);

      $applyPlan = [
        'code'         => $plan['code'],
        'address_list' => $plan['address_list'] ?? 'HS_ACTIVE',
        'rate_limit'   => $plan['rate_limit'] ?? null,
        'quota_bytes'  => $plan['quota_bytes'] ?? null,
        'duration_days'=> $days
      ];

      try {
        radius_apply_plan($msisdn, $applyPlan, $expires);
        if (function_exists('radius_try_disconnect')) {
          try { radius_try_disconnect($msisdn, is_array($ENV) ? $ENV : []); } catch (Throwable $e) { /* ignore */ }
        }
      } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'apply_failed','detail'=>$e->getMessage()]);
        break;
      }

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
          if (!empty($has['plan_code'])) $add('plan_code', $plan['code']);
          if (!empty($has['price_cents']) && $price > 0) $add('price_cents', $price);
          if (!empty($has['status'])) $add('status', 'applied');
          if (!empty($has['activated_at'])) { $fields[]='`activated_at`'; $vals[]='NOW()'; }
          if (!empty($has['expires_at'])) $add('expires_at', $expires->format('Y-m-d H:i:s'));

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

      echo json_encode(['ok'=>true,'expires_at'=>$expires->format('Y-m-d H:i:s'),'purchase_id'=>$pid,'purchase_error'=>$purchaseErr]);
      break;
    }

    case 'disconnect_user': {
      $msisdn = normalize_msisdn((string)from_any([$in],'msisdn',''));
      if ($msisdn === '') { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'msisdn required']); break; }
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
