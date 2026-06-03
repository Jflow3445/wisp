<?php
declare(strict_types=1);
require_once __DIR__.'/lib/common.php';
require_once __DIR__.'/lib/db.php';

$ENV = app_boot();
$legacyRaw = strtolower(trim((string)($ENV['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? getenv('ALLOW_LEGACY_ADMIN_ENDPOINTS') ?? ($_ENV['ALLOW_LEGACY_ADMIN_ENDPOINTS'] ?? ''))));
$legacyEnabled = in_array($legacyRaw, ['1','true','yes','on'], true);
if (!$legacyEnabled) {
  http_response_code(410);
  echo 'legacy_endpoint_disabled: use /admin/index.php';
  exit;
}

$PDO = db_pdo($ENV);
$SECRET = (string)($ENV['ADMIN_DEPOSIT_SECRET'] ?? '');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$tok = (string)($_SERVER['HTTP_X_ADMIN_SECRET'] ?? '');
if ($tok === '' && $method === 'POST') {
  $tok = (string)($_POST['secret'] ?? ($_POST['s'] ?? ''));
}

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
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin - Pending Top-Ups</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#f4f1ea;--surface:#172025;--ink:#1c2329;--muted:#5f6a76;--line:#e2d6c8;
    --green:#0f766e;--accent-2:#b45309;--card:#fffdfa;--shadow:0 20px 60px rgba(27,35,42,.12);
  }
  *{box-sizing:border-box}
  body{font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:linear-gradient(180deg,var(--bg) 0%,#efe8de 100%);color:var(--ink);padding:24px;letter-spacing:0}
  body::before{
    content:"";position:fixed;inset:0;z-index:-1;
    background:
      radial-gradient(900px 480px at 8% -10%,rgba(15,118,110,.18),transparent 60%),
      radial-gradient(760px 420px at 92% 0%,rgba(180,83,9,.14),transparent 60%);
  }
  h1{margin:0 0 16px;color:var(--ink);font-size:1.9rem}
  h2{margin:22px 0 10px}
  table{border-collapse:collapse;width:100%;margin:12px 0 20px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
  th,td{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left}
  th{background:var(--surface);color:#dbe7d7;text-transform:uppercase;letter-spacing:.06em;font-size:.75rem}
  tr:last-child td{border-bottom:0}
  tr:hover td{background:rgba(15,118,110,.06)}
  .ok{color:#14532d}
  .bad{color:#7f1d1d}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:12px;text-decoration:none;margin-right:6px;font-weight:700;background:#fff;color:var(--ink)}
  .btn.appr{background:#f1fbf7;border-color:rgba(15,118,110,.45);color:#0f5132}
  .btn.decl{background:#fef2f2;border-color:#fecaca;color:#7f1d1d}
  .pill{padding:3px 8px;border-radius:999px;background:rgba(15,118,110,.12);color:var(--green);font-weight:700}
  .muted{color:var(--muted)}
  h1 .muted{color:var(--muted)}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
</style>
<link rel="stylesheet" href="/assets/premium.css?v=20260603-premium5">
</head>
<body class="admin-console legacy-deposits">

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
        <form method="post" action="admin_mark_payment.php" style="display:inline">
          <input type="hidden" name="ref" value="<?= h($r['ref']) ?>">
          <input type="hidden" name="action" value="approve">
          <input type="hidden" name="s" value="<?= h($tok) ?>">
          <button class="btn appr" type="submit">Approve</button>
        </form>
        <form method="post" action="admin_mark_payment.php" style="display:inline">
          <input type="hidden" name="ref" value="<?= h($r['ref']) ?>">
          <input type="hidden" name="action" value="decline">
          <input type="hidden" name="s" value="<?= h($tok) ?>">
          <button class="btn decl" type="submit">Decline</button>
        </form>
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
        <form method="post" action="admin_update_deposit.php" style="display:inline">
          <input type="hidden" name="id" value="<?= h((string)($f['id'] ?? '')) ?>">
          <input type="hidden" name="action" value="approve">
          <input type="hidden" name="secret" value="<?= h($tok) ?>">
          <button class="btn appr" type="submit">Approve</button>
        </form>
        <form method="post" action="admin_update_deposit.php" style="display:inline">
          <input type="hidden" name="id" value="<?= h((string)($f['id'] ?? '')) ?>">
          <input type="hidden" name="action" value="decline">
          <input type="hidden" name="secret" value="<?= h($tok) ?>">
          <button class="btn decl" type="submit">Decline</button>
        </form>
      </td>
    </tr>
  <?php endforeach; ?>
</table>
<?php /* end */ ?>
</body>
</html>
