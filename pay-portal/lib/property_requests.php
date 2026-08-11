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

function property_request_admin_note(?string $existing, string $note, string $adminUser): ?string {
  $note = trim($note);
  if ($note === '') return $existing;
  $prefix = '[' . gmdate('Y-m-d H:i:s') . ' UTC ' . $adminUser . '] ';
  $base = trim((string)$existing);
  return $base === '' ? $prefix . $note : $base . "\n" . $prefix . $note;
}

function property_owner_list(PDO $pdo): array {
  owner_schema_bootstrap($pdo);
  $st = $pdo->query(
    "SELECT o.*,
            COALESCE(r.request_count, 0) AS request_count,
            COALESCE(m.property_count, 0) AS property_count
     FROM property_owners o
     LEFT JOIN (
       SELECT owner_id, COUNT(*) AS request_count
       FROM property_service_requests
       GROUP BY owner_id
     ) r ON r.owner_id = o.id
     LEFT JOIN (
       SELECT owner_id, COUNT(DISTINCT property_id) AS property_count
       FROM property_memberships
       WHERE status = 'active'
       GROUP BY owner_id
     ) m ON m.owner_id = o.id
     ORDER BY FIELD(o.status, 'pending', 'approved', 'suspended'), o.created_at DESC, o.id DESC"
  );
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_owner_status_action(string $previous, string $new): string {
  if ($previous === 'pending' && $new === 'approved') return 'approve';
  if ($previous === 'pending' && $new === 'suspended') return 'suspend';
  if ($previous === 'approved' && $new === 'suspended') return 'suspend';
  if ($previous === 'suspended' && $new === 'approved') return 'reactivate';
  throw new InvalidArgumentException('invalid_owner_status_transition');
}

function property_owner_set_status(PDO $pdo, int $ownerId, string $newStatus, string $adminUser, string $note, string $ip = ''): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) throw new InvalidArgumentException('owner_id_required');
  if (!in_array($newStatus, property_request_statuses(), true)) {
    throw new InvalidArgumentException('invalid_owner_status');
  }
  if ($pdo->inTransaction()) {
    throw new RuntimeException('owner status transition must own its transaction');
  }

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT * FROM property_owners WHERE id = :id LIMIT 1 FOR UPDATE");
    $st->execute([':id' => $ownerId]);
    $owner = $st->fetch(PDO::FETCH_ASSOC);
    if (!is_array($owner)) throw new RuntimeException('owner_not_found');
    $previous = (string)($owner['status'] ?? '');
    $action = property_owner_status_action($previous, $newStatus);

    if ($action === 'approve' || $action === 'reactivate') {
      $up = $pdo->prepare(
        "UPDATE property_owners
         SET status = 'approved',
             approved_at = UTC_TIMESTAMP(),
             approved_by = :admin_user,
             suspended_at = NULL,
             suspended_by = NULL,
             suspended_reason = NULL,
             admin_notes = :admin_notes,
             updated_at = UTC_TIMESTAMP()
         WHERE id = :id"
      );
      $adminNotes = property_request_admin_note($owner['admin_notes'] ?? null, $note, $adminUser);
      $up->execute([':admin_user' => $adminUser, ':admin_notes' => $adminNotes, ':id' => $ownerId]);
    } else {
      $up = $pdo->prepare(
        "UPDATE property_owners
         SET status = 'suspended',
             suspended_at = UTC_TIMESTAMP(),
             suspended_by = :admin_user,
             suspended_reason = :reason,
             admin_notes = :admin_notes,
             updated_at = UTC_TIMESTAMP()
         WHERE id = :id"
      );
      $adminNotes = property_request_admin_note($owner['admin_notes'] ?? null, $note, $adminUser);
      $up->execute([':admin_user' => $adminUser, ':reason' => $note, ':admin_notes' => $adminNotes, ':id' => $ownerId]);
    }

    $ev = $pdo->prepare(
      "INSERT INTO property_owner_status_events
       (owner_id, action, previous_status, new_status, note, created_by, request_ip)
       VALUES (:owner_id, :action, :previous_status, :new_status, :note, :created_by, :request_ip)"
    );
    $ev->execute([
      ':owner_id' => $ownerId,
      ':action' => $action,
      ':previous_status' => $previous,
      ':new_status' => $newStatus,
      ':note' => $note !== '' ? $note : null,
      ':created_by' => $adminUser,
      ':request_ip' => $ip !== '' ? $ip : null,
    ]);

    $updated = owner_find_by_id($pdo, $ownerId);
    $pdo->commit();
    return [
      'ok' => true,
      'action' => $action,
      'owner' => is_array($updated) ? $updated : [],
    ];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function property_lead_admin_list(PDO $pdo, array $filters = []): array {
  owner_schema_bootstrap($pdo);
  $where = [];
  $bind = [];
  $status = trim((string)($filters['status'] ?? ''));
  if ($status !== '') {
    $where[] = 'status = :status';
    $bind[':status'] = $status;
  }
  $phone = normalize_msisdn((string)($filters['contact_phone'] ?? $filters['msisdn'] ?? ''));
  if ($phone !== '') {
    $where[] = 'contact_phone = :phone';
    $bind[':phone'] = $phone;
  }
  $sql = 'SELECT * FROM property_leads';
  if ($where !== []) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY created_at DESC, id DESC LIMIT 250';
  $st = $pdo->prepare($sql);
  $st->execute($bind);
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_lead_admin_update(PDO $pdo, int $leadId, array $in, string $adminUser): array {
  owner_schema_bootstrap($pdo);
  if ($leadId <= 0) throw new InvalidArgumentException('lead_id_required');
  $allowedStatuses = ['new', 'otp_pending', 'verified', 'converted', 'closed', 'spam'];
  $status = trim((string)($in['status'] ?? ''));
  $note = trim((string)($in['admin_notes'] ?? $in['note'] ?? ''));
  if ($status !== '' && !in_array($status, $allowedStatuses, true)) {
    throw new InvalidArgumentException('invalid_lead_status');
  }
  $lead = property_lead_find($pdo, $leadId);
  if (!is_array($lead)) throw new RuntimeException('lead_not_found');
  $newStatus = $status !== '' ? $status : (string)($lead['status'] ?? 'new');
  $adminNotes = property_request_admin_note($lead['admin_notes'] ?? null, $note, $adminUser);
  $st = $pdo->prepare(
    "UPDATE property_leads
     SET status = :status,
         admin_notes = :admin_notes,
         updated_at = UTC_TIMESTAMP()
     WHERE id = :id"
  );
  $st->execute([
    ':status' => $newStatus,
    ':admin_notes' => $adminNotes,
    ':id' => $leadId,
  ]);
  $updated = property_lead_find($pdo, $leadId);
  if (!is_array($updated)) throw new RuntimeException('lead_update_failed');
  return $updated;
}

function property_request_admin_list(PDO $pdo, array $filters = []): array {
  owner_schema_bootstrap($pdo);
  $where = [];
  $bind = [];
  $status = trim((string)($filters['status'] ?? ''));
  if ($status !== '') {
    $where[] = 'r.status = :status';
    $bind[':status'] = $status;
  }
  $ownerId = (int)($filters['owner_id'] ?? 0);
  if ($ownerId > 0) {
    $where[] = 'r.owner_id = :owner_id';
    $bind[':owner_id'] = $ownerId;
  }
  $sql = "SELECT r.*, o.display_name AS owner_display_name, o.msisdn AS owner_msisdn, o.status AS owner_status
          FROM property_service_requests r
          JOIN property_owners o ON o.id = r.owner_id";
  if ($where !== []) $sql .= ' WHERE ' . implode(' AND ', $where);
  $sql .= ' ORDER BY r.created_at DESC, r.id DESC LIMIT 250';
  $st = $pdo->prepare($sql);
  $st->execute($bind);
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_request_admin_transition_action(string $newStatus): string {
  if ($newStatus === 'rejected') return 'reject';
  if ($newStatus === 'lost') return 'lose';
  return 'advance';
}

function property_request_admin_transition(PDO $pdo, int $requestId, string $newStatus, string $adminUser, string $note, string $ip = ''): array {
  owner_schema_bootstrap($pdo);
  if ($requestId <= 0) throw new InvalidArgumentException('request_id_required');
  if (!in_array($newStatus, property_service_request_statuses(), true)) {
    throw new InvalidArgumentException('invalid_request_status');
  }
  if ($pdo->inTransaction()) {
    throw new RuntimeException('service request transition must own its transaction');
  }

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT * FROM property_service_requests WHERE id = :id LIMIT 1 FOR UPDATE");
    $st->execute([':id' => $requestId]);
    $request = $st->fetch(PDO::FETCH_ASSOC);
    if (!is_array($request)) throw new RuntimeException('property_request_not_found');
    $previous = (string)($request['status'] ?? 'submitted');
    $allowed = property_request_allowed_transitions();
    if (!in_array($newStatus, $allowed[$previous] ?? [], true)) {
      throw new InvalidArgumentException('invalid_service_request_transition');
    }
    $adminNotes = property_request_admin_note($request['admin_notes'] ?? null, $note, $adminUser);
    $up = $pdo->prepare(
      "UPDATE property_service_requests
       SET status = :status,
           reviewed_at = UTC_TIMESTAMP(),
           reviewed_by = :admin_user,
           admin_notes = :admin_notes,
           updated_at = UTC_TIMESTAMP()
       WHERE id = :id"
    );
    $up->execute([
      ':status' => $newStatus,
      ':admin_user' => $adminUser,
      ':admin_notes' => $adminNotes,
      ':id' => $requestId,
    ]);

    $ev = $pdo->prepare(
      "INSERT INTO property_service_request_events
       (service_request_id, action, previous_status, new_status, note, created_by, request_ip)
       VALUES (:service_request_id, :action, :previous_status, :new_status, :note, :created_by, :request_ip)"
    );
    $ev->execute([
      ':service_request_id' => $requestId,
      ':action' => property_request_admin_transition_action($newStatus),
      ':previous_status' => $previous,
      ':new_status' => $newStatus,
      ':note' => $note !== '' ? $note : null,
      ':created_by' => $adminUser,
      ':request_ip' => $ip !== '' ? $ip : null,
    ]);

    $updated = property_request_find($pdo, $requestId);
    $pdo->commit();
    return [
      'ok' => true,
      'request' => is_array($updated) ? $updated : [],
    ];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function property_request_convertible_statuses(): array {
  return ['approved', 'agreement_signed', 'equipment_pending', 'installation_scheduled', 'installing', 'testing', 'active'];
}

function property_request_convert_to_property(PDO $pdo, int $requestId, array $propertyInput, string $adminUser, string $note = '', string $ip = ''): array {
  owner_schema_bootstrap($pdo);
  if ($requestId <= 0) throw new InvalidArgumentException('request_id_required');
  if ($pdo->inTransaction()) {
    throw new RuntimeException('property conversion must own its transaction');
  }

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT * FROM property_service_requests WHERE id = :id LIMIT 1 FOR UPDATE");
    $st->execute([':id' => $requestId]);
    $request = $st->fetch(PDO::FETCH_ASSOC);
    if (!is_array($request)) throw new RuntimeException('property_request_not_found');
    $status = (string)($request['status'] ?? 'submitted');
    if (!in_array($status, property_request_convertible_statuses(), true)) {
      throw new InvalidArgumentException('service_request_not_convertible');
    }

    $existingPropertyId = (int)($request['converted_property_id'] ?? 0);
    if ($existingPropertyId > 0) {
      $property = null;
      $ps = $pdo->prepare("SELECT * FROM properties WHERE id = :id LIMIT 1");
      $ps->execute([':id' => $existingPropertyId]);
      $row = $ps->fetch(PDO::FETCH_ASSOC);
      $property = is_array($row) ? $row : null;
      $pdo->commit();
      return [
        'ok' => true,
        'property' => $property,
        'property_id' => $existingPropertyId,
        'request' => $request,
        'idempotent' => true,
      ];
    }

    $deploymentModel = (string)($propertyInput['deployment_model'] ?? $request['deployment_model'] ?? 'owner_funded');
    if (!in_array($deploymentModel, ['owner_funded', 'nister_funded'], true)) $deploymentModel = 'owner_funded';
    $billingModel = (string)($propertyInput['billing_model'] ?? $request['billing_model'] ?? 'resident_pays');
    if (!in_array($billingModel, ['resident_pays', 'property_pays'], true)) $billingModel = 'resident_pays';
    $propertyStatus = (string)($propertyInput['status'] ?? 'prospect');
    if (!in_array($propertyStatus, ['prospect', 'active', 'paused', 'closed'], true)) $propertyStatus = 'prospect';

    $property = [
      'name' => trim((string)($propertyInput['name'] ?? $request['property_name'] ?? '')),
      'country' => property_lead_trimmed($propertyInput['country'] ?? $request['country'] ?? null),
      'region' => property_lead_trimmed($propertyInput['region'] ?? $request['region'] ?? null),
      'town' => property_lead_trimmed($propertyInput['town'] ?? $request['town'] ?? null),
      'address' => property_lead_trimmed($propertyInput['address'] ?? $request['address'] ?? null),
      'digital_address' => property_lead_trimmed($propertyInput['digital_address'] ?? $request['digital_address'] ?? null),
      'google_maps_url' => property_lead_trimmed($propertyInput['google_maps_url'] ?? $request['google_maps_url'] ?? null),
      'nearby_campus' => property_lead_trimmed($propertyInput['nearby_campus'] ?? $request['nearby_campus'] ?? null),
      'number_of_buildings' => property_lead_optional_int($propertyInput + $request, 'number_of_buildings'),
      'number_of_floors' => property_lead_optional_int($propertyInput + $request, 'number_of_floors'),
      'number_of_rooms' => property_lead_optional_int($propertyInput + $request, 'number_of_rooms'),
      'estimated_residents' => property_lead_optional_int($propertyInput + $request, 'estimated_residents'),
      'deployment_model' => $deploymentModel,
      'billing_model' => $billingModel,
      'status' => $propertyStatus,
      'created_from_request_id' => $requestId,
      'admin_notes' => property_request_admin_note(null, $note, $adminUser),
    ];
    if ($property['name'] === '') throw new InvalidArgumentException('property_name_required');

    $columns = array_keys($property);
    $quoted = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
    $placeholders = implode(', ', array_map(static fn(string $c): string => ':' . $c, $columns));
    $ins = $pdo->prepare("INSERT INTO properties ({$quoted}) VALUES ({$placeholders})");
    $bind = [];
    foreach ($property as $k => $v) $bind[':' . $k] = $v;
    $ins->execute($bind);
    $propertyId = (int)$pdo->lastInsertId();

    $mem = $pdo->prepare(
      "INSERT INTO property_memberships (property_id, owner_id, role, status)
       VALUES (:property_id, :owner_id, 'owner', 'active')
       ON DUPLICATE KEY UPDATE status = 'active'"
    );
    $mem->execute([':property_id' => $propertyId, ':owner_id' => (int)$request['owner_id']]);

    $adminNotes = property_request_admin_note($request['admin_notes'] ?? null, $note, $adminUser);
    $up = $pdo->prepare(
      "UPDATE property_service_requests
       SET converted_property_id = :property_id,
           converted_at = UTC_TIMESTAMP(),
           converted_by = :admin_user,
           admin_notes = :admin_notes,
           updated_at = UTC_TIMESTAMP()
       WHERE id = :request_id"
    );
    $up->execute([
      ':property_id' => $propertyId,
      ':admin_user' => $adminUser,
      ':admin_notes' => $adminNotes,
      ':request_id' => $requestId,
    ]);

    $eventNote = trim($note . "\ncreated_property_id=" . $propertyId);
    $ev = $pdo->prepare(
      "INSERT INTO property_service_request_events
       (service_request_id, action, previous_status, new_status, note, created_by, request_ip)
       VALUES (:service_request_id, 'convert_property', :previous_status, :new_status, :note, :created_by, :request_ip)"
    );
    $ev->execute([
      ':service_request_id' => $requestId,
      ':previous_status' => $status,
      ':new_status' => $status,
      ':note' => $eventNote,
      ':created_by' => $adminUser,
      ':request_ip' => $ip !== '' ? $ip : null,
    ]);

    $ps = $pdo->prepare("SELECT * FROM properties WHERE id = :id LIMIT 1");
    $ps->execute([':id' => $propertyId]);
    $created = $ps->fetch(PDO::FETCH_ASSOC);
    $updatedRequest = property_request_find($pdo, $requestId);
    $pdo->commit();
    return [
      'ok' => true,
      'property' => is_array($created) ? $created : [],
      'property_id' => $propertyId,
      'request' => is_array($updatedRequest) ? $updatedRequest : [],
      'idempotent' => false,
    ];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
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
