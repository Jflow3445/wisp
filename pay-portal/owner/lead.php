<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_leads.php';
require_once __DIR__ . '/../lib/owner_otp.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();

function owner_lead_e($value): string {
  return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function owner_lead_old(string $field, $default = '') {
  return $_POST[$field] ?? $_GET[$field] ?? $default;
}

function owner_lead_checked(string $field): string {
  $value = owner_lead_old($field, '');
  return in_array(strtolower((string)$value), ['1', 'true', 'yes', 'y', 'on'], true) ? ' checked' : '';
}

function owner_lead_selected(string $field, string $value, string $default = ''): string {
  $current = (string)owner_lead_old($field, $default);
  return hash_equals($current, $value) ? ' selected' : '';
}

function owner_lead_origin_allowed(): bool {
  if (nister_is_same_origin_request()) return true;
  $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  if ($method !== 'POST') return true;
  $source = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
  if ($source === '') $source = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
  if ($source === '') return false;
  $host = strtolower((string)(parse_url($source, PHP_URL_HOST) ?? ''));
  return in_array($host, ['nister.org', 'www.nister.org'], true);
}

function owner_lead_error_message(Throwable $e): string {
  $message = $e->getMessage();
  if (str_starts_with($message, 'invalid_property_lead:')) {
    return 'Check the required property and contact fields, then request the assessment again.';
  }
  if ($message === 'settings table missing and cannot be created (db permissions?)') {
    return 'The request was saved, but SMS settings are not ready. Contact Nister support to complete phone verification.';
  }
  return 'We could not save the property assessment request. Review the form and try again.';
}

$err = '';
$msg = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  if (!owner_lead_origin_allowed()) {
    $err = 'For security, submit this request from nister.org or the owner portal.';
  } else {
    try {
      $lead = property_lead_create($PDO, $_POST, $_SERVER);
      $otp = owner_otp_create($PDO, (string)$lead['contact_phone'], (int)$lead['id'], $ENV, $_SERVER);
      $qs = ['lead_id' => (int)$lead['id']];
      if (($otp['ok'] ?? false) !== true) {
        $qs['otp'] = (string)($otp['error'] ?? 'send_failed');
      }
      header('Location: /owner/register.php?' . http_build_query($qs));
      exit;
    } catch (Throwable $e) {
      $err = owner_lead_error_message($e);
    }
  }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Nister Wi-Fi | Request Property Assessment</title>
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
        <a href="/owner/login.php">Owner login</a>
        <a href="https://wifi.nister.org/">Get online</a>
      </nav>
    </header>

    <section class="owner-layout">
      <div class="owner-panel owner-hero">
        <span class="owner-eyebrow">Request Nister</span>
        <h1>Tell us about your hostel. We'll handle the technical part.</h1>
        <p>We need a few practical details about the property to understand where to start. Estimates are fine.</p>
        <div class="owner-status-list" aria-label="Request steps">
          <span>1. Request the property assessment</span>
          <span>2. Verify your phone number</span>
          <span>3. Track the request from your owner account</span>
        </div>
      </div>

      <section class="owner-card">
        <h1>Where should we start?</h1>
        <p class="owner-muted">No commitment to install. Required fields are marked with an asterisk.</p>
        <?php if ($err !== ''): ?>
          <div class="owner-message owner-message-error"><?=owner_lead_e($err)?></div>
        <?php endif; ?>
        <?php if ($msg !== ''): ?>
          <div class="owner-message owner-message-ok"><?=owner_lead_e($msg)?></div>
        <?php endif; ?>

        <form class="owner-form" method="post" action="/owner/lead.php" autocomplete="on">
          <div class="owner-form-grid">
            <div class="owner-field">
              <label for="contact_name">Your name *</label>
              <input id="contact_name" name="contact_name" type="text" required value="<?=owner_lead_e(owner_lead_old('contact_name'))?>">
            </div>
            <div class="owner-field">
              <label for="contact_phone">Best phone number *</label>
              <input id="contact_phone" name="contact_phone" type="tel" required inputmode="tel" value="<?=owner_lead_e(owner_lead_old('contact_phone'))?>">
              <small>Use a Ghana phone number Nister can call for site questions.</small>
            </div>
            <div class="owner-field">
              <label for="contact_whatsapp">WhatsApp number</label>
              <input id="contact_whatsapp" name="contact_whatsapp" type="tel" inputmode="tel" value="<?=owner_lead_e(owner_lead_old('contact_whatsapp'))?>">
            </div>
            <div class="owner-field">
              <label for="contact_email">Email address</label>
              <input id="contact_email" name="contact_email" type="email" value="<?=owner_lead_e(owner_lead_old('contact_email'))?>">
            </div>
            <div class="owner-field">
              <label for="property_name">Hostel/property name *</label>
              <input id="property_name" name="property_name" type="text" required value="<?=owner_lead_e(owner_lead_old('property_name'))?>">
            </div>
            <div class="owner-field">
              <label for="country">Country *</label>
              <input id="country" name="country" type="text" required value="<?=owner_lead_e(owner_lead_old('country', 'Ghana'))?>">
            </div>
            <div class="owner-field">
              <label for="region">Region *</label>
              <input id="region" name="region" type="text" required value="<?=owner_lead_e(owner_lead_old('region'))?>">
            </div>
            <div class="owner-field">
              <label for="town">Town or city *</label>
              <input id="town" name="town" type="text" required value="<?=owner_lead_e(owner_lead_old('town'))?>">
            </div>
            <div class="owner-field owner-field-full">
              <label for="address">Street address or directions</label>
              <textarea id="address" name="address"><?=owner_lead_e(owner_lead_old('address'))?></textarea>
            </div>
            <div class="owner-field">
              <label for="digital_address">Digital address</label>
              <input id="digital_address" name="digital_address" type="text" value="<?=owner_lead_e(owner_lead_old('digital_address'))?>">
            </div>
            <div class="owner-field">
              <label for="google_maps_url">Google Maps URL</label>
              <input id="google_maps_url" name="google_maps_url" type="url" value="<?=owner_lead_e(owner_lead_old('google_maps_url'))?>">
            </div>
            <div class="owner-field">
              <label for="nearby_campus">Nearby campus or institution</label>
              <input id="nearby_campus" name="nearby_campus" type="text" value="<?=owner_lead_e(owner_lead_old('nearby_campus'))?>">
            </div>
            <div class="owner-field">
              <label for="number_of_buildings">Number of buildings</label>
              <input id="number_of_buildings" name="number_of_buildings" type="number" min="0" value="<?=owner_lead_e(owner_lead_old('number_of_buildings'))?>">
            </div>
            <div class="owner-field">
              <label for="number_of_floors">Number of floors</label>
              <input id="number_of_floors" name="number_of_floors" type="number" min="0" value="<?=owner_lead_e(owner_lead_old('number_of_floors'))?>">
            </div>
            <div class="owner-field">
              <label for="number_of_rooms">Approximate number of rooms</label>
              <input id="number_of_rooms" name="number_of_rooms" type="number" min="0" value="<?=owner_lead_e(owner_lead_old('number_of_rooms'))?>">
            </div>
            <div class="owner-field">
              <label for="estimated_residents">Approximate number of residents</label>
              <input id="estimated_residents" name="estimated_residents" type="number" min="0" value="<?=owner_lead_e(owner_lead_old('estimated_residents'))?>">
            </div>
            <div class="owner-field">
              <label for="current_occupancy">Current occupancy</label>
              <input id="current_occupancy" name="current_occupancy" type="number" min="0" value="<?=owner_lead_e(owner_lead_old('current_occupancy'))?>">
            </div>
            <div class="owner-field">
              <label for="has_wifi">Does the property currently provide Wi-Fi? *</label>
              <select id="has_wifi" name="has_wifi" required>
                <option value="">Select one</option>
                <option value="1"<?=owner_lead_selected('has_wifi', '1')?>>Yes</option>
                <option value="yes"<?=owner_lead_selected('has_wifi', 'yes')?>>Partly</option>
                <option value="0"<?=owner_lead_selected('has_wifi', '0')?>>No</option>
              </select>
            </div>
            <div class="owner-field">
              <label for="current_provider">Current provider</label>
              <input id="current_provider" name="current_provider" type="text" value="<?=owner_lead_e(owner_lead_old('current_provider'))?>">
            </div>
            <div class="owner-field">
              <label for="connection_type">Current connection type</label>
              <select id="connection_type" name="connection_type">
                <option value="">Select one</option>
                <option value="fiber"<?=owner_lead_selected('connection_type', 'fiber')?>>Fiber</option>
                <option value="wireless"<?=owner_lead_selected('connection_type', 'wireless')?>>Wireless broadband</option>
                <option value="mobile_router"<?=owner_lead_selected('connection_type', 'mobile_router')?>>Mobile router or MiFi</option>
                <option value="satellite"<?=owner_lead_selected('connection_type', 'satellite')?>>Satellite</option>
                <option value="none"<?=owner_lead_selected('connection_type', 'none')?>>No current connection</option>
                <option value="not_sure"<?=owner_lead_selected('connection_type', 'not_sure')?>>Not sure</option>
              </select>
            </div>
            <div class="owner-field">
              <label for="current_monthly_cost">Current monthly internet cost (GHS)</label>
              <input id="current_monthly_cost" name="current_monthly_cost" type="number" min="0" step="0.01" inputmode="decimal" value="<?=owner_lead_e(owner_lead_old('current_monthly_cost'))?>">
            </div>
            <div class="owner-field">
              <label for="current_speed">Current speed</label>
              <input id="current_speed" name="current_speed" type="text" value="<?=owner_lead_e(owner_lead_old('current_speed'))?>">
            </div>
            <div class="owner-field">
              <label for="deployment_preference">Commercial preference *</label>
              <select id="deployment_preference" name="deployment_preference" required>
                <option value="">Select one</option>
                <option value="owner_funded"<?=owner_lead_selected('deployment_preference', 'owner_funded')?>>We'll buy the equipment</option>
                <option value="request_nister_funding"<?=owner_lead_selected('deployment_preference', 'request_nister_funding')?>>We'd like Nister to consider funding it</option>
                <option value="property_paid_wifi"<?=owner_lead_selected('deployment_preference', 'property_paid_wifi')?>>We want Wi-Fi included with accommodation</option>
                <option value="recommend_for_me"<?=owner_lead_selected('deployment_preference', 'recommend_for_me', 'recommend_for_me')?>>Recommend what makes sense</option>
              </select>
            </div>
          </div>

          <div class="owner-form-grid">
            <label class="owner-check"><input name="poor_coverage" type="checkbox" value="yes"<?=owner_lead_checked('poor_coverage')?>><span><strong>Wi-Fi does not reach every room.</strong><small>Rooms or blocks lose signal.</small></span></label>
            <label class="owner-check"><input name="slow_internet" type="checkbox" value="yes"<?=owner_lead_checked('slow_internet')?>><span><strong>Internet feels too slow.</strong><small>Service slows during busy periods.</small></span></label>
            <label class="owner-check"><input name="downtime" type="checkbox" value="yes"<?=owner_lead_checked('downtime')?>><span><strong>Connection goes down too often.</strong><small>Residents complain when access is unstable.</small></span></label>
            <label class="owner-check"><input name="payment_problem" type="checkbox" value="yes"<?=owner_lead_checked('payment_problem')?>><span><strong>Collecting internet payments is difficult.</strong><small>Payments should not become another admin job.</small></span></label>
            <label class="owner-check"><input name="user_management_problem" type="checkbox" value="yes"<?=owner_lead_checked('user_management_problem')?>><span><strong>Managing access is difficult.</strong><small>Access is hard to control manually.</small></span></label>
            <label class="owner-check"><input name="shared_password_problem" type="checkbox" value="yes"<?=owner_lead_checked('shared_password_problem')?>><span><strong>Wi-Fi passwords get shared.</strong><small>One password can spread indefinitely.</small></span></label>
            <label class="owner-check"><input name="starting_from_scratch" type="checkbox" value="yes"<?=owner_lead_checked('starting_from_scratch')?>><span><strong>We need Wi-Fi installed from scratch.</strong><small>No adequate resident Wi-Fi is in place.</small></span></label>
          </div>

          <div class="owner-button-row">
            <button class="owner-button" type="submit">Request My Property Assessment</button>
            <a class="owner-link-button" href="/owner/login.php">I already have an owner account</a>
          </div>
        </form>
      </section>
    </section>
  </main>
</body>
</html>
