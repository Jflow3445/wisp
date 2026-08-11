<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/owner_schema.php';
require_once __DIR__ . '/property_leads.php';
require_once __DIR__ . '/owner_auth.php';

function property_request_statuses(): array {
  return ['pending', 'approved', 'suspended'];
}

function property_service_request_statuses(): array {
  return ['submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost'];
}

function property_request_allowed_transitions(): array {
  return [
    'submitted' => ['contacted', 'rejected', 'lost'],
    'contacted' => ['qualified', 'rejected', 'lost'],
    'qualified' => ['site_survey_required', 'quote_prepared', 'rejected', 'lost'],
    'site_survey_required' => ['site_survey_scheduled', 'rejected', 'lost'],
    'site_survey_scheduled' => ['site_survey_completed', 'rejected', 'lost'],
    'site_survey_completed' => ['quote_prepared', 'rejected', 'lost'],
    'quote_prepared' => ['quote_sent', 'rejected', 'lost'],
    'quote_sent' => ['negotiating', 'approved', 'rejected', 'lost'],
    'negotiating' => ['approved', 'rejected', 'lost'],
    'approved' => ['agreement_signed', 'lost'],
    'agreement_signed' => ['equipment_pending', 'installation_scheduled', 'lost'],
    'equipment_pending' => ['installation_scheduled', 'lost'],
    'installation_scheduled' => ['installing', 'lost'],
    'installing' => ['testing', 'lost'],
    'testing' => ['active', 'lost'],
    'active' => [],
    'rejected' => [],
    'lost' => [],
  ];
}

function property_request_owner_editable_statuses(): array {
  return ['submitted'];
}

function property_owner_profile_update_fields(): array {
  return ['display_name'];
}

function property_request_owner_mutation_fields(): array {
  return [
    'property_name',
    'country',
    'region',
    'town',
    'address',
    'digital_address',
    'google_maps_url',
    'nearby_campus',
    'contact_name',
    'contact_phone',
    'contact_whatsapp',
    'contact_email',
    'number_of_buildings',
    'number_of_floors',
    'number_of_rooms',
    'estimated_residents',
    'current_occupancy',
    'has_wifi',
    'current_provider',
    'connection_type',
    'current_monthly_cost',
    'current_speed',
    'poor_coverage',
    'slow_internet',
    'downtime',
    'payment_problem',
    'user_management_problem',
    'shared_password_problem',
    'starting_from_scratch',
    'deployment_preference',
    'notes',
  ];
}

function property_request_forbidden_owner_fields(): array {
  return [
    'id',
    'owner_id',
    'lead_id',
    'status',
    'deployment_model',
    'billing_model',
    'reviewed_at',
    'reviewed_by',
    'converted_at',
    'converted_by',
    'converted_property_id',
    'property_id',
    'location_id',
    'property_location_link_id',
    'property_financial_terms_id',
    'financial_terms_id',
    'owner_share_bps',
    'allocation_id',
    'purchase_id',
    'gross_cents',
    'owner_amount_cents',
    'nister_amount_cents',
    'admin_notes',
  ];
}

function property_request_control_fields(): array {
  return ['_csrf', 'csrf', 'fn', 'request_id', 'action'];
}

function property_request_reject_forbidden_owner_fields(array $in, array $allowedFields = []): void {
  $allowed = array_fill_keys($allowedFields !== [] ? $allowedFields : property_request_owner_mutation_fields(), true);
  $control = array_fill_keys(property_request_control_fields(), true);
  foreach ($in as $field => $_value) {
    $name = (string)$field;
    if (isset($control[$name])) continue;
    if (isset($allowed[$name])) continue;
    throw new InvalidArgumentException('owner_field_not_allowed: ' . $name);
  }
}

function property_request_insert_columns(): array {
  return [
    'owner_id',
    'lead_id',
    'property_name',
    'country',
    'region',
    'town',
    'address',
    'digital_address',
    'google_maps_url',
    'nearby_campus',
    'contact_name',
    'contact_phone',
    'contact_whatsapp',
    'contact_email',
    'number_of_buildings',
    'number_of_floors',
    'number_of_rooms',
    'estimated_residents',
    'current_occupancy',
    'has_wifi',
    'current_provider',
    'connection_type',
    'current_monthly_cost_cents',
    'current_monthly_cost_currency',
    'current_speed',
    'poor_coverage',
    'slow_internet',
    'downtime',
    'payment_problem',
    'user_management_problem',
    'shared_password_problem',
    'starting_from_scratch',
    'deployment_preference',
    'notes',
    'status',
  ];
}

function property_request_update_columns(): array {
  return [
    'property_name',
    'country',
    'region',
    'town',
    'address',
    'digital_address',
    'google_maps_url',
    'nearby_campus',
    'contact_name',
    'contact_phone',
    'contact_whatsapp',
    'contact_email',
    'number_of_buildings',
    'number_of_floors',
    'number_of_rooms',
    'estimated_residents',
    'current_occupancy',
    'has_wifi',
    'current_provider',
    'connection_type',
    'current_monthly_cost_cents',
    'current_monthly_cost_currency',
    'current_speed',
    'poor_coverage',
    'slow_internet',
    'downtime',
    'payment_problem',
    'user_management_problem',
    'shared_password_problem',
    'starting_from_scratch',
    'deployment_preference',
    'notes',
  ];
}

function property_request_find(PDO $pdo, int $requestId): ?array {
  if ($requestId <= 0) return null;
  $st = $pdo->prepare("SELECT * FROM property_service_requests WHERE id = :id LIMIT 1");
  $st->execute([':id' => $requestId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_request_find_for_owner(PDO $pdo, int $ownerId, int $requestId): ?array {
  if ($ownerId <= 0 || $requestId <= 0) return null;
  $st = $pdo->prepare(
    "SELECT * FROM property_service_requests
     WHERE id = :id AND owner_id = :owner_id
     LIMIT 1"
  );
  $st->execute([':id' => $requestId, ':owner_id' => $ownerId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_request_owner(PDO $pdo, int $ownerId): array {
  $owner = owner_find_by_id($pdo, $ownerId);
  if (!is_array($owner)) {
    throw new RuntimeException('owner_not_found');
  }
  if (!in_array((string)($owner['status'] ?? ''), property_request_statuses(), true)) {
    throw new RuntimeException('owner_status_invalid');
  }
  return $owner;
}

function property_owner_update_profile(PDO $pdo, int $ownerId, array $in): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) {
    throw new InvalidArgumentException('owner_id is required');
  }
  property_request_reject_forbidden_owner_fields($in, property_owner_profile_update_fields());
  $owner = property_request_owner($pdo, $ownerId);
  if ((string)($owner['status'] ?? '') === 'suspended') {
    throw new RuntimeException('owner_suspended');
  }

  $displayName = trim((string)($in['display_name'] ?? ''));
  if ($displayName === '' || strlen($displayName) > 120) {
    throw new InvalidArgumentException('display_name_invalid');
  }

  $st = $pdo->prepare(
    "UPDATE property_owners
     SET display_name = :display_name, updated_at = UTC_TIMESTAMP()
     WHERE id = :id"
  );
  $st->execute([':display_name' => $displayName, ':id' => $ownerId]);
  $updated = owner_find_by_id($pdo, $ownerId);
  if (!is_array($updated)) {
    throw new RuntimeException('owner_update_failed');
  }
  if (session_status() === PHP_SESSION_ACTIVE && (int)($_SESSION['owner_id'] ?? 0) === $ownerId) {
    $_SESSION['owner_display_name'] = (string)($updated['display_name'] ?? '');
  }
  return $updated;
}

function property_request_input_from_row(array $row): array {
  $out = [];
  foreach (property_lead_public_fields() as $field) {
    if ($field === 'current_monthly_cost') {
      $cents = $row['current_monthly_cost_cents'] ?? null;
      $out[$field] = ($cents === null || $cents === '') ? '' : number_format(((int)$cents) / 100, 2, '.', '');
      continue;
    }
    $out[$field] = $row[$field] ?? '';
  }
  $out['notes'] = $row['notes'] ?? '';
  return $out;
}

function property_request_normalize(array $in, array $owner = []): array {
  if (trim((string)($in['contact_name'] ?? '')) === '' && trim((string)($owner['display_name'] ?? '')) !== '') {
    $in['contact_name'] = (string)$owner['display_name'];
  }
  if (trim((string)($in['contact_phone'] ?? '')) === '' && trim((string)($owner['msisdn'] ?? '')) !== '') {
    $in['contact_phone'] = (string)$owner['msisdn'];
  }
  $request = property_lead_normalize($in);
  $request['notes'] = property_lead_trimmed($in['notes'] ?? null);
  $errors = property_lead_validate($request);
  if ($errors !== []) {
    throw new InvalidArgumentException('invalid_property_request: ' . json_encode($errors));
  }
  return $request;
}

function property_request_insert(PDO $pdo, array $data): array {
  $columns = property_request_insert_columns();
  $quoted = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
  $placeholders = implode(', ', array_map(static fn(string $c): string => ':' . $c, $columns));
  $st = $pdo->prepare("INSERT INTO property_service_requests ({$quoted}) VALUES ({$placeholders})");
  $values = [];
  foreach ($columns as $column) {
    $values[':' . $column] = $data[$column] ?? null;
  }
  $st->execute($values);
  $id = (int)$pdo->lastInsertId();
  $row = property_request_find($pdo, $id);
  if (!is_array($row)) {
    throw new RuntimeException('property request insert succeeded but row was not found');
  }
  return $row;
}

function property_request_create_from_lead(PDO $pdo, int $ownerId, int $leadId): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0 || $leadId <= 0) {
    throw new InvalidArgumentException('owner_id and lead_id are required');
  }
  $owner = property_request_owner($pdo, $ownerId);
  $lead = property_lead_find($pdo, $leadId);
  if (!is_array($lead)) {
    throw new RuntimeException('lead_not_found');
  }
  if ((string)($lead['contact_phone'] ?? '') !== (string)($owner['msisdn'] ?? '')) {
    throw new RuntimeException('lead_owner_phone_mismatch');
  }

  $data = [];
  foreach (property_request_insert_columns() as $column) {
    $data[$column] = $lead[$column] ?? null;
  }
  $data['owner_id'] = $ownerId;
  $data['lead_id'] = $leadId;
  $data['notes'] = null;
  $data['status'] = 'submitted';
  return property_request_insert($pdo, $data);
}

function property_request_create_for_owner(PDO $pdo, int $ownerId, array $in): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) {
    throw new InvalidArgumentException('owner_id is required');
  }
  property_request_reject_forbidden_owner_fields($in, property_request_owner_mutation_fields());
  $owner = property_request_owner($pdo, $ownerId);
  if ((string)($owner['status'] ?? '') === 'suspended') {
    throw new RuntimeException('owner_suspended');
  }

  $request = property_request_normalize($in, $owner);
  $data = [];
  foreach (property_request_insert_columns() as $column) {
    $data[$column] = $request[$column] ?? null;
  }
  $data['owner_id'] = $ownerId;
  $data['lead_id'] = null;
  $data['status'] = 'submitted';
  return property_request_insert($pdo, $data);
}

function property_request_update_by_owner(PDO $pdo, int $ownerId, int $requestId, array $in): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0 || $requestId <= 0) {
    throw new InvalidArgumentException('owner_id and request_id are required');
  }
  property_request_reject_forbidden_owner_fields($in, property_request_owner_mutation_fields());
  $owner = property_request_owner($pdo, $ownerId);
  if ((string)($owner['status'] ?? '') === 'suspended') {
    throw new RuntimeException('owner_suspended');
  }
  $existing = property_request_find_for_owner($pdo, $ownerId, $requestId);
  if (!is_array($existing)) {
    throw new RuntimeException('property_request_not_found');
  }
  if (!in_array((string)($existing['status'] ?? ''), property_request_owner_editable_statuses(), true)) {
    throw new RuntimeException('property_request_not_editable');
  }

  $merged = array_merge(property_request_input_from_row($existing), $in);
  $request = property_request_normalize($merged, $owner);
  $sets = [];
  $values = [
    ':id' => $requestId,
    ':owner_id' => $ownerId,
  ];
  foreach (property_request_update_columns() as $column) {
    $sets[] = "`{$column}` = :{$column}";
    $values[':' . $column] = $request[$column] ?? null;
  }
  $sets[] = 'updated_at = UTC_TIMESTAMP()';
  $sql = 'UPDATE property_service_requests SET ' . implode(', ', $sets) . ' WHERE id = :id AND owner_id = :owner_id';
  $st = $pdo->prepare($sql);
  $st->execute($values);
  $row = property_request_find_for_owner($pdo, $ownerId, $requestId);
  if (!is_array($row)) {
    throw new RuntimeException('property request update succeeded but row was not found');
  }
  return $row;
}

function property_request_list_for_owner(PDO $pdo, int $ownerId): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) return [];
  $st = $pdo->prepare(
    "SELECT *
     FROM property_service_requests
     WHERE owner_id = :owner_id
     ORDER BY created_at DESC, id DESC"
  );
  $st->execute([':owner_id' => $ownerId]);
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_owner_password_acceptable(string $password): bool {
  return strlen($password) >= 8;
}

function property_owner_verify_existing_password(array $owner, ?string $existingPassword, string $password): bool {
  $hash = trim((string)($owner['password_hash'] ?? ''));
  if ($hash === '') return property_owner_password_acceptable($password);
  $candidate = (string)($existingPassword ?? $password);
  if ($candidate === '') return false;
  return password_verify($candidate, $hash);
}

function property_owner_select_for_update(PDO $pdo, string $msisdn): ?array {
  $st = $pdo->prepare("SELECT * FROM property_owners WHERE msisdn = :m LIMIT 1 FOR UPDATE");
  $st->execute([':m' => $msisdn]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_lead_select_for_update(PDO $pdo, int $leadId): ?array {
  $st = $pdo->prepare("SELECT * FROM property_leads WHERE id = :id LIMIT 1 FOR UPDATE");
  $st->execute([':id' => $leadId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_owner_convert_lead_after_otp(PDO $pdo, int $leadId, string $password, ?string $existingPassword = null): array {
  owner_schema_bootstrap($pdo);
  if ($pdo->inTransaction()) {
    throw new RuntimeException('owner lead conversion must own its transaction');
  }

  $ownerForSession = null;
  $request = null;
  $pdo->beginTransaction();
  try {
    $lead = property_lead_select_for_update($pdo, $leadId);
    if (!is_array($lead)) {
      throw new RuntimeException('lead_not_found');
    }
    $msisdn = normalize_msisdn((string)($lead['contact_phone'] ?? ''));
    if ($msisdn === '' || !preg_match('/^233\d{9}$/', $msisdn)) {
      throw new RuntimeException('lead_phone_invalid');
    }

    $owner = property_owner_select_for_update($pdo, $msisdn);
    if (is_array($owner) && (string)($owner['status'] ?? '') === 'suspended') {
      $pdo->commit();
      return [
        'ok' => false,
        'error' => 'owner_suspended',
        'owner_status' => 'suspended',
        'message' => 'This owner account is suspended. Contact Nister support or an administrator before submitting another request.',
      ];
    }

    if (!is_array($owner)) {
      if (!property_owner_password_acceptable($password)) {
        throw new RuntimeException('password_too_short');
      }
      $displayName = trim((string)($lead['contact_name'] ?? ''));
      $hash = password_hash($password, PASSWORD_DEFAULT);
      $st = $pdo->prepare(
        "INSERT INTO property_owners (msisdn, display_name, password_hash, status)
         VALUES (:m, :name, :hash, 'pending')"
      );
      $st->execute([
        ':m' => $msisdn,
        ':name' => $displayName,
        ':hash' => $hash,
      ]);
      $owner = owner_find_by_id($pdo, (int)$pdo->lastInsertId());
      if (!is_array($owner)) {
        throw new RuntimeException('owner_create_failed');
      }
    } else {
      $status = (string)($owner['status'] ?? '');
      if (!in_array($status, ['pending', 'approved'], true)) {
        throw new RuntimeException('owner_status_invalid');
      }
      if (!property_owner_verify_existing_password($owner, $existingPassword, $password)) {
        throw new RuntimeException('owner_password_invalid');
      }
      if (trim((string)($owner['password_hash'] ?? '')) === '') {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $st = $pdo->prepare(
          "UPDATE property_owners
           SET password_hash = :hash, updated_at = UTC_TIMESTAMP()
           WHERE id = :id AND password_hash = ''"
        );
        $st->execute([':hash' => $hash, ':id' => (int)$owner['id']]);
        $owner = owner_find_by_id($pdo, (int)$owner['id']);
        if (!is_array($owner)) {
          throw new RuntimeException('owner_update_failed');
        }
      }
    }

    $convertedRequestId = (int)($lead['converted_service_request_id'] ?? 0);
    $convertedOwnerId = (int)($lead['converted_owner_id'] ?? 0);
    if ($convertedRequestId > 0 && $convertedOwnerId === (int)$owner['id']) {
      $request = property_request_find($pdo, $convertedRequestId);
      if (!is_array($request)) {
        throw new RuntimeException('converted_request_missing');
      }
    } else {
      $request = property_request_create_from_lead($pdo, (int)$owner['id'], $leadId);
      $st = $pdo->prepare(
        "UPDATE property_leads
         SET status = 'converted',
             verified_at = COALESCE(verified_at, UTC_TIMESTAMP()),
             converted_at = UTC_TIMESTAMP(),
             converted_owner_id = :owner_id,
             converted_service_request_id = :request_id,
             updated_at = UTC_TIMESTAMP()
         WHERE id = :lead_id"
      );
      $st->execute([
        ':owner_id' => (int)$owner['id'],
        ':request_id' => (int)$request['id'],
        ':lead_id' => $leadId,
      ]);
    }

    $ownerForSession = $owner;
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }

  owner_start_session_for_owner($ownerForSession);
  return [
    'ok' => true,
    'owner' => $ownerForSession,
    'owner_status' => (string)($ownerForSession['status'] ?? ''),
    'request' => $request,
    'request_id' => (int)($request['id'] ?? 0),
  ];
}
