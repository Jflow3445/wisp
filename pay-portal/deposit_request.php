<?php declare(strict_types=1);
/**
 * deposit_request.php
 * Inserts a PENDING manual top-up into `payments` exactly as Admin expects,
 * and also fills `amount_cents` when the column exists (NOT NULL schemas).
 */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

require __DIR__ . '/config.php'; // must define $PDO

// ---- helpers ----
$normalize_msisdn = static function(?string $s): string {
  $s = preg_replace('/\D+/', '', (string)$s);
  if ($s === null) return '';
  // allow lib/common.php override if present
  $common = __DIR__ . '/lib/common.php';
  if (is_file($common)) {
    require_once $common;
    if (function_exists('normalize_msisdn')) {
      return normalize_msisdn($s);
    }
  }
  return $s;
};

// Merge JSON into $_POST for convenience
try {
  $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    if ($raw) {
      $j = json_decode($raw, true);
      if (is_array($j)) {
        foreach ($j as $k=>$v) {
          if (!array_key_exists($k, $_POST)) $_POST[$k] = $v;
        }
      }
    }
  }
} catch (Throwable $e) { /* ignore */ }

$in = $_POST + $_GET;

// Canonical fields Admin uses
$ref = trim((string)($in['ref'] ?? $in['txref'] ?? $in['txid'] ?? $in['reference'] ?? ''));
$msisdn = $normalize_msisdn($in['msisdn'] ?? $in['phone'] ?? $in['number'] ?? '');
$payer_name = trim((string)($in['payer_name'] ?? $msisdn));
$method = trim((string)($in['method'] ?? 'momo'));
$notes  = trim((string)($in['notes']  ?? 'Front page top-up request'));

// Amount: accept amount (decimal) OR amount_cents (int). Admin reads DECIMAL `amount`,
// but schema may require `amount_cents` (NOT NULL). We'll compute both.
$amount = null;
if (isset($in['amount']) && $in['amount'] !== '') {
  $a = (float)preg_replace('/[^\d.]/','',(string)$in['amount']);
  if ($a > 0) $amount = number_format($a, 2, '.', '');
} elseif (isset($in['amount_cents']) && is_numeric($in['amount_cents'])) {
  $c = (int)$in['amount_cents'];
  if ($c > 0) $amount = number_format($c/100, 2, '.', '');
}
$amount_cents = ($amount !== null) ? (int)round((float)$amount * 100) : 0;

// Basic validation
$errors = [];
if ($ref === '')        $errors['ref'] = true;
if ($msisdn === '')     $errors['msisdn'] = true;
if ($amount === null)   $errors['amount'] = true;
if ($amount !== null && !preg_match('/^\d+(\.\d{1,2})?$/', (string)$amount)) $errors['amount_format'] = true;
if ($errors) {
  http_response_code(422);
  echo json_encode(['ok'=>false,'error'=>'missing_or_invalid','fields'=>$errors], JSON_UNESCAPED_SLASHES);
  exit;
}

try {
  if (!isset($PDO) || !($PDO instanceof PDO)) {
    throw new RuntimeException('DB not available');
  }

  // Ensure `payments` table exists
  $exists = (bool)$PDO->query("SHOW TABLES LIKE 'payments'")->fetchColumn();
  if (!$exists) throw new RuntimeException('payments table missing');

  // Discover available columns to align with schema (handles NOT NULL amount_cents, ip, ua, etc.)
  $colsStmt = $PDO->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'");
  $colNames = $colsStmt ? $colsStmt->fetchAll(PDO::FETCH_COLUMN, 0) : [];
  $has = array_fill_keys($colNames, true);

  // Build insert columns dynamically
  $fields = [
    'ref'        => ':ref',
    'msisdn'     => ':msisdn',
    'amount'     => ':amount',        // Admin uses DECIMAL amount
    'method'     => ':method',
    'payer_name' => ':payer_name',
    'notes'      => ':notes',
    'status'     => "'pending'",
    'created_at' => "NOW()",
  ];

  // Optional columns commonly present
  if (isset($has['amount_cents'])) $fields['amount_cents'] = ':amount_cents';
  if (isset($has['network']) && isset($in['network'])) $fields['network'] = ':network';
  if (isset($has['ip'])) $fields['ip'] = ':ip';
  if (isset($has['ua'])) $fields['ua'] = ':ua';

  $sql = "INSERT INTO payments (" . implode(',', array_keys($fields)) . ")
          VALUES (" . implode(',', array_values($fields)) . ")";
  $st = $PDO->prepare($sql);

  $bind = [
    ':ref'        => $ref,
    ':msisdn'     => $msisdn,
    ':amount'     => $amount,
    ':method'     => ($method !== '' ? $method : 'momo'),
    ':payer_name' => ($payer_name !== '' ? $payer_name : $msisdn),
    ':notes'      => ($notes !== '' ? $notes : 'Front page top-up request'),
  ];
  if (isset($has['amount_cents'])) $bind[':amount_cents'] = $amount_cents;
  if (isset($has['network']) && isset($in['network'])) $bind[':network'] = (string)$in['network'];
  if (isset($has['ip'])) $bind[':ip'] = $_SERVER['REMOTE_ADDR']      ?? '';
  if (isset($has['ua'])) $bind[':ua'] = $_SERVER['HTTP_USER_AGENT']  ?? '';

  $st->execute($bind);

  echo json_encode(['ok'=>true,'ref'=>$ref], JSON_UNESCAPED_SLASHES);
} catch (PDOException $e) {
  // Duplicate ref or other DB issue
  if ($e->getCode()==='23000') {
    http_response_code(409);
    echo json_encode(['ok'=>false,'error'=>'duplicate_ref','ref'=>$ref], JSON_UNESCAPED_SLASHES);
  } else {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>'db_error:'.$e->getMessage()], JSON_UNESCAPED_SLASHES);
  }
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'server_error:'.$e->getMessage()], JSON_UNESCAPED_SLASHES);
}
