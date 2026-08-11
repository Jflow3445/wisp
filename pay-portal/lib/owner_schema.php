<?php
declare(strict_types=1);

const OWNER_SCHEMA_OWNER_STATUS_ENUM = "ENUM('pending','approved','suspended')";
const OWNER_SCHEMA_OWNER_STATUS_ACTION_ENUM = "ENUM('approve','suspend','reactivate')";
const OWNER_SCHEMA_DEPLOYMENT_PREFERENCE_ENUM = "ENUM('owner_funded','request_nister_funding','property_paid_wifi','recommend_for_me')";
const OWNER_SCHEMA_DEPLOYMENT_MODEL_ENUM = "ENUM('owner_funded','nister_funded')";
const OWNER_SCHEMA_BILLING_MODEL_ENUM = "ENUM('resident_pays','property_pays')";
const OWNER_SCHEMA_SERVICE_REQUEST_STATUS_ENUM = "ENUM('submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost')";

function owner_schema_table_exists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = :t LIMIT 1"
  );
  $st->execute([':t' => $table]);
  return (bool)$st->fetchColumn();
}

function owner_schema_column_exists(PDO $pdo, string $table, string $column): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1"
  );
  $st->execute([':t' => $table, ':c' => $column]);
  return (bool)$st->fetchColumn();
}

function owner_schema_index_exists(PDO $pdo, string $table, string $index): bool {
  $st = $pdo->prepare(
    "SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = :t AND index_name = :i LIMIT 1"
  );
  $st->execute([':t' => $table, ':i' => $index]);
  return (bool)$st->fetchColumn();
}

function owner_schema_identifier(string $identifier): string {
  if (!preg_match('/^[A-Za-z0-9_]+$/', $identifier)) {
    throw new InvalidArgumentException('invalid schema identifier');
  }
  return '`' . $identifier . '`';
}

function owner_schema_add_column_if_missing(PDO $pdo, string $table, string $column, string $definition): void {
  if (!owner_schema_table_exists($pdo, $table)) return;
  if (owner_schema_column_exists($pdo, $table, $column)) return;
  $pdo->exec('ALTER TABLE ' . owner_schema_identifier($table) . ' ADD COLUMN ' . $definition);
}

function owner_schema_add_index_if_missing(PDO $pdo, string $table, string $index, string $definition): void {
  if (!owner_schema_table_exists($pdo, $table)) return;
  if (owner_schema_index_exists($pdo, $table, $index)) return;
  $pdo->exec('ALTER TABLE ' . owner_schema_identifier($table) . ' ADD ' . $definition);
}

function owner_schema_table_sql(): array {
  $ownerStatus = OWNER_SCHEMA_OWNER_STATUS_ENUM;
  $ownerActions = OWNER_SCHEMA_OWNER_STATUS_ACTION_ENUM;
  $deploymentPreference = OWNER_SCHEMA_DEPLOYMENT_PREFERENCE_ENUM;
  $deploymentModel = OWNER_SCHEMA_DEPLOYMENT_MODEL_ENUM;
  $billingModel = OWNER_SCHEMA_BILLING_MODEL_ENUM;
  $requestStatus = OWNER_SCHEMA_SERVICE_REQUEST_STATUS_ENUM;

  return [
    'property_owners' => "CREATE TABLE IF NOT EXISTS property_owners (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      msisdn VARCHAR(16) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      status {$ownerStatus} NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      approved_at DATETIME NULL,
      approved_by VARCHAR(120) NULL,
      suspended_at DATETIME NULL,
      suspended_by VARCHAR(120) NULL,
      suspended_reason TEXT NULL,
      admin_notes TEXT NULL,
      UNIQUE KEY uq_property_owners_msisdn (msisdn),
      KEY idx_property_owners_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_owner_status_events' => "CREATE TABLE IF NOT EXISTS property_owner_status_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id BIGINT UNSIGNED NOT NULL,
      action {$ownerActions} NOT NULL,
      previous_status {$ownerStatus} NOT NULL,
      new_status {$ownerStatus} NOT NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(120) NOT NULL,
      request_ip VARCHAR(64) NULL,
      KEY idx_property_owner_status_events_owner (owner_id, created_at),
      KEY idx_property_owner_status_events_action (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'owner_otp_challenges' => "CREATE TABLE IF NOT EXISTS owner_otp_challenges (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      msisdn VARCHAR(16) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      purpose ENUM('register_request') NOT NULL DEFAULT 'register_request',
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      KEY idx_owner_otp_msisdn_created (msisdn, created_at),
      KEY idx_owner_otp_expires (expires_at),
      KEY idx_owner_otp_ip_created (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_leads' => "CREATE TABLE IF NOT EXISTS property_leads (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      public_ref VARCHAR(32) NOT NULL,
      contact_name VARCHAR(120) NOT NULL,
      contact_phone VARCHAR(16) NOT NULL,
      contact_whatsapp VARCHAR(16) NULL,
      contact_email VARCHAR(160) NULL,
      property_name VARCHAR(160) NOT NULL,
      country VARCHAR(80) NOT NULL,
      region VARCHAR(120) NOT NULL,
      town VARCHAR(120) NOT NULL,
      address TEXT NULL,
      digital_address VARCHAR(80) NULL,
      google_maps_url VARCHAR(500) NULL,
      nearby_campus VARCHAR(160) NULL,
      number_of_buildings INT NULL,
      number_of_floors INT NULL,
      number_of_rooms INT NULL,
      estimated_residents INT NULL,
      current_occupancy INT NULL,
      has_wifi TINYINT(1) NOT NULL DEFAULT 0,
      current_provider VARCHAR(160) NULL,
      connection_type VARCHAR(120) NULL,
      current_monthly_cost_cents INT NULL,
      current_monthly_cost_currency CHAR(3) NOT NULL DEFAULT 'GHS',
      current_speed VARCHAR(120) NULL,
      poor_coverage TINYINT(1) NOT NULL DEFAULT 0,
      slow_internet TINYINT(1) NOT NULL DEFAULT 0,
      downtime TINYINT(1) NOT NULL DEFAULT 0,
      payment_problem TINYINT(1) NOT NULL DEFAULT 0,
      user_management_problem TINYINT(1) NOT NULL DEFAULT 0,
      shared_password_problem TINYINT(1) NOT NULL DEFAULT 0,
      starting_from_scratch TINYINT(1) NOT NULL DEFAULT 0,
      deployment_preference {$deploymentPreference} NOT NULL DEFAULT 'recommend_for_me',
      status ENUM('new','otp_pending','verified','converted','closed','spam') NOT NULL DEFAULT 'new',
      source VARCHAR(80) NOT NULL DEFAULT 'request-installation',
      utm_source VARCHAR(120) NULL,
      utm_medium VARCHAR(120) NULL,
      utm_campaign VARCHAR(120) NULL,
      referrer VARCHAR(500) NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      verified_at DATETIME NULL,
      converted_at DATETIME NULL,
      converted_owner_id BIGINT UNSIGNED NULL,
      converted_service_request_id BIGINT UNSIGNED NULL,
      admin_notes TEXT NULL,
      UNIQUE KEY uq_property_leads_public_ref (public_ref),
      KEY idx_property_leads_contact_phone (contact_phone, created_at),
      KEY idx_property_leads_status (status, created_at),
      KEY idx_property_leads_converted_owner (converted_owner_id),
      KEY idx_property_leads_converted_request (converted_service_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_service_requests' => "CREATE TABLE IF NOT EXISTS property_service_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id BIGINT UNSIGNED NOT NULL,
      lead_id BIGINT UNSIGNED NULL,
      property_name VARCHAR(160) NOT NULL,
      country VARCHAR(80) NOT NULL,
      region VARCHAR(120) NOT NULL,
      town VARCHAR(120) NOT NULL,
      address TEXT NULL,
      digital_address VARCHAR(80) NULL,
      google_maps_url VARCHAR(500) NULL,
      nearby_campus VARCHAR(160) NULL,
      contact_name VARCHAR(120) NULL,
      contact_phone VARCHAR(16) NULL,
      contact_whatsapp VARCHAR(16) NULL,
      contact_email VARCHAR(160) NULL,
      number_of_buildings INT NULL,
      number_of_floors INT NULL,
      number_of_rooms INT NULL,
      estimated_residents INT NULL,
      current_occupancy INT NULL,
      has_wifi TINYINT(1) NOT NULL DEFAULT 0,
      current_provider VARCHAR(160) NULL,
      connection_type VARCHAR(120) NULL,
      current_monthly_cost_cents INT NULL,
      current_monthly_cost_currency CHAR(3) NOT NULL DEFAULT 'GHS',
      current_speed VARCHAR(120) NULL,
      poor_coverage TINYINT(1) NOT NULL DEFAULT 0,
      slow_internet TINYINT(1) NOT NULL DEFAULT 0,
      downtime TINYINT(1) NOT NULL DEFAULT 0,
      payment_problem TINYINT(1) NOT NULL DEFAULT 0,
      user_management_problem TINYINT(1) NOT NULL DEFAULT 0,
      shared_password_problem TINYINT(1) NOT NULL DEFAULT 0,
      starting_from_scratch TINYINT(1) NOT NULL DEFAULT 0,
      deployment_preference {$deploymentPreference} NOT NULL DEFAULT 'recommend_for_me',
      deployment_model {$deploymentModel} NULL,
      billing_model {$billingModel} NULL,
      notes TEXT NULL,
      status {$requestStatus} NOT NULL DEFAULT 'submitted',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      reviewed_at DATETIME NULL,
      reviewed_by VARCHAR(120) NULL,
      converted_at DATETIME NULL,
      converted_by VARCHAR(120) NULL,
      converted_property_id BIGINT UNSIGNED NULL,
      admin_notes TEXT NULL,
      KEY idx_property_service_requests_owner (owner_id, status, created_at),
      KEY idx_property_service_requests_lead (lead_id),
      KEY idx_property_service_requests_status (status, created_at),
      KEY idx_property_service_requests_converted_property (converted_property_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_service_request_events' => "CREATE TABLE IF NOT EXISTS property_service_request_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      service_request_id BIGINT UNSIGNED NOT NULL,
      action ENUM('advance','reject','lose','convert_property','admin_note') NOT NULL,
      previous_status {$requestStatus} NOT NULL,
      new_status {$requestStatus} NOT NULL,
      note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(120) NOT NULL,
      request_ip VARCHAR(64) NULL,
      KEY idx_property_service_request_events_request (service_request_id, created_at),
      KEY idx_property_service_request_events_action (action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'properties' => "CREATE TABLE IF NOT EXISTS properties (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      country VARCHAR(80) NULL,
      region VARCHAR(120) NULL,
      town VARCHAR(120) NULL,
      address TEXT NULL,
      digital_address VARCHAR(80) NULL,
      google_maps_url VARCHAR(500) NULL,
      nearby_campus VARCHAR(160) NULL,
      number_of_buildings INT NULL,
      number_of_floors INT NULL,
      number_of_rooms INT NULL,
      estimated_residents INT NULL,
      deployment_model {$deploymentModel} NOT NULL DEFAULT 'owner_funded',
      billing_model {$billingModel} NOT NULL DEFAULT 'resident_pays',
      status ENUM('prospect','active','paused','closed') NOT NULL DEFAULT 'prospect',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL,
      created_from_request_id BIGINT UNSIGNED NULL,
      admin_notes TEXT NULL,
      KEY idx_properties_status (status, created_at),
      KEY idx_properties_request (created_from_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_memberships' => "CREATE TABLE IF NOT EXISTS property_memberships (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      property_id BIGINT UNSIGNED NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      role ENUM('owner','manager') NOT NULL DEFAULT 'owner',
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_property_memberships_property_owner_role (property_id, owner_id, role),
      KEY idx_property_memberships_owner (owner_id, status),
      KEY idx_property_memberships_property (property_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_location_links' => "CREATE TABLE IF NOT EXISTS property_location_links (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      property_id BIGINT UNSIGNED NOT NULL,
      location_id INT NOT NULL,
      status ENUM('active','retired','void') NOT NULL DEFAULT 'active',
      effective_from DATETIME NOT NULL,
      effective_to DATETIME NULL,
      deactivated_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(120) NULL,
      KEY idx_property_location_links_location_window (location_id, status, effective_from, effective_to),
      KEY idx_property_location_links_property_window (property_id, status, effective_from, effective_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_financial_terms' => "CREATE TABLE IF NOT EXISTS property_financial_terms (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      property_id BIGINT UNSIGNED NOT NULL,
      deployment_model {$deploymentModel} NOT NULL,
      billing_model {$billingModel} NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'GHS',
      setup_fee_cents INT NOT NULL DEFAULT 0,
      recurring_fee_cents INT NOT NULL DEFAULT 0,
      recurring_fee_period ENUM('none','monthly','term','annual') NOT NULL DEFAULT 'none',
      owner_share_bps INT NOT NULL,
      effective_from DATETIME NOT NULL,
      effective_to DATETIME NULL,
      status ENUM('active','retired','void') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(120) NULL,
      notes TEXT NULL,
      KEY idx_property_financial_terms_property_window (property_id, status, effective_from, effective_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_transaction_allocations' => "CREATE TABLE IF NOT EXISTS property_transaction_allocations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      property_id BIGINT UNSIGNED NOT NULL,
      location_id INT NOT NULL,
      purchase_id BIGINT UNSIGNED NOT NULL,
      msisdn_hash CHAR(64) NOT NULL,
      msisdn_masked VARCHAR(24) NULL,
      plan_code VARCHAR(64) NOT NULL,
      gross_cents INT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'GHS',
      owner_share_bps INT NOT NULL,
      owner_amount_cents INT NOT NULL,
      nister_amount_cents INT NOT NULL,
      purchased_at DATETIME NOT NULL,
      allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      financial_terms_id BIGINT UNSIGNED NOT NULL,
      status ENUM('allocated','void') NOT NULL DEFAULT 'allocated',
      metadata_json JSON NULL,
      UNIQUE KEY uq_property_transaction_allocations_purchase (purchase_id),
      KEY idx_property_transaction_allocations_property_time (property_id, purchased_at),
      KEY idx_property_transaction_allocations_location_time (location_id, purchased_at),
      KEY idx_property_transaction_allocations_status (status, allocated_at),
      KEY idx_property_transaction_allocations_terms (financial_terms_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    'property_allocation_attempts' => "CREATE TABLE IF NOT EXISTS property_allocation_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      purchase_id BIGINT UNSIGNED NOT NULL,
      location_id INT NULL,
      property_id BIGINT UNSIGNED NULL,
      status ENUM('failed','skipped','resolved') NOT NULL DEFAULT 'failed',
      reason VARCHAR(64) NOT NULL,
      detail TEXT NULL,
      attempt_count INT NOT NULL DEFAULT 1,
      first_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      resolved_allocation_id BIGINT UNSIGNED NULL,
      UNIQUE KEY uq_property_allocation_attempts_purchase (purchase_id),
      KEY idx_property_allocation_attempts_status (status, last_attempt_at),
      KEY idx_property_allocation_attempts_location (location_id),
      KEY idx_property_allocation_attempts_property (property_id),
      KEY idx_property_allocation_attempts_resolved_allocation (resolved_allocation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  ];
}

function owner_schema_columns(): array {
  $ownerStatus = OWNER_SCHEMA_OWNER_STATUS_ENUM;
  $ownerActions = OWNER_SCHEMA_OWNER_STATUS_ACTION_ENUM;
  $deploymentPreference = OWNER_SCHEMA_DEPLOYMENT_PREFERENCE_ENUM;
  $deploymentModel = OWNER_SCHEMA_DEPLOYMENT_MODEL_ENUM;
  $billingModel = OWNER_SCHEMA_BILLING_MODEL_ENUM;
  $requestStatus = OWNER_SCHEMA_SERVICE_REQUEST_STATUS_ENUM;

  return [
    'property_owners' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'msisdn' => "`msisdn` VARCHAR(16) NOT NULL AFTER `id`",
      'display_name' => "`display_name` VARCHAR(120) NOT NULL AFTER `msisdn`",
      'password_hash' => "`password_hash` VARCHAR(255) NOT NULL AFTER `display_name`",
      'status' => "`status` {$ownerStatus} NOT NULL DEFAULT 'pending' AFTER `password_hash`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`",
      'updated_at' => "`updated_at` DATETIME NULL AFTER `created_at`",
      'approved_at' => "`approved_at` DATETIME NULL AFTER `updated_at`",
      'approved_by' => "`approved_by` VARCHAR(120) NULL AFTER `approved_at`",
      'suspended_at' => "`suspended_at` DATETIME NULL AFTER `approved_by`",
      'suspended_by' => "`suspended_by` VARCHAR(120) NULL AFTER `suspended_at`",
      'suspended_reason' => "`suspended_reason` TEXT NULL AFTER `suspended_by`",
      'admin_notes' => "`admin_notes` TEXT NULL AFTER `suspended_reason`",
    ],
    'property_owner_status_events' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'owner_id' => "`owner_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'action' => "`action` {$ownerActions} NOT NULL AFTER `owner_id`",
      'previous_status' => "`previous_status` {$ownerStatus} NOT NULL AFTER `action`",
      'new_status' => "`new_status` {$ownerStatus} NOT NULL AFTER `previous_status`",
      'note' => "`note` TEXT NULL AFTER `new_status`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `note`",
      'created_by' => "`created_by` VARCHAR(120) NOT NULL AFTER `created_at`",
      'request_ip' => "`request_ip` VARCHAR(64) NULL AFTER `created_by`",
    ],
    'owner_otp_challenges' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'msisdn' => "`msisdn` VARCHAR(16) NOT NULL AFTER `id`",
      'otp_hash' => "`otp_hash` VARCHAR(255) NOT NULL AFTER `msisdn`",
      'purpose' => "`purpose` ENUM('register_request') NOT NULL DEFAULT 'register_request' AFTER `otp_hash`",
      'expires_at' => "`expires_at` DATETIME NOT NULL AFTER `purpose`",
      'verified_at' => "`verified_at` DATETIME NULL AFTER `expires_at`",
      'attempts' => "`attempts` INT NOT NULL DEFAULT 0 AFTER `verified_at`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `attempts`",
      'ip' => "`ip` VARCHAR(64) NULL AFTER `created_at`",
      'user_agent' => "`user_agent` VARCHAR(255) NULL AFTER `ip`",
    ],
    'property_leads' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'public_ref' => "`public_ref` VARCHAR(32) NOT NULL AFTER `id`",
      'contact_name' => "`contact_name` VARCHAR(120) NOT NULL AFTER `public_ref`",
      'contact_phone' => "`contact_phone` VARCHAR(16) NOT NULL AFTER `contact_name`",
      'contact_whatsapp' => "`contact_whatsapp` VARCHAR(16) NULL AFTER `contact_phone`",
      'contact_email' => "`contact_email` VARCHAR(160) NULL AFTER `contact_whatsapp`",
      'property_name' => "`property_name` VARCHAR(160) NOT NULL AFTER `contact_email`",
      'country' => "`country` VARCHAR(80) NOT NULL AFTER `property_name`",
      'region' => "`region` VARCHAR(120) NOT NULL AFTER `country`",
      'town' => "`town` VARCHAR(120) NOT NULL AFTER `region`",
      'address' => "`address` TEXT NULL AFTER `town`",
      'digital_address' => "`digital_address` VARCHAR(80) NULL AFTER `address`",
      'google_maps_url' => "`google_maps_url` VARCHAR(500) NULL AFTER `digital_address`",
      'nearby_campus' => "`nearby_campus` VARCHAR(160) NULL AFTER `google_maps_url`",
      'number_of_buildings' => "`number_of_buildings` INT NULL AFTER `nearby_campus`",
      'number_of_floors' => "`number_of_floors` INT NULL AFTER `number_of_buildings`",
      'number_of_rooms' => "`number_of_rooms` INT NULL AFTER `number_of_floors`",
      'estimated_residents' => "`estimated_residents` INT NULL AFTER `number_of_rooms`",
      'current_occupancy' => "`current_occupancy` INT NULL AFTER `estimated_residents`",
      'has_wifi' => "`has_wifi` TINYINT(1) NOT NULL DEFAULT 0 AFTER `current_occupancy`",
      'current_provider' => "`current_provider` VARCHAR(160) NULL AFTER `has_wifi`",
      'connection_type' => "`connection_type` VARCHAR(120) NULL AFTER `current_provider`",
      'current_monthly_cost_cents' => "`current_monthly_cost_cents` INT NULL AFTER `connection_type`",
      'current_monthly_cost_currency' => "`current_monthly_cost_currency` CHAR(3) NOT NULL DEFAULT 'GHS' AFTER `current_monthly_cost_cents`",
      'current_speed' => "`current_speed` VARCHAR(120) NULL AFTER `current_monthly_cost_currency`",
      'poor_coverage' => "`poor_coverage` TINYINT(1) NOT NULL DEFAULT 0 AFTER `current_speed`",
      'slow_internet' => "`slow_internet` TINYINT(1) NOT NULL DEFAULT 0 AFTER `poor_coverage`",
      'downtime' => "`downtime` TINYINT(1) NOT NULL DEFAULT 0 AFTER `slow_internet`",
      'payment_problem' => "`payment_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `downtime`",
      'user_management_problem' => "`user_management_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `payment_problem`",
      'shared_password_problem' => "`shared_password_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `user_management_problem`",
      'starting_from_scratch' => "`starting_from_scratch` TINYINT(1) NOT NULL DEFAULT 0 AFTER `shared_password_problem`",
      'deployment_preference' => "`deployment_preference` {$deploymentPreference} NOT NULL DEFAULT 'recommend_for_me' AFTER `starting_from_scratch`",
      'status' => "`status` ENUM('new','otp_pending','verified','converted','closed','spam') NOT NULL DEFAULT 'new' AFTER `deployment_preference`",
      'source' => "`source` VARCHAR(80) NOT NULL DEFAULT 'request-installation' AFTER `status`",
      'utm_source' => "`utm_source` VARCHAR(120) NULL AFTER `source`",
      'utm_medium' => "`utm_medium` VARCHAR(120) NULL AFTER `utm_source`",
      'utm_campaign' => "`utm_campaign` VARCHAR(120) NULL AFTER `utm_medium`",
      'referrer' => "`referrer` VARCHAR(500) NULL AFTER `utm_campaign`",
      'ip' => "`ip` VARCHAR(64) NULL AFTER `referrer`",
      'user_agent' => "`user_agent` VARCHAR(255) NULL AFTER `ip`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `user_agent`",
      'updated_at' => "`updated_at` DATETIME NULL AFTER `created_at`",
      'verified_at' => "`verified_at` DATETIME NULL AFTER `updated_at`",
      'converted_at' => "`converted_at` DATETIME NULL AFTER `verified_at`",
      'converted_owner_id' => "`converted_owner_id` BIGINT UNSIGNED NULL AFTER `converted_at`",
      'converted_service_request_id' => "`converted_service_request_id` BIGINT UNSIGNED NULL AFTER `converted_owner_id`",
      'admin_notes' => "`admin_notes` TEXT NULL AFTER `converted_service_request_id`",
    ],
    'property_service_requests' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'owner_id' => "`owner_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'lead_id' => "`lead_id` BIGINT UNSIGNED NULL AFTER `owner_id`",
      'property_name' => "`property_name` VARCHAR(160) NOT NULL AFTER `lead_id`",
      'country' => "`country` VARCHAR(80) NOT NULL AFTER `property_name`",
      'region' => "`region` VARCHAR(120) NOT NULL AFTER `country`",
      'town' => "`town` VARCHAR(120) NOT NULL AFTER `region`",
      'address' => "`address` TEXT NULL AFTER `town`",
      'digital_address' => "`digital_address` VARCHAR(80) NULL AFTER `address`",
      'google_maps_url' => "`google_maps_url` VARCHAR(500) NULL AFTER `digital_address`",
      'nearby_campus' => "`nearby_campus` VARCHAR(160) NULL AFTER `google_maps_url`",
      'contact_name' => "`contact_name` VARCHAR(120) NULL AFTER `nearby_campus`",
      'contact_phone' => "`contact_phone` VARCHAR(16) NULL AFTER `contact_name`",
      'contact_whatsapp' => "`contact_whatsapp` VARCHAR(16) NULL AFTER `contact_phone`",
      'contact_email' => "`contact_email` VARCHAR(160) NULL AFTER `contact_whatsapp`",
      'number_of_buildings' => "`number_of_buildings` INT NULL AFTER `contact_email`",
      'number_of_floors' => "`number_of_floors` INT NULL AFTER `number_of_buildings`",
      'number_of_rooms' => "`number_of_rooms` INT NULL AFTER `number_of_floors`",
      'estimated_residents' => "`estimated_residents` INT NULL AFTER `number_of_rooms`",
      'current_occupancy' => "`current_occupancy` INT NULL AFTER `estimated_residents`",
      'has_wifi' => "`has_wifi` TINYINT(1) NOT NULL DEFAULT 0 AFTER `current_occupancy`",
      'current_provider' => "`current_provider` VARCHAR(160) NULL AFTER `has_wifi`",
      'connection_type' => "`connection_type` VARCHAR(120) NULL AFTER `current_provider`",
      'current_monthly_cost_cents' => "`current_monthly_cost_cents` INT NULL AFTER `connection_type`",
      'current_monthly_cost_currency' => "`current_monthly_cost_currency` CHAR(3) NOT NULL DEFAULT 'GHS' AFTER `current_monthly_cost_cents`",
      'current_speed' => "`current_speed` VARCHAR(120) NULL AFTER `current_monthly_cost_currency`",
      'poor_coverage' => "`poor_coverage` TINYINT(1) NOT NULL DEFAULT 0 AFTER `current_speed`",
      'slow_internet' => "`slow_internet` TINYINT(1) NOT NULL DEFAULT 0 AFTER `poor_coverage`",
      'downtime' => "`downtime` TINYINT(1) NOT NULL DEFAULT 0 AFTER `slow_internet`",
      'payment_problem' => "`payment_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `downtime`",
      'user_management_problem' => "`user_management_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `payment_problem`",
      'shared_password_problem' => "`shared_password_problem` TINYINT(1) NOT NULL DEFAULT 0 AFTER `user_management_problem`",
      'starting_from_scratch' => "`starting_from_scratch` TINYINT(1) NOT NULL DEFAULT 0 AFTER `shared_password_problem`",
      'deployment_preference' => "`deployment_preference` {$deploymentPreference} NOT NULL DEFAULT 'recommend_for_me' AFTER `starting_from_scratch`",
      'deployment_model' => "`deployment_model` {$deploymentModel} NULL AFTER `deployment_preference`",
      'billing_model' => "`billing_model` {$billingModel} NULL AFTER `deployment_model`",
      'notes' => "`notes` TEXT NULL AFTER `billing_model`",
      'status' => "`status` {$requestStatus} NOT NULL DEFAULT 'submitted' AFTER `notes`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`",
      'updated_at' => "`updated_at` DATETIME NULL AFTER `created_at`",
      'reviewed_at' => "`reviewed_at` DATETIME NULL AFTER `updated_at`",
      'reviewed_by' => "`reviewed_by` VARCHAR(120) NULL AFTER `reviewed_at`",
      'converted_at' => "`converted_at` DATETIME NULL AFTER `reviewed_by`",
      'converted_by' => "`converted_by` VARCHAR(120) NULL AFTER `converted_at`",
      'converted_property_id' => "`converted_property_id` BIGINT UNSIGNED NULL AFTER `converted_by`",
      'admin_notes' => "`admin_notes` TEXT NULL AFTER `converted_property_id`",
    ],
    'property_service_request_events' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'service_request_id' => "`service_request_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'action' => "`action` ENUM('advance','reject','lose','convert_property','admin_note') NOT NULL AFTER `service_request_id`",
      'previous_status' => "`previous_status` {$requestStatus} NOT NULL AFTER `action`",
      'new_status' => "`new_status` {$requestStatus} NOT NULL AFTER `previous_status`",
      'note' => "`note` TEXT NULL AFTER `new_status`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `note`",
      'created_by' => "`created_by` VARCHAR(120) NOT NULL AFTER `created_at`",
      'request_ip' => "`request_ip` VARCHAR(64) NULL AFTER `created_by`",
    ],
    'properties' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'name' => "`name` VARCHAR(160) NOT NULL AFTER `id`",
      'country' => "`country` VARCHAR(80) NULL AFTER `name`",
      'region' => "`region` VARCHAR(120) NULL AFTER `country`",
      'town' => "`town` VARCHAR(120) NULL AFTER `region`",
      'address' => "`address` TEXT NULL AFTER `town`",
      'digital_address' => "`digital_address` VARCHAR(80) NULL AFTER `address`",
      'google_maps_url' => "`google_maps_url` VARCHAR(500) NULL AFTER `digital_address`",
      'nearby_campus' => "`nearby_campus` VARCHAR(160) NULL AFTER `google_maps_url`",
      'number_of_buildings' => "`number_of_buildings` INT NULL AFTER `nearby_campus`",
      'number_of_floors' => "`number_of_floors` INT NULL AFTER `number_of_buildings`",
      'number_of_rooms' => "`number_of_rooms` INT NULL AFTER `number_of_floors`",
      'estimated_residents' => "`estimated_residents` INT NULL AFTER `number_of_rooms`",
      'deployment_model' => "`deployment_model` {$deploymentModel} NOT NULL DEFAULT 'owner_funded' AFTER `estimated_residents`",
      'billing_model' => "`billing_model` {$billingModel} NOT NULL DEFAULT 'resident_pays' AFTER `deployment_model`",
      'status' => "`status` ENUM('prospect','active','paused','closed') NOT NULL DEFAULT 'prospect' AFTER `billing_model`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`",
      'updated_at' => "`updated_at` DATETIME NULL AFTER `created_at`",
      'created_from_request_id' => "`created_from_request_id` BIGINT UNSIGNED NULL AFTER `updated_at`",
      'admin_notes' => "`admin_notes` TEXT NULL AFTER `created_from_request_id`",
    ],
    'property_memberships' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'property_id' => "`property_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'owner_id' => "`owner_id` BIGINT UNSIGNED NOT NULL AFTER `property_id`",
      'role' => "`role` ENUM('owner','manager') NOT NULL DEFAULT 'owner' AFTER `owner_id`",
      'status' => "`status` ENUM('active','disabled') NOT NULL DEFAULT 'active' AFTER `role`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`",
    ],
    'property_location_links' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'property_id' => "`property_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'location_id' => "`location_id` INT NOT NULL AFTER `property_id`",
      'status' => "`status` ENUM('active','retired','void') NOT NULL DEFAULT 'active' AFTER `location_id`",
      'effective_from' => "`effective_from` DATETIME NOT NULL AFTER `status`",
      'effective_to' => "`effective_to` DATETIME NULL AFTER `effective_from`",
      'deactivated_at' => "`deactivated_at` DATETIME NULL AFTER `effective_to`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `deactivated_at`",
      'created_by' => "`created_by` VARCHAR(120) NULL AFTER `created_at`",
    ],
    'property_financial_terms' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'property_id' => "`property_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'deployment_model' => "`deployment_model` {$deploymentModel} NOT NULL AFTER `property_id`",
      'billing_model' => "`billing_model` {$billingModel} NOT NULL AFTER `deployment_model`",
      'currency' => "`currency` CHAR(3) NOT NULL DEFAULT 'GHS' AFTER `billing_model`",
      'setup_fee_cents' => "`setup_fee_cents` INT NOT NULL DEFAULT 0 AFTER `currency`",
      'recurring_fee_cents' => "`recurring_fee_cents` INT NOT NULL DEFAULT 0 AFTER `setup_fee_cents`",
      'recurring_fee_period' => "`recurring_fee_period` ENUM('none','monthly','term','annual') NOT NULL DEFAULT 'none' AFTER `recurring_fee_cents`",
      'owner_share_bps' => "`owner_share_bps` INT NOT NULL AFTER `recurring_fee_period`",
      'effective_from' => "`effective_from` DATETIME NOT NULL AFTER `owner_share_bps`",
      'effective_to' => "`effective_to` DATETIME NULL AFTER `effective_from`",
      'status' => "`status` ENUM('active','retired','void') NOT NULL DEFAULT 'active' AFTER `effective_to`",
      'created_at' => "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `status`",
      'created_by' => "`created_by` VARCHAR(120) NULL AFTER `created_at`",
      'notes' => "`notes` TEXT NULL AFTER `created_by`",
    ],
    'property_transaction_allocations' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'property_id' => "`property_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'location_id' => "`location_id` INT NOT NULL AFTER `property_id`",
      'purchase_id' => "`purchase_id` BIGINT UNSIGNED NOT NULL AFTER `location_id`",
      'msisdn_hash' => "`msisdn_hash` CHAR(64) NOT NULL AFTER `purchase_id`",
      'msisdn_masked' => "`msisdn_masked` VARCHAR(24) NULL AFTER `msisdn_hash`",
      'plan_code' => "`plan_code` VARCHAR(64) NOT NULL AFTER `msisdn_masked`",
      'gross_cents' => "`gross_cents` INT NOT NULL AFTER `plan_code`",
      'currency' => "`currency` CHAR(3) NOT NULL DEFAULT 'GHS' AFTER `gross_cents`",
      'owner_share_bps' => "`owner_share_bps` INT NOT NULL AFTER `currency`",
      'owner_amount_cents' => "`owner_amount_cents` INT NOT NULL AFTER `owner_share_bps`",
      'nister_amount_cents' => "`nister_amount_cents` INT NOT NULL AFTER `owner_amount_cents`",
      'purchased_at' => "`purchased_at` DATETIME NOT NULL AFTER `nister_amount_cents`",
      'allocated_at' => "`allocated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `purchased_at`",
      'financial_terms_id' => "`financial_terms_id` BIGINT UNSIGNED NOT NULL AFTER `allocated_at`",
      'status' => "`status` ENUM('allocated','void') NOT NULL DEFAULT 'allocated' AFTER `financial_terms_id`",
      'metadata_json' => "`metadata_json` JSON NULL AFTER `status`",
    ],
    'property_allocation_attempts' => [
      'id' => "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST",
      'purchase_id' => "`purchase_id` BIGINT UNSIGNED NOT NULL AFTER `id`",
      'location_id' => "`location_id` INT NULL AFTER `purchase_id`",
      'property_id' => "`property_id` BIGINT UNSIGNED NULL AFTER `location_id`",
      'status' => "`status` ENUM('failed','skipped','resolved') NOT NULL DEFAULT 'failed' AFTER `property_id`",
      'reason' => "`reason` VARCHAR(64) NOT NULL AFTER `status`",
      'detail' => "`detail` TEXT NULL AFTER `reason`",
      'attempt_count' => "`attempt_count` INT NOT NULL DEFAULT 1 AFTER `detail`",
      'first_attempt_at' => "`first_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `attempt_count`",
      'last_attempt_at' => "`last_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `first_attempt_at`",
      'resolved_at' => "`resolved_at` DATETIME NULL AFTER `last_attempt_at`",
      'resolved_allocation_id' => "`resolved_allocation_id` BIGINT UNSIGNED NULL AFTER `resolved_at`",
    ],
  ];
}

function owner_schema_indexes(): array {
  return [
    'property_owners' => [
      'uq_property_owners_msisdn' => 'UNIQUE KEY `uq_property_owners_msisdn` (`msisdn`)',
      'idx_property_owners_status' => 'KEY `idx_property_owners_status` (`status`, `created_at`)',
    ],
    'property_owner_status_events' => [
      'idx_property_owner_status_events_owner' => 'KEY `idx_property_owner_status_events_owner` (`owner_id`, `created_at`)',
      'idx_property_owner_status_events_action' => 'KEY `idx_property_owner_status_events_action` (`action`, `created_at`)',
    ],
    'owner_otp_challenges' => [
      'idx_owner_otp_msisdn_created' => 'KEY `idx_owner_otp_msisdn_created` (`msisdn`, `created_at`)',
      'idx_owner_otp_expires' => 'KEY `idx_owner_otp_expires` (`expires_at`)',
      'idx_owner_otp_ip_created' => 'KEY `idx_owner_otp_ip_created` (`ip`, `created_at`)',
    ],
    'property_leads' => [
      'uq_property_leads_public_ref' => 'UNIQUE KEY `uq_property_leads_public_ref` (`public_ref`)',
      'idx_property_leads_contact_phone' => 'KEY `idx_property_leads_contact_phone` (`contact_phone`, `created_at`)',
      'idx_property_leads_status' => 'KEY `idx_property_leads_status` (`status`, `created_at`)',
      'idx_property_leads_converted_owner' => 'KEY `idx_property_leads_converted_owner` (`converted_owner_id`)',
      'idx_property_leads_converted_request' => 'KEY `idx_property_leads_converted_request` (`converted_service_request_id`)',
    ],
    'property_service_requests' => [
      'idx_property_service_requests_owner' => 'KEY `idx_property_service_requests_owner` (`owner_id`, `status`, `created_at`)',
      'idx_property_service_requests_lead' => 'KEY `idx_property_service_requests_lead` (`lead_id`)',
      'idx_property_service_requests_status' => 'KEY `idx_property_service_requests_status` (`status`, `created_at`)',
      'idx_property_service_requests_converted_property' => 'KEY `idx_property_service_requests_converted_property` (`converted_property_id`)',
    ],
    'property_service_request_events' => [
      'idx_property_service_request_events_request' => 'KEY `idx_property_service_request_events_request` (`service_request_id`, `created_at`)',
      'idx_property_service_request_events_action' => 'KEY `idx_property_service_request_events_action` (`action`, `created_at`)',
    ],
    'properties' => [
      'idx_properties_status' => 'KEY `idx_properties_status` (`status`, `created_at`)',
      'idx_properties_request' => 'KEY `idx_properties_request` (`created_from_request_id`)',
    ],
    'property_memberships' => [
      'uq_property_memberships_property_owner_role' => 'UNIQUE KEY `uq_property_memberships_property_owner_role` (`property_id`, `owner_id`, `role`)',
      'idx_property_memberships_owner' => 'KEY `idx_property_memberships_owner` (`owner_id`, `status`)',
      'idx_property_memberships_property' => 'KEY `idx_property_memberships_property` (`property_id`, `status`)',
    ],
    'property_location_links' => [
      'idx_property_location_links_location_window' => 'KEY `idx_property_location_links_location_window` (`location_id`, `status`, `effective_from`, `effective_to`)',
      'idx_property_location_links_property_window' => 'KEY `idx_property_location_links_property_window` (`property_id`, `status`, `effective_from`, `effective_to`)',
    ],
    'property_financial_terms' => [
      'idx_property_financial_terms_property_window' => 'KEY `idx_property_financial_terms_property_window` (`property_id`, `status`, `effective_from`, `effective_to`)',
    ],
    'property_transaction_allocations' => [
      'uq_property_transaction_allocations_purchase' => 'UNIQUE KEY `uq_property_transaction_allocations_purchase` (`purchase_id`)',
      'idx_property_transaction_allocations_property_time' => 'KEY `idx_property_transaction_allocations_property_time` (`property_id`, `purchased_at`)',
      'idx_property_transaction_allocations_location_time' => 'KEY `idx_property_transaction_allocations_location_time` (`location_id`, `purchased_at`)',
      'idx_property_transaction_allocations_status' => 'KEY `idx_property_transaction_allocations_status` (`status`, `allocated_at`)',
      'idx_property_transaction_allocations_terms' => 'KEY `idx_property_transaction_allocations_terms` (`financial_terms_id`)',
    ],
    'property_allocation_attempts' => [
      'uq_property_allocation_attempts_purchase' => 'UNIQUE KEY `uq_property_allocation_attempts_purchase` (`purchase_id`)',
      'idx_property_allocation_attempts_status' => 'KEY `idx_property_allocation_attempts_status` (`status`, `last_attempt_at`)',
      'idx_property_allocation_attempts_location' => 'KEY `idx_property_allocation_attempts_location` (`location_id`)',
      'idx_property_allocation_attempts_property' => 'KEY `idx_property_allocation_attempts_property` (`property_id`)',
      'idx_property_allocation_attempts_resolved_allocation' => 'KEY `idx_property_allocation_attempts_resolved_allocation` (`resolved_allocation_id`)',
    ],
  ];
}

function owner_schema_call_location_bootstrap(PDO $pdo): void {
  $hadGlobalPdo = array_key_exists('PDO', $GLOBALS);
  $previousPdo = $GLOBALS['PDO'] ?? null;

  try {
    $GLOBALS['PDO'] = $pdo;
    if (!function_exists('location_bootstrap')) {
      require_once __DIR__ . '/location.php';
      $GLOBALS['PDO'] = $pdo;
    }
    location_bootstrap();
  } finally {
    if ($hadGlobalPdo) {
      $GLOBALS['PDO'] = $previousPdo;
    } else {
      unset($GLOBALS['PDO']);
    }
  }
}

function owner_schema_require_purchase_location(PDO $pdo): array {
  if (!owner_schema_table_exists($pdo, 'purchases')) {
    return [
      'ok' => false,
      'error' => 'purchases_table_missing',
      'message' => 'Owner allocation setup requires the purchases table.',
    ];
  }
  if (!owner_schema_column_exists($pdo, 'purchases', 'location_id')) {
    return [
      'ok' => false,
      'error' => 'purchases_location_id_missing',
      'message' => 'Owner allocation setup requires purchases.location_id from location_bootstrap().',
    ];
  }
  return [
    'ok' => true,
    'table' => 'purchases',
    'column' => 'location_id',
  ];
}

function owner_schema_bootstrap(PDO $pdo): void {
  static $ready = [];
  $key = spl_object_hash($pdo);
  if (isset($ready[$key])) return;

  foreach (owner_schema_table_sql() as $sql) {
    $pdo->exec($sql);
  }

  foreach (owner_schema_columns() as $table => $columns) {
    foreach ($columns as $column => $definition) {
      owner_schema_add_column_if_missing($pdo, (string)$table, (string)$column, (string)$definition);
    }
  }

  foreach (owner_schema_indexes() as $table => $indexes) {
    foreach ($indexes as $index => $definition) {
      owner_schema_add_index_if_missing($pdo, (string)$table, (string)$index, (string)$definition);
    }
  }

  owner_schema_call_location_bootstrap($pdo);
  $purchaseLocation = owner_schema_require_purchase_location($pdo);
  if (($purchaseLocation['ok'] ?? false) !== true) {
    throw new RuntimeException((string)($purchaseLocation['message'] ?? 'Owner allocation purchase-location setup is incomplete.'));
  }

  $ready[$key] = true;
}
