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
    'submitted' => 'Submitted',
    'contacted' => 'Contacted',
    'qualified' => 'Qualified',
    'site_survey_required' => 'Site survey required',
    'site_survey_scheduled' => 'Site survey scheduled',
    'site_survey_completed' => 'Site survey completed',
    'quote_prepared' => 'Quote prepared',
    'quote_sent' => 'Quote sent',
    'negotiating' => 'Negotiating',
    'approved' => 'Approved',
    'agreement_signed' => 'Agreement signed',
    'equipment_pending' => 'Equipment pending',
    'installation_scheduled' => 'Installation scheduled',
    'installing' => 'Installing',
    'testing' => 'Testing',
    'active' => 'Active',
    'rejected' => 'Rejected',
    'lost' => 'Lost',
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

$requests = [];
$requestError = '';
try {
  $requests = property_request_list_for_owner($PDO, $ownerId);
} catch (Throwable $e) {
  $requestError = 'Service requests could not be loaded right now.';
}

$statusCopy = [
  'pending' => [
    'title' => 'Your owner account is pending review',
    'body' => 'Nister has the owner account and submitted request details. You can submit additional property requests, but final service decisions still require admin review.',
  ],
  'approved' => [
    'title' => 'Your owner account is approved',
    'body' => 'You can submit and track property service requests from this owner dashboard. Revenue and transaction reports are not part of this onboarding view.',
  ],
  'suspended' => [
    'title' => 'Your owner account is suspended',
    'body' => 'This owner account is restricted. Existing submitted requests remain visible, but new request submission and approved-owner actions require administrator review.',
  ],
];
$currentCopy = $statusCopy[$ownerStatus];
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
  <link rel="stylesheet" href="/assets/owner.css?v=20260811-owner1">
</head>
<body class="owner-page">
  <main class="owner-shell">
    <header class="owner-topbar">
      <a class="owner-brand" href="https://nister.org/" aria-label="Nister Wi-Fi home">
        <span class="owner-mark"><span></span></span>
        <span><strong>Nister Wi-Fi</strong><small>Owner portal</small></span>
      </a>
      <nav class="owner-nav" aria-label="Owner navigation">
        <?php if ($ownerStatus !== 'suspended'): ?>
          <a href="/owner/lead.php">New request</a>
        <?php endif; ?>
        <a href="/owner/logout.php">Logout</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow"><?=owner_dashboard_e(owner_dashboard_status_label($ownerStatus))?></span>
        <h1><?=owner_dashboard_e($currentCopy['title'])?></h1>
        <p><?=owner_dashboard_e($currentCopy['body'])?></p>
        <div class="owner-status-list" aria-label="Owner identity">
          <span><?=owner_dashboard_e((string)($owner['display_name'] ?? 'Owner'))?></span>
          <span><?=owner_dashboard_e(msisdn_display((string)($owner['msisdn'] ?? '')))?></span>
          <span>Status: <?=owner_dashboard_e(owner_dashboard_status_label($ownerStatus))?></span>
        </div>
      </div>

      <section class="owner-card">
        <h1>Service requests</h1>
        <?php if ($requestError !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_dashboard_e($requestError)?></div>
        <?php elseif ($requests === []): ?>
          <p class="owner-muted">No service requests have been submitted from this owner account yet.</p>
          <?php if ($ownerStatus !== 'suspended'): ?>
            <div class="owner-button-row">
              <a class="owner-button" href="/owner/lead.php">Submit a property request</a>
            </div>
          <?php endif; ?>
        <?php else: ?>
          <div class="owner-request-list">
            <?php foreach ($requests as $request): ?>
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
    </section>
  </main>
</body>
</html>
