<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';
require_once __DIR__.'/location.php';

function wallet_allow_create(): bool {
  $v = null;
  if (isset($GLOBALS['ENV']) && is_array($GLOBALS['ENV'])) {
    $v = $GLOBALS['ENV']['WALLET_AUTO_CREATE'] ?? null;
  }
  if ($v === null || $v === '') $v = getenv('WALLET_AUTO_CREATE');
  if ($v === null || $v === '') $v = $_ENV['WALLET_AUTO_CREATE'] ?? null;
  if (is_bool($v)) return $v;
  $s = strtolower(trim((string)$v));
  return in_array($s, ['1','true','yes','y','on'], true);
}

function wallet_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t'=>$table]);
  return (bool)$st->fetchColumn();
}

function wallet_ledger_ref_unique_exists(PDO $pdo): bool {
  $st = $pdo->prepare(
    "SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'ledger'
       AND non_unique = 0
       AND column_name = 'ref'
     LIMIT 1"
  );
  $st->execute();
  return (bool)$st->fetchColumn();
}

function wallet_ensure_ledger_ref_unique(PDO $pdo): void {
  if (!wallet_table_exists($pdo, 'ledger')) return;
  if (wallet_ledger_ref_unique_exists($pdo)) return;
  $dup = (int)($pdo->query(
    "SELECT 1
     FROM ledger
     WHERE ref IS NOT NULL AND ref <> ''
     GROUP BY ref
     HAVING COUNT(*) > 1
     LIMIT 1"
  )->fetchColumn() ?: 0);
  if ($dup > 0) return;
  try {
    $pdo->exec("ALTER TABLE ledger ADD UNIQUE KEY uq_ledger_ref (ref)");
  } catch (Throwable $e) {
    // Non-fatal hardening: continue without index if migration cannot be applied.
  }
}

function wallet_ref_lock_name(string $ref): string {
  return 'wallet_ref:' . substr(hash('sha256', $ref), 0, 40);
}

function wallet_ref_try_lock(PDO $pdo, string $ref, int $timeoutSec = 5): bool {
  $timeoutSec = max(0, min(30, $timeoutSec));
  try {
    $st = $pdo->prepare("SELECT GET_LOCK(:k, :t)");
    $st->execute([':k' => wallet_ref_lock_name($ref), ':t' => $timeoutSec]);
    return ((int)($st->fetchColumn() ?: 0)) === 1;
  } catch (Throwable $e) {
    error_log('[wallet] lock_error ref=' . $ref . ' err=' . $e->getMessage());
    return false;
  }
}

function wallet_ref_release_lock(PDO $pdo, string $ref): void {
  try {
    $st = $pdo->prepare("SELECT RELEASE_LOCK(:k)");
    $st->execute([':k' => wallet_ref_lock_name($ref)]);
  } catch (Throwable $e) {
    // ignore
  }
}

function wallet_bootstrap_tables(): void {
  static $ready = false;
  if ($ready) return;
  global $PDO;
  $GLOBALS['__WALLET_TABLES_OK'] = false;

  $hasAccounts = null;
  $hasLedger = null;
  $hasPromo = null;
  try {
    $hasAccounts = wallet_table_exists($PDO, 'accounts');
    $hasLedger = wallet_table_exists($PDO, 'ledger');
    $hasPromo = wallet_table_exists($PDO, 'wallet_promo_grants');
  } catch (Throwable $e) {
    $ready = true;
    return;
  }

  if ($hasAccounts && $hasLedger) {
    wallet_ensure_ledger_ref_unique($PDO);
    $GLOBALS['__WALLET_TABLES_OK'] = true;
    $ready = true;
    return;
  }
  if (!wallet_allow_create()) {
    $ready = true;
    return;
  }

  try {
    if (!$hasAccounts) {
      $PDO->exec("CREATE TABLE IF NOT EXISTS accounts (
        msisdn VARCHAR(32) PRIMARY KEY,
        balance_cents INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
    if (!$hasLedger) {
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
    }
    if (!$hasPromo) {
      $PDO->exec("CREATE TABLE IF NOT EXISTS wallet_promo_grants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        msisdn VARCHAR(32) NOT NULL,
        location_id INT NULL,
        ref VARCHAR(64) NOT NULL,
        total_cents INT NOT NULL,
        remaining_cents INT NOT NULL,
        expires_at DATETIME NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        consumed_at DATETIME NULL,
        expired_at DATETIME NULL,
        UNIQUE KEY uq_wallet_promo_ref_msisdn (ref, msisdn),
        KEY idx_wallet_promo_location (location_id),
        KEY idx_wallet_promo_user_state (msisdn, status, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
    location_add_column_if_missing(
      $PDO,
      'wallet_promo_grants',
      'location_id',
      "`location_id` INT NULL AFTER `msisdn`, ADD KEY `idx_wallet_promo_location` (`location_id`)"
    );
  } catch (Throwable $e) {
    $ready = true;
    return;
  }
  try {
    $hasAccounts = wallet_table_exists($PDO, 'accounts');
    $hasLedger = wallet_table_exists($PDO, 'ledger');
    if ($hasLedger) wallet_ensure_ledger_ref_unique($PDO);
    $GLOBALS['__WALLET_TABLES_OK'] = ($hasAccounts && $hasLedger);
  } catch (Throwable $e) {
    $GLOBALS['__WALLET_TABLES_OK'] = false;
  }
  $ready = true;
}

function wallet_require_tables(): void {
  wallet_bootstrap_tables();
  if (empty($GLOBALS['__WALLET_TABLES_OK'])) {
    throw new RuntimeException('wallet_tables_missing');
  }
}

function wallet_promo_table_ready(): bool {
  global $PDO;
  wallet_bootstrap_tables();
  try {
    return wallet_table_exists($PDO, 'wallet_promo_grants');
  } catch (Throwable $e) {
    return false;
  }
}

function wallet_expire_promos_for_user_locked(string $msisdn): int {
  global $PDO;
  if (!wallet_promo_table_ready()) return 0;

  $st = $PDO->prepare("SELECT id, remaining_cents
                       FROM wallet_promo_grants
                       WHERE msisdn=:m
                         AND status='active'
                         AND remaining_cents > 0
                         AND expires_at <= UTC_TIMESTAMP()
                       ORDER BY expires_at ASC, id ASC
                       FOR UPDATE");
  $st->execute([':m'=>$msisdn]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  if (!$rows) return 0;

  $PDO->prepare("INSERT IGNORE INTO accounts(msisdn,balance_cents) VALUES(:m,0)")
      ->execute([':m'=>$msisdn]);
  $balSt = $PDO->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m FOR UPDATE");
  $balSt->execute([':m'=>$msisdn]);
  $balance = max(0, (int)$balSt->fetchColumn());

  $expiredCents = 0;
  $upd = $PDO->prepare("UPDATE wallet_promo_grants
                        SET remaining_cents=0, status='expired', expired_at=UTC_TIMESTAMP()
                        WHERE id=:id");
  $dec = $PDO->prepare("UPDATE accounts SET balance_cents=GREATEST(0, balance_cents-:a) WHERE msisdn=:m");
  $ins = $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,'promo_expiry',:a,:r,:n)");

  foreach ($rows as $row) {
    $id = (int)($row['id'] ?? 0);
    $remaining = max(0, (int)($row['remaining_cents'] ?? 0));
    if ($id <= 0 || $remaining <= 0) continue;

    $deduct = min($remaining, $balance);
    if ($deduct > 0) {
      $dec->execute([':a'=>$deduct, ':m'=>$msisdn]);
      $ins->execute([
        ':m' => $msisdn,
        ':a' => -$deduct,
        ':r' => 'PROMOEXP-'.$id.'-'.gmdate('YmdHis'),
        ':n' => 'Promo credit expired',
      ]);
      $balance -= $deduct;
      $expiredCents += $deduct;
    }
    $upd->execute([':id'=>$id]);
  }

  return $expiredCents;
}

function wallet_consume_promos_on_debit_locked(string $msisdn, int $debitCents): void {
  global $PDO;
  if ($debitCents <= 0) return;
  if (!wallet_promo_table_ready()) return;

  $st = $PDO->prepare("SELECT id, remaining_cents
                       FROM wallet_promo_grants
                       WHERE msisdn=:m
                         AND status='active'
                         AND remaining_cents > 0
                         AND expires_at > UTC_TIMESTAMP()
                       ORDER BY expires_at ASC, id ASC
                       FOR UPDATE");
  $st->execute([':m'=>$msisdn]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  if (!$rows) return;

  $left = $debitCents;
  $updRemain = $PDO->prepare("UPDATE wallet_promo_grants
                              SET remaining_cents=:r
                              WHERE id=:id");
  $updDone = $PDO->prepare("UPDATE wallet_promo_grants
                            SET remaining_cents=0, status='consumed', consumed_at=UTC_TIMESTAMP()
                            WHERE id=:id");
  foreach ($rows as $row) {
    if ($left <= 0) break;
    $id = (int)($row['id'] ?? 0);
    $remaining = max(0, (int)($row['remaining_cents'] ?? 0));
    if ($id <= 0 || $remaining <= 0) continue;

    $take = min($left, $remaining);
    $next = $remaining - $take;
    if ($next <= 0) $updDone->execute([':id'=>$id]);
    else $updRemain->execute([':r'=>$next, ':id'=>$id]);
    $left -= $take;
  }
}

function wallet_expire_promos_for_user(string $msisdn): int {
  global $PDO;
  wallet_require_tables();
  if (!wallet_promo_table_ready()) return 0;

  $PDO->beginTransaction();
  try {
    $expired = wallet_expire_promos_for_user_locked($msisdn);
    $PDO->commit();
    return $expired;
  } catch (Throwable $e) {
    $PDO->rollBack();
    throw $e;
  }
}

function wallet_balance(string $msisdn): int {
  global $PDO;
  wallet_require_tables();
  try { wallet_expire_promos_for_user($msisdn); } catch (Throwable $e) { /* non-fatal */ }
  $PDO->prepare("INSERT IGNORE INTO accounts(msisdn) VALUES(:m)")->execute([':m'=>$msisdn]);
  $st=$PDO->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m"); $st->execute([':m'=>$msisdn]);
  return (int)$st->fetchColumn();
}

function wallet_credit_typed(string $msisdn, int $cents, ?string $ref=null, ?string $notes=null, string $type='deposit'): void {
  if ($cents<=0) throw new RuntimeException('credit must be positive');
  $type = strtolower(trim($type));
  if (!preg_match('/^[a-z_]{2,32}$/', $type)) $type = 'deposit';
  global $PDO;
  wallet_require_tables();
  $ref = trim((string)$ref);
  $lockHeld = false;
  if ($ref !== '') {
    $lockHeld = wallet_ref_try_lock($PDO, $ref, 5);
    if (!$lockHeld) {
      $st = $PDO->prepare("SELECT 1 FROM ledger WHERE ref=:r LIMIT 1");
      $st->execute([':r'=>$ref]);
      if ($st->fetchColumn()) return;
      throw new RuntimeException('wallet_ref_lock_timeout');
    }
    $st = $PDO->prepare("SELECT 1 FROM ledger WHERE ref=:r LIMIT 1");
    $st->execute([':r'=>$ref]);
    if ($st->fetchColumn()) {
      return;
    }
  }
  try {
    $PDO->beginTransaction();
    if ($ref !== '') {
      $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,:t,:a,:r,:n)")
          ->execute([':m'=>$msisdn,':t'=>$type,':a'=>$cents,':r'=>$ref,':n'=>$notes]);
    } else {
      $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,notes) VALUES(:m,:t,:a,:n)")
          ->execute([':m'=>$msisdn,':t'=>$type,':a'=>$cents,':n'=>$notes]);
    }
    $PDO->prepare("INSERT INTO accounts(msisdn,balance_cents) VALUES(:m,:a)
                   ON DUPLICATE KEY UPDATE balance_cents=balance_cents+VALUES(balance_cents)")
        ->execute([':m'=>$msisdn,':a'=>$cents]);
    $PDO->commit();
  } catch (Throwable $e) {
    if ($PDO->inTransaction()) $PDO->rollBack();
    $sqlState = ($e instanceof PDOException && isset($e->errorInfo[0])) ? (string)$e->errorInfo[0] : (string)$e->getCode();
    if ($ref !== '' && $sqlState === '23000') return;
    if ($ref !== '' && str_contains(strtolower($e->getMessage()), 'duplicate')) return;
    throw $e;
  } finally {
    if ($lockHeld && $ref !== '') wallet_ref_release_lock($PDO, $ref);
  }
}

function wallet_credit(string $msisdn, int $cents, ?string $ref=null, ?string $notes=null): void {
  wallet_credit_typed($msisdn, $cents, $ref, $notes, 'deposit');
}

function wallet_credit_promo_with_expiry(string $msisdn, int $cents, string $expiresAtUtc, string $ref, ?string $notes=null, ?int $locationId=null): void {
  if ($cents <= 0) throw new RuntimeException('promo_credit must be positive');
  if (trim($expiresAtUtc) === '') throw new RuntimeException('promo_expiry_required');
  global $PDO;
  wallet_require_tables();
  if (!wallet_promo_table_ready()) throw new RuntimeException('wallet_promo_table_missing');

  $PDO->beginTransaction();
  try {
    $dup = $PDO->prepare("SELECT 1 FROM wallet_promo_grants WHERE msisdn=:m AND ref=:r LIMIT 1");
    $dup->execute([':m'=>$msisdn, ':r'=>$ref]);
    if ($dup->fetchColumn()) {
      $PDO->commit();
      return;
    }

    $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,'promo_credit',:a,:r,:n)")
        ->execute([':m'=>$msisdn, ':a'=>$cents, ':r'=>$ref, ':n'=>$notes]);
    $PDO->prepare("INSERT INTO accounts(msisdn,balance_cents) VALUES(:m,:a)
                   ON DUPLICATE KEY UPDATE balance_cents=balance_cents+VALUES(balance_cents)")
        ->execute([':m'=>$msisdn, ':a'=>$cents]);
    $hasLocation = false;
    try { $hasLocation = location_db_column_exists($PDO, 'wallet_promo_grants', 'location_id'); } catch (Throwable $e) { $hasLocation = false; }
    if ($hasLocation) {
      $PDO->prepare("INSERT INTO wallet_promo_grants(msisdn,location_id,ref,total_cents,remaining_cents,expires_at,status,notes)
                     VALUES(:m,:l,:r,:t,:rem,:e,'active',:n)")
          ->execute([
            ':m'=>$msisdn,
            ':l'=>$locationId,
            ':r'=>$ref,
            ':t'=>$cents,
            ':rem'=>$cents,
            ':e'=>$expiresAtUtc,
            ':n'=>$notes,
          ]);
    } else {
      $PDO->prepare("INSERT INTO wallet_promo_grants(msisdn,ref,total_cents,remaining_cents,expires_at,status,notes)
                     VALUES(:m,:r,:t,:rem,:e,'active',:n)")
          ->execute([
            ':m'=>$msisdn,
            ':r'=>$ref,
            ':t'=>$cents,
            ':rem'=>$cents,
            ':e'=>$expiresAtUtc,
            ':n'=>$notes,
          ]);
    }
    $PDO->commit();
  } catch (Throwable $e) {
    $PDO->rollBack();
    throw $e;
  }
}

function wallet_try_debit_typed(string $msisdn, int $cents, string $ref, ?string $notes=null, string $type='purchase'): bool {
  if ($cents<=0) throw new RuntimeException('debit must be positive');
  $type = strtolower(trim($type));
  if (!preg_match('/^[a-z_]{2,32}$/', $type)) $type = 'purchase';
  global $PDO;
  wallet_require_tables();
  $PDO->beginTransaction();
  try {
    wallet_expire_promos_for_user_locked($msisdn);
    $st=$PDO->prepare("UPDATE accounts SET balance_cents=balance_cents-:a WHERE msisdn=:m AND balance_cents>=:a");
    $st->execute([':m'=>$msisdn,':a'=>$cents]);
    if ($st->rowCount()===0) { $PDO->rollBack(); return false; }
    wallet_consume_promos_on_debit_locked($msisdn, $cents);
    $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,:t,:neg,:r,:n)")
        ->execute([':m'=>$msisdn,':t'=>$type,':neg'=>-$cents,':r'=>$ref,':n'=>$notes]);
    $PDO->commit(); return true;
  } catch (Throwable $e) { $PDO->rollBack(); throw $e; }
}

function wallet_try_debit(string $msisdn, int $cents, string $ref, ?string $notes=null): bool {
  return wallet_try_debit_typed($msisdn, $cents, $ref, $notes, 'purchase');
}
