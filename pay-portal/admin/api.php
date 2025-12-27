<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/wallet.php'; // still used elsewhere
require_once __DIR__.'/../lib/radius.php';
require_once __DIR__.'/../lib/common.php';
require_once __DIR__.'/../lib/admin_auth.php';

$ENV = admin_boot();
header('Content-Type: application/json; charset=utf-8');

if (!admin_logged_in()) {
  http_response_code(401);
  echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit;
}

$fn = $_GET['fn'] ?? '';
$in = array_merge($_POST, body_json());

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

    case 'stats': {
      $row = $PDO->query("SELECT COALESCE(SUM(balance_cents),0) AS cents FROM accounts")->fetch();
      $wallet_liability_cents = (int)($row['cents'] ?? 0);

      $s = $PDO->query("
        SELECT
          SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) AS pending_cnt,
          SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_cnt,
          COALESCE(SUM(CASE WHEN status='approved' THEN amount*100 ELSE 0 END),0) AS approved_cents
        FROM payments
      ")->fetch();

      $t = $PDO->query("
        SELECT COALESCE(SUM(amount*100),0) AS cents
        FROM payments
        WHERE status='approved' AND DATE(approved_at)=CURDATE()
      ")->fetch();

      $p = $PDO->query("
        SELECT
          COALESCE(SUM(price_cents),0) AS total_cents,
          COALESCE(SUM(CASE WHEN status='applied' THEN price_cents ELSE 0 END),0) AS applied_cents,
          COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending_cnt,
          COALESCE(SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END),0) AS applied_cnt
        FROM purchases
      ")->fetch();

      $ap = $PDO->query("
        SELECT COUNT(DISTINCT msisdn) AS active_users
        FROM purchases
        WHERE status='applied'
          AND (expires_at IS NULL OR expires_at >= NOW())
      ")->fetch();

      $pay_series = $PDO->query("
        SELECT DATE(approved_at) AS d, COALESCE(SUM(amount*100),0) AS cents
        FROM payments
        WHERE status='approved' AND approved_at IS NOT NULL
        GROUP BY DATE(approved_at)
        ORDER BY d DESC
        LIMIT 14
      ")->fetchAll();

      $pur_series = $PDO->query("
        SELECT DATE(activated_at) AS d, COALESCE(SUM(price_cents),0) AS cents
        FROM purchases
        WHERE status='applied' AND activated_at IS NOT NULL
        GROUP BY DATE(activated_at)
        ORDER BY d DESC
        LIMIT 14
      ")->fetchAll();

      echo json_encode([
        'ok' => true,
        'wallet_liability_cents' => (int)$wallet_liability_cents,
        'payments' => [
          'pending_cnt'   => (int)($s['pending_cnt'] ?? 0),
          'approved_cnt'  => (int)($s['approved_cnt'] ?? 0),
          'approved_cents'=> (int)($s['approved_cents'] ?? 0),
          'approved_today_cents' => (int)($t['cents'] ?? 0),
          'series' => $pay_series,
        ],
        'purchases' => [
          'total_cents'  => (int)($p['total_cents']  ?? 0),
          'applied_cents'=> (int)($p['applied_cents']?? 0),
          'pending_cnt'  => (int)($p['pending_cnt']  ?? 0),
          'applied_cnt'  => (int)($p['applied_cnt']  ?? 0),
          'series' => $pur_series,
        ],
        'active_users' => (int)($ap['active_users'] ?? 0),
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
          $amount_cents = (int)round(((float)$row['amount'])*100);

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

    default:
      http_response_code(400);
      echo json_encode(['ok'=>false,'error'=>'unknown_fn']);
  }
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'server_error','detail'=>$e->getMessage()]);
}
