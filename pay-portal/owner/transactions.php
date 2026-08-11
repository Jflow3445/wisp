<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_revenue.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();
owner_require_login();
owner_require_approved();

function owner_transactions_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_transactions_money(int $cents, string $currency = 'GHS'): string {
  return strtoupper($currency) . ' ' . number_format($cents / 100, 2);
}

function owner_transactions_date($value): string {
  $raw = trim((string)$value);
  if ($raw === '') return 'Not recorded';
  try {
    return (new DateTimeImmutable($raw, new DateTimeZone('UTC')))->format('Y-m-d H:i');
  } catch (Throwable $e) {
    return $raw;
  }
}

$owner = owner_current();
if (!is_array($owner)) {
  header('Location: /owner/login.php');
  exit;
}
$ownerId = (int)($owner['id'] ?? 0);
$limit = isset($_GET['limit']) && ctype_digit((string)$_GET['limit']) ? (int)$_GET['limit'] : 100;
$limit = max(1, min(250, $limit));
$transactions = [];
$error = '';
try {
  $transactions = property_transactions_for_owner($PDO, $ownerId, ['limit' => $limit]);
} catch (Throwable $e) {
  $error = 'Transactions could not be loaded right now.';
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Transactions</title>
  <link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/owner.css?v=20260811-owner3">
</head>
<body class="owner-page">
  <main class="owner-shell">
    <header class="owner-topbar">
      <a class="owner-brand" href="https://nister.org/" aria-label="Nister Wi-Fi home">
        <span class="owner-mark"><span></span></span>
        <span><strong>Nister Wi-Fi</strong><small>Owner portal</small></span>
      </a>
      <nav class="owner-nav" aria-label="Owner navigation">
        <a href="/owner/dashboard.php">Dashboard</a>
        <a href="/owner/requests.php">Requests</a>
        <a href="/owner/revenue.php">Revenue</a>
        <a href="/owner/transactions.php" aria-current="page">Transactions</a>
        <a href="/owner/logout.php">Logout</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Read-only reporting</span>
        <h1>Transactions</h1>
        <p>Resident purchase records attributed to your linked property under Nister's admin-controlled financial terms.</p>
        <div class="owner-status-list" aria-label="Transaction privacy">
          <span>Resident identifiers are masked</span>
          <span>No payout action is available here</span>
        </div>
      </div>

      <section class="owner-card owner-report">
        <h1>Transactions</h1>
        <p class="owner-muted">This list shows allocated resident purchases. It does not expose raw resident phone numbers.</p>
        <?php if ($error !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_transactions_e($error)?></div>
        <?php endif; ?>

        <?php if ($transactions === []): ?>
          <p class="owner-empty">No allocated transactions are visible for this owner account yet.</p>
        <?php else: ?>
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Property</th>
                  <th>Resident</th>
                  <th>Plan</th>
                  <th>Gross Resident Purchases</th>
                  <th>Your Share</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($transactions as $tx): ?>
                  <?php $currency = (string)($tx['currency'] ?? 'GHS'); ?>
                  <tr>
                    <td><?=owner_transactions_e(owner_transactions_date($tx['purchased_at'] ?? ''))?></td>
                    <td><?=owner_transactions_e((string)($tx['property_name'] ?? 'Property'))?></td>
                    <td><?=owner_transactions_e((string)($tx['msisdn_masked'] ?? 'Masked resident'))?></td>
                    <td><?=owner_transactions_e((string)($tx['plan_code'] ?? 'Plan'))?></td>
                    <td><?=owner_transactions_e(owner_transactions_money((int)($tx['gross_cents'] ?? 0), $currency))?></td>
                    <td><?=owner_transactions_e(owner_transactions_money((int)($tx['owner_amount_cents'] ?? 0), $currency))?></td>
                    <td><span class="owner-pill"><?=owner_transactions_e((string)($tx['status'] ?? 'allocated'))?></span></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php endif; ?>

        <div class="owner-button-row">
          <a class="owner-button" href="/owner/revenue.php">Revenue Report</a>
          <a class="owner-link-button" href="/owner/dashboard.php">Back to Dashboard</a>
        </div>
      </section>
    </section>
  </main>
</body>
</html>
