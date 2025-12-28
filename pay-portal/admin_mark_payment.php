<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/db.php';

try{
  $ENV = app_boot();
  $PDO = db_pdo($ENV);

  $SECRET = (string)($ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
  $tok    = (string)($_GET['s'] ?? $_POST['s'] ?? '');
  if ($SECRET === '' || !hash_equals($SECRET, $tok)) {
    throw new RuntimeException('forbidden');
  }

  $ref    = (string)($_GET['ref'] ?? $_POST['ref'] ?? '');
  $action = strtolower((string)($_GET['action'] ?? $_POST['action'] ?? ''));
  if ($ref === '' || !in_array($action, ['approve','decline'], true)) {
    throw new RuntimeException('ref + action required');
  }

  // Fetch payment
  $st = $PDO->prepare("SELECT id, ref, msisdn, amount_cents, amount, status FROM payments WHERE ref=:r LIMIT 1");
  $st->execute([':r'=>$ref]);
  $p = $st->fetch(PDO::FETCH_ASSOC);
  if (!$p) throw new RuntimeException('not found');
  if ($p['status'] !== 'pending') throw new RuntimeException('already processed');

  if ($action === 'decline') {
    $up = $PDO->prepare("UPDATE payments SET status='declined', approved_at=NOW(), approved_by='admin' WHERE id=:id");
    $up->execute([':id'=>$p['id']]);
    echo json_encode(['ok'=>true,'ref'=>$ref,'status'=>'declined'], JSON_UNESCAPED_SLASHES);
    exit;
  }

  // APPROVE: credit accounts + ledger, then mark payments approved
  $msisdn = (string)$p['msisdn'];
  $amtc   = (int)($p['amount_cents'] ?? 0);
  if ($amtc <= 0 && isset($p['amount'])) {
    $amtc = (int)round(((float)$p['amount']) * 100);
  }
  if ($amtc <= 0) throw new RuntimeException('bad amount');

  // Ensure tables exist (lightweight)
  $PDO->exec("CREATE TABLE IF NOT EXISTS accounts (
    msisdn VARCHAR(32) PRIMARY KEY,
    balance_cents INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  $PDO->exec("CREATE TABLE IF NOT EXISTS ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    msisdn VARCHAR(32) NOT NULL,
    type VARCHAR(32) NOT NULL,
    amount_cents INT NOT NULL,
    ref VARCHAR(64) NULL,
    notes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msisdn_created (msisdn, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

  // Tx
  $PDO->beginTransaction();
  // credit ledger
  $insL = $PDO->prepare("INSERT INTO ledger (msisdn,type,amount_cents,ref,notes) VALUES (:m,'deposit',:a,:r,'Admin approval')");
  $insL->execute([':m'=>$msisdn, ':a'=>$amtc, ':r'=>$ref]);

  // upsert account balance
  $upA = $PDO->prepare("INSERT INTO accounts (msisdn,balance_cents) VALUES (:m,:a)
                        ON DUPLICATE KEY UPDATE balance_cents = balance_cents + VALUES(balance_cents)");
  $upA->execute([':m'=>$msisdn, ':a'=>$amtc]);

  // mark payment
  $upP = $PDO->prepare("UPDATE payments SET status='approved', approved_at=NOW(), approved_by='admin' WHERE id=:id");
  $upP->execute([':id'=>$p['id']]);

  $PDO->commit();

  // Return new balance
  $bal = $PDO->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m");
  $bal->execute([':m'=>$msisdn]);
  $b = (int)($bal->fetchColumn() ?: 0);

  echo json_encode(['ok'=>true,'ref'=>$ref,'status'=>'approved','balance_cents'=>$b], JSON_UNESCAPED_SLASHES);
} catch(Throwable $e){
  if (isset($PDO) && $PDO->inTransaction()) $PDO->rollBack();
  http_response_code(400);
  echo json_encode(['ok'=>false,'error'=>$e->getMessage()], JSON_UNESCAPED_SLASHES);
}
