<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_requests.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();
owner_require_login();

function owner_dashboard_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_dashboard_status_label(string $status): string {
  $labels = [
    'pending' => 'Pending review',
    'approved' => 'Approved',
    'suspended' => 'Suspended',
  ];
  return $labels[$status] ?? 'Pending review';
}

function owner_dashboard_request_status_label(string $status): string {
  $labels = [
    'submitted' => 'Request received',
    'contacted' => "We're in touch",
    'qualified' => 'Property assessment',
    'site_survey_required' => 'Site visit needed',
    'site_survey_scheduled' => 'Site visit scheduled',
    'site_survey_completed' => 'Assessment complete',
    'quote_prepared' => 'Preparing your proposal',
    'quote_sent' => 'Proposal sent',
    'negotiating' => 'Finalising the arrangement',
    'approved' => 'Approved',
    'agreement_signed' => 'Agreement complete',
    'equipment_pending' => 'Preparing equipment',
    'installation_scheduled' => 'Installation scheduled',
    'installing' => 'Installation underway',
    'testing' => 'Final testing',
    'active' => 'Nister is active',
    'rejected' => 'Not a fit right now',
    'lost' => 'Request closed',
  ];
  return $labels[$status] ?? ucwords(str_replace('_', ' ', $status));
}

function owner_dashboard_date($value): string {
  $raw = trim((string)$value);
  if ($raw === '') return 'Not recorded';
  try {
    $dt = new DateTimeImmutable($raw, new DateTimeZone('UTC'));
    return $dt->format('Y-m-d H:i');
  } catch (Throwable $e) {
    return $raw;
  }
}

function owner_dashboard_money(int $cents, string $currency = 'GHS'): string {
  return strtoupper($currency) . ' ' . number_format($cents / 100, 2);
}

function owner_dashboard_count_linked_properties(PDO $pdo, int $ownerId): int {
  $st = $pdo->prepare(
    "SELECT COUNT(DISTINCT p.id)
     FROM property_memberships pm
     JOIN properties p ON p.id = pm.property_id
     WHERE pm.owner_id = :owner_id
       AND pm.status = 'active'
       AND p.status <> 'closed'"
  );
  $st->execute([':owner_id' => $ownerId]);
  return (int)$st->fetchColumn();
}

function owner_dashboard_count_location_links(PDO $pdo, int $ownerId): int {
  $st = $pdo->prepare(
    "SELECT COUNT(DISTINCT pll.location_id)
     FROM property_memberships pm
     JOIN property_location_links pll ON pll.property_id = pm.property_id
     WHERE pm.owner_id = :owner_id
       AND pm.status = 'active'
       AND pll.status = 'active'
       AND pll.effective_to IS NULL"
  );
  $st->execute([':owner_id' => $ownerId]);
  return (int)$st->fetchColumn();
}

function owner_dashboard_month_allocation(PDO $pdo, int $ownerId): array {
  $start = (new DateTimeImmutable('first day of this month 00:00:00', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
  $st = $pdo->prepare(
    "SELECT
       COALESCE(SUM(a.gross_cents), 0) AS gross_cents,
       COALESCE(SUM(a.owner_amount_cents), 0) AS owner_cents,
       COALESCE(SUM(a.nister_amount_cents), 0) AS nister_cents,
       COUNT(*) AS transaction_count,
       COALESCE(MAX(a.currency), 'GHS') AS currency
     FROM property_transaction_allocations a
     JOIN property_memberships pm ON pm.property_id = a.property_id
     WHERE pm.owner_id = :owner_id
       AND pm.status = 'active'
       AND a.status = 'allocated'
       AND a.purchased_at >= :start"
  );
  $st->execute([':owner_id' => $ownerId, ':start' => $start]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  return [
    'gross_cents' => (int)($row['gross_cents'] ?? 0),
    'owner_cents' => (int)($row['owner_cents'] ?? 0),
    'nister_cents' => (int)($row['nister_cents'] ?? 0),
    'transaction_count' => (int)($row['transaction_count'] ?? 0),
    'currency' => (string)($row['currency'] ?? 'GHS'),
  ];
}

function owner_dashboard_summary(PDO $pdo, int $ownerId): array {
  try {
    owner_schema_bootstrap($pdo);
    $properties = owner_dashboard_count_linked_properties($pdo, $ownerId);
    $locations = owner_dashboard_count_location_links($pdo, $ownerId);
    $allocation = owner_dashboard_month_allocation($pdo, $ownerId);
    return [
      'property_count' => $properties,
      'location_count' => $locations,
      'network_state' => $locations > 0 ? 'Linked' : 'No linked location',
      'connected_users' => $locations > 0 ? 'Available after network telemetry is linked' : 'Requires linked location',
      'allocation' => $allocation,
      'error' => '',
    ];
  } catch (Throwable $e) {
    return [
      'property_count' => 0,
      'location_count' => 0,
      'network_state' => 'Unavailable',
      'connected_users' => 'Unavailable',
      'allocation' => [
        'gross_cents' => 0,
        'owner_cents' => 0,
        'nister_cents' => 0,
        'transaction_count' => 0,
        'currency' => 'GHS',
      ],
      'error' => 'Approved owner summary could not be loaded right now.',
    ];
  }
}

$owner = owner_current();
if (!is_array($owner)) {
  owner_logout();
  header('Location: /owner/login.php');
  exit;
}

$ownerId = (int)($owner['id'] ?? 0);
$ownerStatus = (string)($owner['status'] ?? 'pending');
if (!in_array($ownerStatus, property_request_statuses(), true)) {
  $ownerStatus = 'pending';
}

$flash = '';
$err = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  owner_require_same_origin_post();
  owner_require_csrf_post();
  try {
    $action = (string)($_POST['action'] ?? '');
    if ($action !== 'profile_update') {
      throw new InvalidArgumentException('unsupported_action');
    }
    $owner = property_owner_update_profile($PDO, $ownerId, $_POST);
    $ownerStatus = (string)($owner['status'] ?? $ownerStatus);
    $flash = 'Profile updated.';
  } catch (Throwable $e) {
    $err = 'We could not update the profile. Check the name and try again.';
  }
}

$requests = [];
$requestError = '';
try {
  $requests = property_request_list_for_owner($PDO, $ownerId);
} catch (Throwable $e) {
  $requestError = 'Service requests could not be loaded right now.';
}
$recentRequests = array_slice($requests, 0, 5);
$csrf = owner_csrf_token();
$summary = $ownerStatus === 'approved' ? owner_dashboard_summary($PDO, $ownerId) : null;
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Dashboard</title>
  <link rel="icon" href="/assets/nister-browser-icon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/owner.css?v=20260811-owner2">
</head>
<body class="owner-page">
  <main class="owner-shell">
    <header class="owner-topbar">
      <a class="owner-brand" href="https://nister.org/" aria-label="Nister Wi-Fi home">
        <span class="owner-mark"><span></span></span>
        <span><strong>Nister Wi-Fi</strong><small>Owner portal</small></span>
      </a>
      <nav class="owner-nav" aria-label="Owner navigation">
        <a href="/owner/dashboard.php" aria-current="page">Dashboard</a>
        <?php if ($ownerStatus !== 'suspended'): ?>
          <a href="/owner/requests.php">Requests</a>
        <?php endif; ?>
        <?php if ($ownerStatus === 'approved'): ?>
          <a href="/owner/revenue.php">Revenue</a>
          <a href="/owner/transactions.php">Transactions</a>
        <?php endif; ?>
        <a href="/owner/logout.php">Logout</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow"><?=owner_dashboard_e(owner_dashboard_status_label($ownerStatus))?></span>
        <h1><?=owner_dashboard_e((string)($owner['display_name'] ?? 'Owner'))?></h1>
        <p><?=owner_dashboard_e(msisdn_display((string)($owner['msisdn'] ?? '')))?></p>
        <div class="owner-status-list" aria-label="Owner identity">
          <span>Account status: <?=owner_dashboard_e(owner_dashboard_status_label($ownerStatus))?></span>
          <span>Submitted requests: <?=owner_dashboard_e((string)count($requests))?></span>
          <span>Session: owner-only login</span>
        </div>
      </div>

      <?php if ($ownerStatus === 'pending'): ?>
        <section class="owner-card owner-pending-dashboard">
          <h1>Your request is with Nister.</h1>
          <p class="owner-muted">We'll review the property details and contact you if we need anything else. You can follow the progress here.</p>
          <?php if ($err !== ''): ?>
            <div class="owner-message owner-message-error"><?=owner_dashboard_e($err)?></div>
          <?php endif; ?>
          <?php if ($flash !== ''): ?>
            <div class="owner-message owner-message-ok"><?=owner_dashboard_e($flash)?></div>
          <?php endif; ?>
          <ol class="owner-progress" aria-label="Request progress">
            <li class="is-complete">Property submitted</li>
            <li class="is-current">Nister review</li>
            <li>Property assessment</li>
            <li>Proposal</li>
            <li>Deployment</li>
          </ol>
          <form class="owner-form owner-compact-form" method="post" action="/owner/dashboard.php">
            <input type="hidden" name="csrf" value="<?=owner_dashboard_e($csrf)?>">
            <input type="hidden" name="action" value="profile_update">
            <div class="owner-field">
              <label for="display_name">Display name</label>
              <input id="display_name" name="display_name" type="text" maxlength="120" required value="<?=owner_dashboard_e((string)($owner['display_name'] ?? ''))?>">
            </div>
            <div class="owner-button-row">
              <button class="owner-button" type="submit">Update profile</button>
              <a class="owner-link-button" href="/owner/requests.php#new-request">Submit a service request</a>
            </div>
          </form>

          <h2>Request list</h2>
          <?php if ($requestError !== ''): ?>
            <div class="owner-message owner-message-error"><?=owner_dashboard_e($requestError)?></div>
          <?php elseif ($recentRequests === []): ?>
            <p class="owner-muted">No service requests have been submitted from this owner account yet.</p>
          <?php else: ?>
            <div class="owner-request-list">
              <?php foreach ($recentRequests as $request): ?>
                <article class="owner-request-card">
                  <div>
                    <strong><?=owner_dashboard_e((string)($request['property_name'] ?? 'Property request'))?></strong>
                    <span><?=owner_dashboard_e((string)($request['town'] ?? ''))?><?=trim((string)($request['region'] ?? '')) !== '' ? ', ' . owner_dashboard_e((string)$request['region']) : ''?></span>
                  </div>
                  <div>
                    <span class="owner-pill"><?=owner_dashboard_e(owner_dashboard_request_status_label((string)($request['status'] ?? 'submitted')))?></span>
                    <small>Submitted <?=owner_dashboard_e(owner_dashboard_date($request['created_at'] ?? ''))?></small>
                  </div>
                </article>
              <?php endforeach; ?>
            </div>
          <?php endif; ?>
        </section>
      <?php elseif ($ownerStatus === 'approved'): ?>
        <section class="owner-card owner-approved-dashboard">
          <h1>Your property at a glance.</h1>
          <p class="owner-muted">See the information that matters without having to manage the technical systems underneath it.</p>
          <?php if (is_array($summary) && (string)$summary['error'] !== ''): ?>
            <div class="owner-message owner-message-error"><?=owner_dashboard_e((string)$summary['error'])?></div>
          <?php endif; ?>
          <?php $allocation = is_array($summary) ? $summary['allocation'] : ['gross_cents' => 0, 'owner_cents' => 0, 'transaction_count' => 0, 'currency' => 'GHS']; ?>
          <div class="owner-metric-grid">
            <article class="owner-metric">
              <span>My Hostel</span>
              <strong><?=owner_dashboard_e((string)(is_array($summary) ? $summary['property_count'] : 0))?></strong>
              <small>Linked active properties</small>
            </article>
            <article class="owner-metric">
              <span>Network online</span>
              <strong><?=owner_dashboard_e((string)(is_array($summary) ? $summary['network_state'] : 'Unavailable'))?></strong>
              <small><?=owner_dashboard_e((string)(is_array($summary) ? $summary['location_count'] : 0))?> linked locations</small>
            </article>
            <article class="owner-metric">
              <span>Connected Users</span>
              <small>Residents Online</small>
              <strong><?=owner_dashboard_e((string)(is_array($summary) ? $summary['connected_users'] : 'Unavailable'))?></strong>
            </article>
            <article class="owner-metric">
              <span>Revenue This Month</span>
              <small>Gross Resident Purchases</small>
              <strong><?=owner_dashboard_e(owner_dashboard_money((int)$allocation['gross_cents'], (string)$allocation['currency']))?></strong>
            </article>
            <article class="owner-metric">
              <span>Your Share</span>
              <strong><?=owner_dashboard_e(owner_dashboard_money((int)$allocation['owner_cents'], (string)$allocation['currency']))?></strong>
              <small>Based on admin-controlled terms</small>
            </article>
            <article class="owner-metric">
              <span>Transactions</span>
              <small>Recent Transactions</small>
              <strong><?=owner_dashboard_e((string)$allocation['transaction_count'])?></strong>
            </article>
            <article class="owner-metric">
              <span>Property Status</span>
              <strong><?=owner_dashboard_e((string)(is_array($summary) ? $summary['network_state'] : 'Unavailable'))?></strong>
              <small>Admin-linked service state</small>
            </article>
          </div>
          <div class="owner-button-row">
            <a class="owner-button" href="/owner/requests.php">View requests</a>
            <a class="owner-link-button" href="/owner/revenue.php">Revenue report</a>
            <a class="owner-link-button" href="/owner/transactions.php">Transactions</a>
          </div>
        </section>
      <?php else: ?>
        <section class="owner-card owner-suspended-dashboard">
          <h1>Your owner account is suspended</h1>
          <p class="owner-muted">This owner account is restricted. Contact Nister support or an administrator before submitting requests or viewing approved-owner reports.</p>
          <div class="owner-message owner-message-error">Owner mutations are blocked while this account is suspended.</div>
        </section>
      <?php endif; ?>
    </section>
  </main>
</body>
</html>
