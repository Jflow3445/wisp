<?php
declare(strict_types=1);
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/db.php';

$ENV = app_boot();
$PDO = db_pdo($ENV);
$SECRET = (string)($ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
$tok = (string)($_GET['s'] ?? '');

if ($SECRET === '' || !hash_equals($SECRET, $tok)) {
  http_response_code(403);
  echo 'forbidden'; exit;
}

function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$rows = $PDO->query("SELECT id, ref, msisdn, typed_msisdn, payer_name, amount, amount_cents, status, created_at
                     FROM payments WHERE status='pending' ORDER BY id DESC LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);

$dir = __DIR__.'/data/manual_deposits/pending';
$files = [];
if (is_dir($dir)) {
  foreach (glob($dir.'/*.json') as $f) {
    $j = json_decode(@file_get_contents($f), true);
    if (is_array($j)) $files[] = $j;
  }
}
?>
<!doctype html><meta charset="utf-8">
<title>Admin — Pending Top-Ups</title>
<style>
  body{font:14px/1.4 system-ui,Arial;margin:20px}
  h1{margin:0 0 10px}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th,td{border:1px solid #ddd;padding:8px}
  th{background:#f5f5f5;text-align:left}
  .ok{color:#0a0}
  .bad{color:#b00}
  .btn{display:inline-block;padding:6px 10px;border:1px solid #999;border-radius:6px;text-decoration:none;margin-right:6px}
  .btn.appr{background:#e6ffed;border-color:#8fd19e}
  .btn.decl{background:#ffecec;border-color:#f5a3a3}
  .pill{padding:2px 8px;border-radius:999px;background:#eee}
  .muted{color:#666}
</style>

<h1>Pending Top-Ups <span class="muted">(DB + File queue)</span></h1>

<h2>DB: payments (status=pending)</h2>
<table>
  <tr>
    <th>#</th><th>Ref</th><th>MSISDN (normalized)</th><th>Typed</th><th>Payer</th><th>Amount</th><th>Created</th><th>Actions</th>
  </tr>
  <?php foreach($rows as $r): ?>
    <tr>
      <td><?= (int)$r['id'] ?></td>
      <td><code><?= h($r['ref']) ?></code></td>
      <td><?= h($r['msisdn']) ?></td>
      <td><?= h($r['typed_msisdn']) ?></td>
      <td><?= h($r['payer_name']) ?></td>
      <td><b>GHS <?= number_format((float)$r['amount'],2) ?></b> <span class="pill"><?= (int)$r['amount_cents'] ?>c</span></td>
      <td class="muted"><?= h($r['created_at']) ?></td>
      <td>
        <a class="btn appr" href="admin_mark_payment.php?ref=<?= urlencode($r['ref']) ?>&action=approve&s=<?= urlencode($tok) ?>">Approve</a>
        <a class="btn decl" href="admin_mark_payment.php?ref=<?= urlencode($r['ref']) ?>&action=decline&s=<?= urlencode($tok) ?>">Decline</a>
      </td>
    </tr>
  <?php endforeach; ?>
</table>

<h2>File queue: data/manual_deposits/pending</h2>
<table>
  <tr>
    <th>File ID</th><th>MSISDN</th><th>Payer</th><th>Amount (cents)</th><th>TxRef</th><th>Created</th><th>Actions</th>
  </tr>
  <?php foreach($files as $f): ?>
    <tr>
      <td><code><?= h($f['id'] ?? '') ?></code></td>
      <td><?= h($f['msisdn'] ?? '') ?></td>
      <td><?= h($f['payer_name'] ?? '') ?></td>
      <td><?= (int)($f['amount_cents'] ?? 0) ?></td>
      <td><?= h($f['txref'] ?? '') ?></td>
      <td class="muted"><?= h($f['created_at'] ?? '') ?></td>
      <td>
        <a class="btn appr" href="admin_update_deposit.php?id=<?= urlencode($f['id'] ?? '') ?>&action=approve&secret=<?= urlencode($tok) ?>">Approve</a>
        <a class="btn decl" href="admin_update_deposit.php?id=<?= urlencode($f['id'] ?? '') ?>&action=decline&secret=<?= urlencode($tok) ?>">Decline</a>
      </td>
    </tr>
  <?php endforeach; ?>
</table>
<?php /* end */ ?>
