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

function owner_revenue_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_revenue_money(int $cents, string $currency = 'GHS'): string {
  return strtoupper($currency) . ' ' . number_format($cents / 100, 2);
}

function owner_revenue_period(?string $start, ?string $end): string {
  if (trim((string)$start) === '' || trim((string)$end) === '') {
    return 'Current month';
  }
  try {
    $s = new DateTimeImmutable((string)$start, new DateTimeZone('UTC'));
    $e = new DateTimeImmutable((string)$end, new DateTimeZone('UTC'));
    return $s->format('M j, Y') . ' - ' . $e->modify('-1 second')->format('M j, Y');
  } catch (Throwable $e) {
    return 'Current month';
  }
}

$owner = owner_current();
if (!is_array($owner)) {
  header('Location: /owner/login.php');
  exit;
}
$ownerId = (int)($owner['id'] ?? 0);
$summary = [
  'currency' => 'GHS',
  'period_start' => '',
  'period_end' => '',
  'property_count' => 0,
  'transaction_count' => 0,
  'gross_cents' => 0,
  'owner_amount_cents' => 0,
  'nister_amount_cents' => 0,
  'properties' => [],
];
$error = '';
try {
  $summary = property_revenue_summary_for_owner($PDO, $ownerId);
} catch (Throwable $e) {
  $error = 'Revenue reporting could not be loaded right now.';
}
$currency = (string)($summary['currency'] ?? 'GHS');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Revenue</title>
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
        <a href="/owner/revenue.php" aria-current="page">Revenue</a>
        <a href="/owner/transactions.php">Transactions</a>
        <a href="/owner/logout.php">Logout</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Approved owner reporting</span>
        <h1>Revenue report</h1>
        <p>Read-only reporting from confirmed resident purchases attributed to your linked property.</p>
        <div class="owner-status-list" aria-label="Reporting controls">
          <span>Reporting Period: <?=owner_revenue_e(owner_revenue_period($summary['period_start'] ?? '', $summary['period_end'] ?? ''))?></span>
          <span>No owner-triggered payouts in this release</span>
        </div>
      </div>

      <section class="owner-card owner-report">
        <h1>Revenue This Month</h1>
        <p class="owner-muted">These numbers are calculated from allocation rows after Nister confirms resident access purchases and applies admin-controlled financial terms.</p>
        <?php if ($error !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_revenue_e($error)?></div>
        <?php endif; ?>

        <div class="owner-metric-grid owner-report-grid">
          <article class="owner-metric">
            <span>Gross Resident Purchases</span>
            <strong><?=owner_revenue_e(owner_revenue_money((int)($summary['gross_cents'] ?? 0), $currency))?></strong>
            <small>Total eligible purchases this period</small>
          </article>
          <article class="owner-metric">
            <span>Your Share</span>
            <strong><?=owner_revenue_e(owner_revenue_money((int)($summary['owner_amount_cents'] ?? 0), $currency))?></strong>
            <small>Calculated from agreed terms</small>
          </article>
          <article class="owner-metric">
            <span>Nister Share</span>
            <strong><?=owner_revenue_e(owner_revenue_money((int)($summary['nister_amount_cents'] ?? 0), $currency))?></strong>
            <small>Gross minus owner share</small>
          </article>
          <article class="owner-metric">
            <span>Transactions</span>
            <strong><?=owner_revenue_e((string)(int)($summary['transaction_count'] ?? 0))?></strong>
            <small>Allocated resident purchases</small>
          </article>
          <article class="owner-metric">
            <span>Reporting Period</span>
            <strong><?=owner_revenue_e(owner_revenue_period($summary['period_start'] ?? '', $summary['period_end'] ?? ''))?></strong>
            <small>UTC month window</small>
          </article>
        </div>

        <h2>Property Breakdown</h2>
        <?php $properties = is_array($summary['properties'] ?? null) ? $summary['properties'] : []; ?>
        <?php if ($properties === []): ?>
          <p class="owner-empty">No linked property revenue has been allocated for this reporting period.</p>
        <?php else: ?>
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Gross Resident Purchases</th>
                  <th>Your Share</th>
                  <th>Nister Share</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($properties as $property): ?>
                  <tr>
                    <td><?=owner_revenue_e((string)($property['name'] ?? 'Property'))?></td>
                    <td><?=owner_revenue_e(owner_revenue_money((int)($property['gross_cents'] ?? 0), $currency))?></td>
                    <td><?=owner_revenue_e(owner_revenue_money((int)($property['owner_amount_cents'] ?? 0), $currency))?></td>
                    <td><?=owner_revenue_e(owner_revenue_money((int)($property['nister_amount_cents'] ?? 0), $currency))?></td>
                    <td><?=owner_revenue_e((string)(int)($property['transaction_count'] ?? 0))?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php endif; ?>

        <div class="owner-button-row">
          <a class="owner-button" href="/owner/transactions.php">View Transactions</a>
          <a class="owner-link-button" href="/owner/dashboard.php">Back to Dashboard</a>
        </div>
      </section>
    </section>
  </main>
</body>
</html>
