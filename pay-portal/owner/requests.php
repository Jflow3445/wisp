<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_requests.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();
owner_require_login();

function owner_requests_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_requests_status_label(string $status): string {
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

function owner_requests_date($value): string {
  $raw = trim((string)$value);
  if ($raw === '') return 'Not recorded';
  try {
    return (new DateTimeImmutable($raw, new DateTimeZone('UTC')))->format('Y-m-d H:i');
  } catch (Throwable $e) {
    return $raw;
  }
}

function owner_requests_form_value(array $values, string $field, $default = '') {
  return $values[$field] ?? $default;
}

function owner_requests_selected(array $values, string $field, string $value, string $default = ''): string {
  $current = (string)owner_requests_form_value($values, $field, $default);
  return hash_equals($current, $value) ? ' selected' : '';
}

function owner_requests_checked(array $values, string $field): string {
  $value = owner_requests_form_value($values, $field, '');
  return in_array(strtolower((string)$value), ['1', 'true', 'yes', 'y', 'on'], true) ? ' checked' : '';
}

function owner_requests_public_values(array $request = []): array {
  if ($request === []) {
    return [
      'country' => 'Ghana',
      'deployment_preference' => 'recommend_for_me',
      'has_wifi' => '',
    ];
  }
  return property_request_input_from_row($request);
}

function owner_requests_render_form(array $values, string $action, string $csrf, ?int $requestId = null): void {
  ?>
  <form class="owner-form owner-request-form" method="post" action="/owner/requests.php">
    <input type="hidden" name="csrf" value="<?=owner_requests_e($csrf)?>">
    <input type="hidden" name="action" value="<?=owner_requests_e($action)?>">
    <?php if ($requestId !== null): ?>
      <input type="hidden" name="request_id" value="<?=owner_requests_e((string)$requestId)?>">
    <?php endif; ?>

    <section class="owner-form-section">
      <h2>Where should we start?</h2>
      <p class="owner-muted">Estimates are completely fine.</p>
      <div class="owner-form-grid">
        <div class="owner-field">
          <label for="<?=$action?>_contact_name">Your name *</label>
          <input id="<?=$action?>_contact_name" name="contact_name" type="text" maxlength="120" required value="<?=owner_requests_e(owner_requests_form_value($values, 'contact_name'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_contact_phone">Best phone number *</label>
          <input id="<?=$action?>_contact_phone" name="contact_phone" type="tel" inputmode="tel" maxlength="16" required value="<?=owner_requests_e(owner_requests_form_value($values, 'contact_phone'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_contact_whatsapp">WhatsApp number</label>
          <input id="<?=$action?>_contact_whatsapp" name="contact_whatsapp" type="tel" inputmode="tel" maxlength="16" value="<?=owner_requests_e(owner_requests_form_value($values, 'contact_whatsapp'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_contact_email">Email address</label>
          <input id="<?=$action?>_contact_email" name="contact_email" type="email" maxlength="160" value="<?=owner_requests_e(owner_requests_form_value($values, 'contact_email'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_property_name">Hostel/property name *</label>
          <input id="<?=$action?>_property_name" name="property_name" type="text" maxlength="160" required value="<?=owner_requests_e(owner_requests_form_value($values, 'property_name'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_country">Country *</label>
          <input id="<?=$action?>_country" name="country" type="text" maxlength="80" required value="<?=owner_requests_e(owner_requests_form_value($values, 'country', 'Ghana'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_region">Region *</label>
          <input id="<?=$action?>_region" name="region" type="text" maxlength="120" required value="<?=owner_requests_e(owner_requests_form_value($values, 'region'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_town">Town *</label>
          <input id="<?=$action?>_town" name="town" type="text" maxlength="120" required value="<?=owner_requests_e(owner_requests_form_value($values, 'town'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_number_of_rooms">Approximate number of rooms</label>
          <input id="<?=$action?>_number_of_rooms" name="number_of_rooms" type="number" min="0" inputmode="numeric" value="<?=owner_requests_e(owner_requests_form_value($values, 'number_of_rooms'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_estimated_residents">Approximate number of residents</label>
          <input id="<?=$action?>_estimated_residents" name="estimated_residents" type="number" min="0" inputmode="numeric" value="<?=owner_requests_e(owner_requests_form_value($values, 'estimated_residents'))?>">
        </div>
      </div>
    </section>

    <section class="owner-form-section">
      <h2>What does internet look like there today?</h2>
      <p class="owner-muted">Do not know the technical details? Skip the optional fields.</p>
      <div class="owner-form-grid">
        <div class="owner-field owner-field-full">
          <label for="<?=$action?>_address">Street address or directions</label>
          <textarea id="<?=$action?>_address" name="address"><?=owner_requests_e(owner_requests_form_value($values, 'address'))?></textarea>
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_digital_address">Digital address</label>
          <input id="<?=$action?>_digital_address" name="digital_address" type="text" maxlength="80" value="<?=owner_requests_e(owner_requests_form_value($values, 'digital_address'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_google_maps_url">Google Maps URL</label>
          <input id="<?=$action?>_google_maps_url" name="google_maps_url" type="url" maxlength="500" value="<?=owner_requests_e(owner_requests_form_value($values, 'google_maps_url'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_nearby_campus">Nearby campus or institution</label>
          <input id="<?=$action?>_nearby_campus" name="nearby_campus" type="text" maxlength="160" value="<?=owner_requests_e(owner_requests_form_value($values, 'nearby_campus'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_number_of_buildings">Number of buildings</label>
          <input id="<?=$action?>_number_of_buildings" name="number_of_buildings" type="number" min="0" inputmode="numeric" value="<?=owner_requests_e(owner_requests_form_value($values, 'number_of_buildings'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_number_of_floors">Number of floors</label>
          <input id="<?=$action?>_number_of_floors" name="number_of_floors" type="number" min="0" inputmode="numeric" value="<?=owner_requests_e(owner_requests_form_value($values, 'number_of_floors'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_current_occupancy">Current occupancy</label>
          <input id="<?=$action?>_current_occupancy" name="current_occupancy" type="number" min="0" inputmode="numeric" value="<?=owner_requests_e(owner_requests_form_value($values, 'current_occupancy'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_has_wifi">Does the property currently provide Wi-Fi? *</label>
          <select id="<?=$action?>_has_wifi" name="has_wifi" required>
            <option value="">Select one</option>
            <option value="1"<?=owner_requests_selected($values, 'has_wifi', '1')?>>Yes</option>
            <option value="0"<?=owner_requests_selected($values, 'has_wifi', '0')?>>No</option>
          </select>
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_current_provider">Current provider</label>
          <input id="<?=$action?>_current_provider" name="current_provider" type="text" maxlength="160" value="<?=owner_requests_e(owner_requests_form_value($values, 'current_provider'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_connection_type">Current connection type</label>
          <select id="<?=$action?>_connection_type" name="connection_type">
            <option value="">Select one</option>
            <option value="fiber"<?=owner_requests_selected($values, 'connection_type', 'fiber')?>>Fibre</option>
            <option value="wireless"<?=owner_requests_selected($values, 'connection_type', 'wireless')?>>Wireless broadband</option>
            <option value="mobile_router"<?=owner_requests_selected($values, 'connection_type', 'mobile_router')?>>Mobile router or MiFi</option>
            <option value="satellite"<?=owner_requests_selected($values, 'connection_type', 'satellite')?>>Satellite</option>
            <option value="none"<?=owner_requests_selected($values, 'connection_type', 'none')?>>No current connection</option>
            <option value="not_sure"<?=owner_requests_selected($values, 'connection_type', 'not_sure')?>>Not sure</option>
          </select>
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_current_monthly_cost">Current monthly internet cost (GHS)</label>
          <input id="<?=$action?>_current_monthly_cost" name="current_monthly_cost" type="number" min="0" step="0.01" inputmode="decimal" value="<?=owner_requests_e(owner_requests_form_value($values, 'current_monthly_cost'))?>">
        </div>
        <div class="owner-field">
          <label for="<?=$action?>_current_speed">Current speed</label>
          <input id="<?=$action?>_current_speed" name="current_speed" type="text" maxlength="120" value="<?=owner_requests_e(owner_requests_form_value($values, 'current_speed'))?>">
        </div>
      </div>
    </section>

    <section class="owner-form-section">
      <h2>What would you most like to improve?</h2>
      <p class="owner-muted">Select everything that sounds familiar.</p>
      <div class="owner-form-grid">
        <label class="owner-check"><input name="poor_coverage" type="checkbox" value="yes"<?=owner_requests_checked($values, 'poor_coverage')?>><span><strong>Wi-Fi does not reach every room.</strong><small>Rooms or blocks lose signal.</small></span></label>
        <label class="owner-check"><input name="slow_internet" type="checkbox" value="yes"<?=owner_requests_checked($values, 'slow_internet')?>><span><strong>Internet feels too slow.</strong><small>Service slows during busy periods.</small></span></label>
        <label class="owner-check"><input name="downtime" type="checkbox" value="yes"<?=owner_requests_checked($values, 'downtime')?>><span><strong>Connection goes down too often.</strong><small>Residents complain when access is unstable.</small></span></label>
        <label class="owner-check"><input name="user_management_problem" type="checkbox" value="yes"<?=owner_requests_checked($values, 'user_management_problem')?>><span><strong>Managing access is difficult.</strong><small>Access is hard to control manually.</small></span></label>
        <label class="owner-check"><input name="shared_password_problem" type="checkbox" value="yes"<?=owner_requests_checked($values, 'shared_password_problem')?>><span><strong>Wi-Fi passwords get shared.</strong><small>One password can spread indefinitely.</small></span></label>
        <label class="owner-check"><input name="payment_problem" type="checkbox" value="yes"<?=owner_requests_checked($values, 'payment_problem')?>><span><strong>Collecting internet payments is difficult.</strong><small>Payments should not become another admin job.</small></span></label>
        <label class="owner-check"><input name="starting_from_scratch" type="checkbox" value="yes"<?=owner_requests_checked($values, 'starting_from_scratch')?>><span><strong>We need Wi-Fi installed from scratch.</strong><small>No adequate resident Wi-Fi is in place.</small></span></label>
      </div>
    </section>

    <section class="owner-form-section">
      <h2>How would you prefer to set this up?</h2>
      <div class="owner-field">
        <label for="<?=$action?>_deployment_preference">Commercial preference *</label>
        <select id="<?=$action?>_deployment_preference" name="deployment_preference" required>
          <option value="owner_funded"<?=owner_requests_selected($values, 'deployment_preference', 'owner_funded')?>>We'll buy the equipment</option>
          <option value="request_nister_funding"<?=owner_requests_selected($values, 'deployment_preference', 'request_nister_funding')?>>We'd like Nister to consider funding it</option>
          <option value="property_paid_wifi"<?=owner_requests_selected($values, 'deployment_preference', 'property_paid_wifi')?>>We want Wi-Fi included with accommodation</option>
          <option value="recommend_for_me"<?=owner_requests_selected($values, 'deployment_preference', 'recommend_for_me', 'recommend_for_me')?>>Recommend what makes sense</option>
        </select>
      </div>
      <div class="owner-field">
        <label for="<?=$action?>_notes">Anything else Nister should know?</label>
        <textarea id="<?=$action?>_notes" name="notes"><?=owner_requests_e(owner_requests_form_value($values, 'notes'))?></textarea>
      </div>
    </section>

    <div class="owner-button-row">
      <button class="owner-button" type="submit"><?=owner_requests_e($requestId === null ? 'Request My Property Assessment' : 'Update Submitted Request')?></button>
    </div>
  </form>
  <?php
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

$err = '';
$msg = '';
$postValues = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  owner_require_same_origin_post();
  owner_require_csrf_post();
  $action = (string)($_POST['action'] ?? '');
  $postValues = $_POST;
  try {
    if ($ownerStatus === 'suspended') {
      throw new RuntimeException('owner_suspended');
    }
    if ($action === 'request_create') {
      property_request_create_for_owner($PDO, $ownerId, $_POST);
      $msg = "We've got your property details. Your property details have already been saved.";
      $postValues = [];
    } elseif ($action === 'request_update') {
      $requestId = (int)($_POST['request_id'] ?? 0);
      property_request_update_by_owner($PDO, $ownerId, $requestId, $_POST);
      $msg = 'Submitted request updated.';
      $postValues = [];
    } else {
      throw new InvalidArgumentException('unsupported_action');
    }
  } catch (Throwable $e) {
    $message = $e->getMessage();
    if ($message === 'property_request_not_editable') {
      $err = 'This request is already under Nister review, so owner edits are closed.';
    } elseif ($message === 'owner_suspended') {
      $err = 'Owner mutations are blocked while this account is suspended.';
    } elseif (str_starts_with($message, 'owner_field_not_allowed:')) {
      $err = 'One of the submitted fields is not allowed for owner request updates.';
    } else {
      $err = 'Check the required property fields, then try again.';
    }
  }
}

$requests = [];
$requestError = '';
try {
  $requests = property_request_list_for_owner($PDO, $ownerId);
} catch (Throwable $e) {
  $requestError = 'Service requests could not be loaded right now.';
}
$csrf = owner_csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Owner Requests</title>
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
        <a href="/owner/dashboard.php">Dashboard</a>
        <a href="/owner/requests.php" aria-current="page">Requests</a>
        <?php if ($ownerStatus === 'approved'): ?>
          <a href="/owner/revenue.php">Revenue</a>
          <a href="/owner/transactions.php">Transactions</a>
        <?php endif; ?>
        <a href="/owner/logout.php">Logout</a>
      </nav>
    </header>

    <section class="owner-stack">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow"><?=owner_requests_e(ucfirst($ownerStatus))?></span>
        <h1>Tell us about the hostel. We'll handle the technical part.</h1>
        <p>Use this page to request a property assessment or follow requests already with Nister.</p>
      </div>

      <?php if ($err !== ''): ?>
        <div class="owner-message owner-message-error"><?=owner_requests_e($err)?></div>
      <?php endif; ?>
      <?php if ($msg !== ''): ?>
        <div class="owner-message owner-message-ok"><?=owner_requests_e($msg)?></div>
      <?php endif; ?>
      <?php if ($requestError !== ''): ?>
        <div class="owner-message owner-message-error"><?=owner_requests_e($requestError)?></div>
      <?php endif; ?>

      <section class="owner-card">
        <h1>Request list</h1>
        <?php if ($requests === []): ?>
          <p class="owner-muted">No service requests have been submitted from this owner account yet.</p>
        <?php else: ?>
          <div class="owner-request-list">
            <?php foreach ($requests as $request): ?>
              <?php
                $requestId = (int)($request['id'] ?? 0);
                $status = (string)($request['status'] ?? 'submitted');
                $editable = in_array($status, property_request_owner_editable_statuses(), true);
              ?>
              <article class="owner-request-card owner-request-card-wide">
                <div>
                  <strong><?=owner_requests_e((string)($request['property_name'] ?? 'Property request'))?></strong>
                  <span><?=owner_requests_e((string)($request['town'] ?? ''))?><?=trim((string)($request['region'] ?? '')) !== '' ? ', ' . owner_requests_e((string)$request['region']) : ''?></span>
                  <small>Submitted <?=owner_requests_e(owner_requests_date($request['created_at'] ?? ''))?></small>
                </div>
                <div>
                  <span class="owner-pill"><?=owner_requests_e(owner_requests_status_label($status))?></span>
                  <?php if ($editable): ?>
                    <a class="owner-link-button" href="#request-<?=owner_requests_e((string)$requestId)?>">Edit submitted request</a>
                  <?php else: ?>
                    <small>Read-only while Nister review continues.</small>
                  <?php endif; ?>
                </div>
              </article>
              <?php if ($editable): ?>
                <section id="request-<?=owner_requests_e((string)$requestId)?>" class="owner-card owner-inline-edit">
                  <h2>Edit submitted request</h2>
                  <p class="owner-muted">You can edit the request while it is still at Request received. After Nister begins review, the request becomes read-only.</p>
                  <?php owner_requests_render_form(owner_requests_public_values($request), 'request_update', $csrf, $requestId); ?>
                </section>
              <?php endif; ?>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </section>

      <?php if ($ownerStatus !== 'suspended'): ?>
        <section id="new-request" class="owner-card">
          <h1>Request My Property Assessment</h1>
          <p class="owner-muted">No commitment to install. Tell us where your hostel is, roughly how many rooms and residents it has, and what internet looks like today.</p>
          <?php owner_requests_render_form($postValues !== [] ? $postValues : owner_requests_public_values(), 'request_create', $csrf, null); ?>
        </section>
      <?php else: ?>
        <section class="owner-card">
          <h1>Your owner account is suspended</h1>
          <p class="owner-muted">Contact Nister support or an administrator before submitting another request.</p>
        </section>
      <?php endif; ?>
    </section>
  </main>
</body>
</html>
