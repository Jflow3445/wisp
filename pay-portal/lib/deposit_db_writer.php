<?php
/**
 * nister_save_payment_pending
 * Inserts/refreshes a 'pending' payment row so Admin can approve it.
 * Uses columns Admin expects: ref, msisdn, amount (DECIMAL), method, payer_name, notes, status, created_at
 * Falls back gracefully if table/columns differ.
 */
function nister_save_payment_pending(string $msisdn, int $amount_cents, string $txref, string $payer_name, string $method, string $notes): void {
  try {
    require __DIR__ . '/../config.php'; // expects $PDO
    if (!isset($PDO) || !($PDO instanceof PDO)) return;

    // Ensure table exists
    $tbl = $PDO->query("SHOW TABLES LIKE 'payments'")->fetchColumn();
    if (!$tbl) return;

    // Discover columns
    $cols = [];
    $stc = $PDO->query("SHOW COLUMNS FROM payments");
    while ($r = $stc->fetch(PDO::FETCH_ASSOC)) $cols[strtolower($r['Field'])] = true;

    // Prepare values
    $amount = number_format($amount_cents / 100, 2, '.', '');
    $method = $method ?: 'momo';
    $payer_name = $payer_name ?: $msisdn;
    $notes = $notes ?: 'Front page top-up request';

    // Build INSERT
    $fields = ['status'];
    $vals   = [":status"];
    $bind   = [":status" => 'pending'];
    $add = function(string $c, $v) use (&$fields,&$vals,&$bind){ $fields[]="`$c`"; $vals[]=":$c"; $bind[":$c"]=$v; };

    // Map expected columns
    if (!empty($cols['ref']))        $add('ref', $txref);
    elseif (!empty($cols['txref']))  $add('txref', $txref); // fallback

    if (!empty($cols['msisdn']))     $add('msisdn', $msisdn);
    if (!empty($cols['amount']))     $add('amount', $amount);
    if (!empty($cols['method']))     $add('method', $method);
    if (!empty($cols['payer_name'])) $add('payer_name', $payer_name);
    if (!empty($cols['notes']))      $add('notes', $notes);
    if (!empty($cols['created_at'])) { $fields[]='`created_at`'; $vals[]='NOW()'; }

    if (count($fields) <= 1) return; // nothing useful to insert

    $sql = "INSERT INTO payments (".implode(',',$fields).") VALUES (".implode(',',$vals).")";
    try {
      $q=$PDO->prepare($sql);
      foreach($bind as $k=>$v) $q->bindValue($k,$v);
      $q->execute();
    } catch (PDOException $e) {
      // Likely duplicate ref; refresh the row to pending
      if ($e->getCode()==='23000' && !empty($cols['ref'])) {
        $uq = $PDO->prepare("UPDATE payments
                               SET status='pending',
                                   amount=:a,
                                   payer_name=:p,
                                   method=:m,
                                   notes=:n
                             WHERE ref=:r");
        $uq->execute([
          ':a'=>$amount, ':p'=>$payer_name, ':m'=>$method, ':n'=>$notes, ':r'=>$txref
        ]);
      }
      // Else ignore silently
    }
  } catch (Throwable $e) {
    // swallow; front-end still succeeds via file path
  }
}
