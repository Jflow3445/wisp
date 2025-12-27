<?php
declare(strict_types=1);
require_once __DIR__.'/db.php';

function wallet_balance(string $msisdn): int {
  global $PDO;
  $PDO->prepare("INSERT IGNORE INTO accounts(msisdn) VALUES(:m)")->execute([':m'=>$msisdn]);
  $st=$PDO->prepare("SELECT balance_cents FROM accounts WHERE msisdn=:m"); $st->execute([':m'=>$msisdn]);
  return (int)$st->fetchColumn();
}

function wallet_credit(string $msisdn, int $cents, ?string $ref=null, ?string $notes=null): void {
  if ($cents<=0) throw new RuntimeException('credit must be positive');
  global $PDO; $PDO->beginTransaction();
  try {
    if ($ref) {
      $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,'deposit',:a,:r,:n)")
          ->execute([':m'=>$msisdn,':a'=>$cents,':r'=>$ref,':n'=>$notes]);
    } else {
      $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,notes) VALUES(:m,'deposit',:a,:n)")
          ->execute([':m'=>$msisdn,':a'=>$cents,':n'=>$notes]);
    }
    $PDO->prepare("INSERT INTO accounts(msisdn,balance_cents) VALUES(:m,:a)
                   ON DUPLICATE KEY UPDATE balance_cents=balance_cents+VALUES(balance_cents)")
        ->execute([':m'=>$msisdn,':a'=>$cents]);
    $PDO->commit();
  } catch (Throwable $e) { $PDO->rollBack(); if (str_contains($e->getMessage(),'uniq_ref')) return; throw $e; }
}

function wallet_try_debit(string $msisdn, int $cents, string $ref, ?string $notes=null): bool {
  if ($cents<=0) throw new RuntimeException('debit must be positive');
  global $PDO; $PDO->beginTransaction();
  try {
    $st=$PDO->prepare("UPDATE accounts SET balance_cents=balance_cents-:a WHERE msisdn=:m AND balance_cents>=:a");
    $st->execute([':m'=>$msisdn,':a'=>$cents]);
    if ($st->rowCount()===0) { $PDO->rollBack(); return false; }
    $PDO->prepare("INSERT INTO ledger(msisdn,type,amount_cents,ref,notes) VALUES(:m,'purchase',:neg,:r,:n)")
        ->execute([':m'=>$msisdn,':neg'=>-$cents,':r'=>$ref,':n'=>$notes]);
    $PDO->commit(); return true;
  } catch (Throwable $e) { $PDO->rollBack(); throw $e; }
}
