<?php
declare(strict_types=1);

require_once __DIR__.'/db.php';

function nister_payments_table_exists(): bool {
  global $PDO;
  $st = $PDO->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'payments' LIMIT 1"
  );
  $st->execute();
  return (bool)$st->fetchColumn();
}

function nister_payment_columns(): array {
  static $cols = null;
  if (is_array($cols)) return $cols;
  global $PDO;
  $cols = [];
  $st = $PDO->query(
    "SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'payments'"
  );
  foreach ($st->fetchAll(PDO::FETCH_COLUMN, 0) ?: [] as $name) {
    $cols[(string)$name] = true;
  }
  return $cols;
}

function nister_payment_amount_cents(array $row): int {
  if (isset($row['amount_cents']) && is_numeric($row['amount_cents'])) {
    $cents = (int)$row['amount_cents'];
    if ($cents > 0) return $cents;
  }
  if (isset($row['amount']) && is_numeric($row['amount'])) {
    return (int)round(((float)$row['amount']) * 100);
  }
  return 0;
}

function nister_payment_find(string $ref): ?array {
  $ref = trim($ref);
  if ($ref === '' || !nister_payments_table_exists()) return null;
  global $PDO;
  $st = $PDO->prepare("SELECT * FROM payments WHERE ref=:r LIMIT 1");
  $st->execute([':r'=>$ref]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function nister_payment_insert_record(
  string $ref,
  string $msisdn,
  int $amountCents,
  string $method,
  string $payerName,
  string $notes,
  string $status = 'pending',
  ?string $approvedBy = null
): void {
  if ($ref === '' || $amountCents <= 0) throw new RuntimeException('invalid_payment_record');
  if (!nister_payments_table_exists()) throw new RuntimeException('payments table missing');

  global $PDO;
  $cols = nister_payment_columns();
  $amount = number_format($amountCents / 100, 2, '.', '');
  $fields = [];
  $values = [];
  $bind = [];
  $add = static function(string $col, string $expr, $value = null) use (&$fields, &$values, &$bind): void {
    $fields[] = "`{$col}`";
    $values[] = $expr;
    if ($value !== null) $bind[$expr] = $value;
  };

  if (!empty($cols['ref'])) $add('ref', ':ref', $ref);
  if (!empty($cols['msisdn'])) $add('msisdn', ':msisdn', $msisdn);
  if (!empty($cols['amount'])) $add('amount', ':amount', $amount);
  if (!empty($cols['amount_cents'])) $add('amount_cents', ':amount_cents', $amountCents);
  if (!empty($cols['method'])) $add('method', ':method', $method !== '' ? $method : 'momo');
  if (!empty($cols['payer_name'])) $add('payer_name', ':payer_name', $payerName !== '' ? $payerName : $msisdn);
  if (!empty($cols['notes'])) $add('notes', ':notes', $notes);
  if (!empty($cols['status'])) $add('status', ':status', $status !== '' ? $status : 'pending');
  if (!empty($cols['created_at'])) {
    $fields[] = '`created_at`';
    $values[] = 'NOW()';
  }
  if (!empty($cols['approved_at']) && in_array($status, ['approved','declined'], true)) {
    $fields[] = '`approved_at`';
    $values[] = 'NOW()';
  }
  if (!empty($cols['approved_by']) && $approvedBy !== null && $approvedBy !== '') {
    $add('approved_by', ':approved_by', $approvedBy);
  }
  if (!empty($cols['ip'])) $add('ip', ':ip', (string)($_SERVER['REMOTE_ADDR'] ?? ''));
  if (!empty($cols['ua'])) $add('ua', ':ua', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));

  if (!$fields) throw new RuntimeException('payments table has no supported columns');

  $sql = "INSERT INTO payments (".implode(',', $fields).") VALUES (".implode(',', $values).")";
  $st = $PDO->prepare($sql);
  $st->execute($bind);
}

function nister_payment_update_status(
  string $ref,
  string $status,
  ?string $notes = null,
  ?string $approvedBy = null,
  ?int $amountCents = null,
  ?string $msisdn = null,
  ?string $method = null,
  ?string $payerName = null,
  bool $onlyIfNotStatus = false
): int {
  $ref = trim($ref);
  if ($ref === '' || !nister_payments_table_exists()) return 0;
  global $PDO;
  $cols = nister_payment_columns();
  $set = [];
  $bind = [':ref'=>$ref];

  if (!empty($cols['status'])) {
    $set[] = '`status`=:status';
    $bind[':status'] = $status;
  }
  if ($amountCents !== null && $amountCents > 0) {
    if (!empty($cols['amount'])) {
      $set[] = '`amount`=:amount';
      $bind[':amount'] = number_format($amountCents / 100, 2, '.', '');
    }
    if (!empty($cols['amount_cents'])) {
      $set[] = '`amount_cents`=:amount_cents';
      $bind[':amount_cents'] = $amountCents;
    }
  }
  if ($msisdn !== null && $msisdn !== '' && !empty($cols['msisdn'])) {
    $set[] = '`msisdn`=:msisdn';
    $bind[':msisdn'] = $msisdn;
  }
  if ($method !== null && $method !== '' && !empty($cols['method'])) {
    $set[] = '`method`=:method';
    $bind[':method'] = $method;
  }
  if ($payerName !== null && $payerName !== '' && !empty($cols['payer_name'])) {
    $set[] = '`payer_name`=:payer_name';
    $bind[':payer_name'] = $payerName;
  }
  if ($notes !== null && $notes !== '' && !empty($cols['notes'])) {
    $set[] = "`notes`=CONCAT(COALESCE(`notes`,''), CASE WHEN COALESCE(`notes`,'')<>'' THEN ' | ' ELSE '' END, :notes)";
    $bind[':notes'] = $notes;
  }
  if (!empty($cols['approved_at']) && in_array($status, ['approved','declined'], true)) {
    $set[] = '`approved_at`=NOW()';
  }
  if (!empty($cols['approved_by']) && $approvedBy !== null && $approvedBy !== '') {
    $set[] = '`approved_by`=:approved_by';
    $bind[':approved_by'] = $approvedBy;
  }
  if (!$set) return 0;

  $where = '`ref`=:ref';
  if ($onlyIfNotStatus && !empty($cols['status'])) {
    $where .= ' AND (`status` IS NULL OR `status`<>:where_status)';
    $bind[':where_status'] = $status;
  }
  $st = $PDO->prepare("UPDATE payments SET ".implode(',', $set)." WHERE {$where}");
  $st->execute($bind);
  return $st->rowCount();
}

function nister_payment_save_pending(
  string $ref,
  string $msisdn,
  int $amountCents,
  string $method,
  string $payerName,
  string $notes
): void {
  try {
    nister_payment_insert_record($ref, $msisdn, $amountCents, $method, $payerName, $notes, 'pending');
  } catch (PDOException $e) {
    $state = (string)($e->errorInfo[0] ?? $e->getCode());
    if ($state !== '23000') throw $e;
    nister_payment_update_status($ref, 'pending', $notes, null, $amountCents, $msisdn, $method, $payerName);
  }
}

function nister_payment_mark_approved(
  string $ref,
  string $msisdn,
  int $amountCents,
  string $method,
  string $payerName,
  string $notes,
  string $approvedBy
): bool {
  $row = nister_payment_find($ref);
  if (!$row) {
    try {
      nister_payment_insert_record($ref, $msisdn, $amountCents, $method, $payerName, $notes, 'approved', $approvedBy);
      return true;
    } catch (PDOException $e) {
      $state = (string)($e->errorInfo[0] ?? $e->getCode());
      if ($state !== '23000') throw $e;
    }
  }

  $changed = nister_payment_update_status(
    $ref,
    'approved',
    $notes,
    $approvedBy,
    $amountCents,
    $msisdn,
    $method,
    $payerName,
    true
  );
  return $changed > 0;
}

function nister_payment_mark_declined(string $ref, string $notes, string $approvedBy = 'paystack'): void {
  $row = nister_payment_find($ref);
  if (is_array($row) && (string)($row['status'] ?? '') === 'approved') return;
  nister_payment_update_status($ref, 'declined', $notes, $approvedBy, null, null, null, null, false);
}
