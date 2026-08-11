<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/owner_schema.php';

function property_revenue_trim($value): ?string {
  $s = trim((string)$value);
  return $s === '' ? null : $s;
}

function property_revenue_int($value, int $min = 0): int {
  if ($value === null || $value === '') return $min;
  $raw = trim((string)$value);
  if (!preg_match('/^-?\d+$/', $raw)) throw new InvalidArgumentException('integer_required');
  $n = (int)$raw;
  if ($n < $min) throw new InvalidArgumentException('integer_below_min');
  return $n;
}

function property_revenue_datetime($value, bool $required = false): ?string {
  $raw = trim((string)$value);
  if ($raw === '') {
    if ($required) return gmdate('Y-m-d H:i:s');
    return null;
  }
  try {
    return (new DateTimeImmutable($raw, new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
  } catch (Throwable $e) {
    throw new InvalidArgumentException('invalid_datetime');
  }
}

function property_revenue_currency($value): string {
  $currency = strtoupper(trim((string)$value));
  if ($currency === '') $currency = 'GHS';
  if (!preg_match('/^[A-Z]{3}$/', $currency)) {
    throw new InvalidArgumentException('invalid_currency');
  }
  return $currency;
}

function property_revenue_property_status(string $status): string {
  if ($status === '') return 'prospect';
  if (!in_array($status, ['prospect', 'active', 'paused', 'closed'], true)) {
    throw new InvalidArgumentException('invalid_property_status');
  }
  return $status;
}

function property_revenue_deployment_model(string $model): string {
  if (!in_array($model, ['owner_funded', 'nister_funded'], true)) {
    throw new InvalidArgumentException('invalid_deployment_model');
  }
  return $model;
}

function property_revenue_billing_model(string $model): string {
  if (!in_array($model, ['resident_pays', 'property_pays'], true)) {
    throw new InvalidArgumentException('invalid_billing_model');
  }
  return $model;
}

function property_save(PDO $pdo, array $in, string $adminUser): array {
  owner_schema_bootstrap($pdo);
  $id = (int)($in['id'] ?? 0);
  $name = trim((string)($in['name'] ?? $in['property_name'] ?? ''));
  if ($name === '') throw new InvalidArgumentException('property_name_required');
  $deploymentModel = property_revenue_deployment_model((string)($in['deployment_model'] ?? 'owner_funded'));
  $billingModel = property_revenue_billing_model((string)($in['billing_model'] ?? 'resident_pays'));
  $status = property_revenue_property_status((string)($in['status'] ?? 'prospect'));
  $row = [
    'name' => $name,
    'country' => property_revenue_trim($in['country'] ?? null),
    'region' => property_revenue_trim($in['region'] ?? null),
    'town' => property_revenue_trim($in['town'] ?? null),
    'address' => property_revenue_trim($in['address'] ?? null),
    'digital_address' => property_revenue_trim($in['digital_address'] ?? null),
    'google_maps_url' => property_revenue_trim($in['google_maps_url'] ?? null),
    'nearby_campus' => property_revenue_trim($in['nearby_campus'] ?? null),
    'number_of_buildings' => ($in['number_of_buildings'] ?? '') === '' ? null : property_revenue_int($in['number_of_buildings']),
    'number_of_floors' => ($in['number_of_floors'] ?? '') === '' ? null : property_revenue_int($in['number_of_floors']),
    'number_of_rooms' => ($in['number_of_rooms'] ?? '') === '' ? null : property_revenue_int($in['number_of_rooms']),
    'estimated_residents' => ($in['estimated_residents'] ?? '') === '' ? null : property_revenue_int($in['estimated_residents']),
    'deployment_model' => $deploymentModel,
    'billing_model' => $billingModel,
    'status' => $status,
    'created_from_request_id' => ($in['created_from_request_id'] ?? '') === '' ? null : property_revenue_int($in['created_from_request_id']),
    'admin_notes' => property_revenue_trim($in['admin_notes'] ?? $in['notes'] ?? null),
  ];

  if ($id > 0) {
    $sets = [];
    $bind = [':id' => $id];
    foreach ($row as $field => $value) {
      $sets[] = "`{$field}` = :{$field}";
      $bind[':' . $field] = $value;
    }
    $sets[] = 'updated_at = UTC_TIMESTAMP()';
    $st = $pdo->prepare('UPDATE properties SET ' . implode(', ', $sets) . ' WHERE id = :id');
    $st->execute($bind);
  } else {
    $columns = array_keys($row);
    $quoted = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
    $placeholders = implode(', ', array_map(static fn(string $c): string => ':' . $c, $columns));
    $st = $pdo->prepare("INSERT INTO properties ({$quoted}) VALUES ({$placeholders})");
    $bind = [];
    foreach ($row as $field => $value) $bind[':' . $field] = $value;
    $st->execute($bind);
    $id = (int)$pdo->lastInsertId();
  }

  $st = $pdo->prepare("SELECT * FROM properties WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  $saved = $st->fetch(PDO::FETCH_ASSOC);
  if (!is_array($saved)) throw new RuntimeException('property_save_failed');
  return $saved;
}

function property_membership_save(PDO $pdo, array $in, string $adminUser): array {
  owner_schema_bootstrap($pdo);
  $propertyId = (int)($in['property_id'] ?? 0);
  $ownerId = (int)($in['owner_id'] ?? 0);
  $role = (string)($in['role'] ?? 'owner');
  $status = (string)($in['status'] ?? 'active');
  if ($propertyId <= 0 || $ownerId <= 0) throw new InvalidArgumentException('property_id_owner_id_required');
  if (!in_array($role, ['owner', 'manager'], true)) throw new InvalidArgumentException('invalid_membership_role');
  if (!in_array($status, ['active', 'disabled'], true)) throw new InvalidArgumentException('invalid_membership_status');

  $st = $pdo->prepare(
    "INSERT INTO property_memberships (property_id, owner_id, role, status)
     VALUES (:property_id, :owner_id, :role, :status)
     ON DUPLICATE KEY UPDATE status = VALUES(status)"
  );
  $st->execute([
    ':property_id' => $propertyId,
    ':owner_id' => $ownerId,
    ':role' => $role,
    ':status' => $status,
  ]);
  $find = $pdo->prepare(
    "SELECT * FROM property_memberships
     WHERE property_id = :property_id AND owner_id = :owner_id AND role = :role
     LIMIT 1"
  );
  $find->execute([':property_id' => $propertyId, ':owner_id' => $ownerId, ':role' => $role]);
  $row = $find->fetch(PDO::FETCH_ASSOC);
  if (!is_array($row)) throw new RuntimeException('property_membership_save_failed');
  return $row;
}

function property_location_link_save(PDO $pdo, array $in, string $adminUser): array {
  owner_schema_bootstrap($pdo);
  $id = (int)($in['id'] ?? 0);
  $propertyId = (int)($in['property_id'] ?? 0);
  $locationId = (int)($in['location_id'] ?? 0);
  $status = (string)($in['status'] ?? 'active');
  if ($propertyId <= 0 || $locationId <= 0) throw new InvalidArgumentException('property_id_location_id_required');
  if (!in_array($status, ['active', 'retired', 'void'], true)) throw new InvalidArgumentException('invalid_location_link_status');
  $from = property_revenue_datetime($in['effective_from'] ?? '', true);
  $to = property_revenue_datetime($in['effective_to'] ?? '', false);
  if ($to !== null && strcmp($to, (string)$from) <= 0) throw new InvalidArgumentException('invalid_effective_window');
  $closePrior = !empty($in['close_prior']);

  if ($pdo->inTransaction()) throw new RuntimeException('location link save must own its transaction');
  $pdo->beginTransaction();
  try {
    if ($closePrior) {
      $close = $pdo->prepare(
        "UPDATE property_location_links
         SET status = 'retired', effective_to = :effective_to, deactivated_at = UTC_TIMESTAMP()
         WHERE location_id = :location_id
           AND status = 'active'
           AND effective_to IS NULL
           AND (:id = 0 OR id <> :id)"
      );
      $close->execute([':effective_to' => $from, ':location_id' => $locationId, ':id' => $id]);
    }

    if ($status !== 'void') {
      $overlap = $pdo->prepare(
        "SELECT id FROM property_location_links
         WHERE location_id = :location_id
           AND status IN ('active', 'retired')
           AND (:id = 0 OR id <> :id)
           AND effective_from < :new_to
           AND COALESCE(effective_to, '9999-12-31 23:59:59') > :new_from
         LIMIT 1 FOR UPDATE"
      );
      $overlap->execute([
        ':location_id' => $locationId,
        ':id' => $id,
        ':new_to' => $to ?? '9999-12-31 23:59:59',
        ':new_from' => $from,
      ]);
      if ($overlap->fetchColumn()) throw new InvalidArgumentException('property_location_link_overlap');
    }

    if ($id > 0) {
      $st = $pdo->prepare(
        "UPDATE property_location_links
         SET property_id = :property_id,
             location_id = :location_id,
             status = :status,
             effective_from = :effective_from,
             effective_to = :effective_to,
             deactivated_at = CASE WHEN :status_for_deactivation = 'retired' THEN COALESCE(deactivated_at, UTC_TIMESTAMP()) ELSE deactivated_at END
         WHERE id = :id"
      );
      $st->execute([
        ':property_id' => $propertyId,
        ':location_id' => $locationId,
        ':status' => $status,
        ':status_for_deactivation' => $status,
        ':effective_from' => $from,
        ':effective_to' => $to,
        ':id' => $id,
      ]);
    } else {
      $st = $pdo->prepare(
        "INSERT INTO property_location_links
         (property_id, location_id, status, effective_from, effective_to, created_by)
         VALUES (:property_id, :location_id, :status, :effective_from, :effective_to, :created_by)"
      );
      $st->execute([
        ':property_id' => $propertyId,
        ':location_id' => $locationId,
        ':status' => $status,
        ':effective_from' => $from,
        ':effective_to' => $to,
        ':created_by' => $adminUser,
      ]);
      $id = (int)$pdo->lastInsertId();
    }

    $find = $pdo->prepare("SELECT * FROM property_location_links WHERE id = :id LIMIT 1");
    $find->execute([':id' => $id]);
    $row = $find->fetch(PDO::FETCH_ASSOC);
    $pdo->commit();
    if (!is_array($row)) throw new RuntimeException('property_location_link_save_failed');
    return $row;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function property_terms_save(PDO $pdo, array $in, string $adminUser): array {
  owner_schema_bootstrap($pdo);
  $id = (int)($in['id'] ?? 0);
  $propertyId = (int)($in['property_id'] ?? 0);
  if ($propertyId <= 0) throw new InvalidArgumentException('property_id_required');
  $deploymentModel = property_revenue_deployment_model((string)($in['deployment_model'] ?? 'owner_funded'));
  $billingModel = property_revenue_billing_model((string)($in['billing_model'] ?? 'resident_pays'));
  $currency = property_revenue_currency($in['currency'] ?? 'GHS');
  $setupFee = property_revenue_int($in['setup_fee_cents'] ?? 0);
  $recurringFee = property_revenue_int($in['recurring_fee_cents'] ?? 0);
  $recurringPeriod = (string)($in['recurring_fee_period'] ?? 'none');
  if (!in_array($recurringPeriod, ['none', 'monthly', 'term', 'annual'], true)) {
    throw new InvalidArgumentException('invalid_recurring_fee_period');
  }
  if ($recurringPeriod === 'none' && $recurringFee !== 0) {
    throw new InvalidArgumentException("recurring_fee_period='none' requires recurring_fee_cents=0");
  }
  $shareBps = property_revenue_int($in['owner_share_bps'] ?? 0);
  if ($shareBps < 0 || $shareBps > 10000) throw new InvalidArgumentException('owner_share_bps_out_of_range');
  $status = (string)($in['status'] ?? 'active');
  if (!in_array($status, ['active', 'retired', 'void'], true)) throw new InvalidArgumentException('invalid_terms_status');
  $from = property_revenue_datetime($in['effective_from'] ?? '', true);
  $to = property_revenue_datetime($in['effective_to'] ?? '', false);
  if ($to !== null && strcmp($to, (string)$from) <= 0) throw new InvalidArgumentException('invalid_effective_window');

  if ($pdo->inTransaction()) throw new RuntimeException('terms save must own its transaction');
  $pdo->beginTransaction();
  try {
    if ($status !== 'void') {
      $overlap = $pdo->prepare(
        "SELECT id FROM property_financial_terms
         WHERE property_id = :property_id
           AND status IN ('active', 'retired')
           AND (:id = 0 OR id <> :id)
           AND effective_from < :new_to
           AND COALESCE(effective_to, '9999-12-31 23:59:59') > :new_from
         LIMIT 1 FOR UPDATE"
      );
      $overlap->execute([
        ':property_id' => $propertyId,
        ':id' => $id,
        ':new_to' => $to ?? '9999-12-31 23:59:59',
        ':new_from' => $from,
      ]);
      if ($overlap->fetchColumn()) throw new InvalidArgumentException('property_terms_overlap');
    }

    $row = [
      'property_id' => $propertyId,
      'deployment_model' => $deploymentModel,
      'billing_model' => $billingModel,
      'currency' => $currency,
      'setup_fee_cents' => $setupFee,
      'recurring_fee_cents' => $recurringFee,
      'recurring_fee_period' => $recurringPeriod,
      'owner_share_bps' => $shareBps,
      'effective_from' => $from,
      'effective_to' => $to,
      'status' => $status,
      'created_by' => $adminUser,
      'notes' => property_revenue_trim($in['notes'] ?? null),
    ];
    if ($id > 0) {
      $sets = [];
      $bind = [':id' => $id];
      foreach ($row as $field => $value) {
        if ($field === 'created_by') continue;
        $sets[] = "`{$field}` = :{$field}";
        $bind[':' . $field] = $value;
      }
      $st = $pdo->prepare('UPDATE property_financial_terms SET ' . implode(', ', $sets) . ' WHERE id = :id');
      $st->execute($bind);
    } else {
      $columns = array_keys($row);
      $quoted = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
      $placeholders = implode(', ', array_map(static fn(string $c): string => ':' . $c, $columns));
      $st = $pdo->prepare("INSERT INTO property_financial_terms ({$quoted}) VALUES ({$placeholders})");
      $bind = [];
      foreach ($row as $field => $value) $bind[':' . $field] = $value;
      $st->execute($bind);
      $id = (int)$pdo->lastInsertId();
    }

    $find = $pdo->prepare("SELECT * FROM property_financial_terms WHERE id = :id LIMIT 1");
    $find->execute([':id' => $id]);
    $saved = $find->fetch(PDO::FETCH_ASSOC);
    $pdo->commit();
    if (!is_array($saved)) throw new RuntimeException('property_terms_save_failed');
    return $saved;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function property_list_for_admin(PDO $pdo): array {
  owner_schema_bootstrap($pdo);
  $st = $pdo->query(
    "SELECT p.*,
            COALESCE(m.owner_count, 0) AS owner_count,
            COALESCE(l.location_count, 0) AS location_count,
            COALESCE(t.active_terms_count, 0) AS active_terms_count
     FROM properties p
     LEFT JOIN (
       SELECT property_id, COUNT(*) AS owner_count
       FROM property_memberships
       WHERE status = 'active'
       GROUP BY property_id
     ) m ON m.property_id = p.id
     LEFT JOIN (
       SELECT property_id, COUNT(*) AS location_count
       FROM property_location_links
       WHERE status = 'active' AND effective_to IS NULL
       GROUP BY property_id
     ) l ON l.property_id = p.id
     LEFT JOIN (
       SELECT property_id, COUNT(*) AS active_terms_count
       FROM property_financial_terms
       WHERE status = 'active' AND effective_to IS NULL
       GROUP BY property_id
     ) t ON t.property_id = p.id
     ORDER BY p.created_at DESC, p.id DESC"
  );
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_allocations_admin_list(PDO $pdo, int $limit = 200): array {
  owner_schema_bootstrap($pdo);
  $limit = max(1, min(500, $limit));
  $alloc = $pdo->query(
    "SELECT a.*, p.name AS property_name
     FROM property_transaction_allocations a
     LEFT JOIN properties p ON p.id = a.property_id
     ORDER BY a.purchased_at DESC, a.id DESC
     LIMIT {$limit}"
  )->fetchAll(PDO::FETCH_ASSOC) ?: [];
  $attempts = $pdo->query(
    "SELECT *
     FROM property_allocation_attempts
     ORDER BY last_attempt_at DESC, id DESC
     LIMIT {$limit}"
  )->fetchAll(PDO::FETCH_ASSOC) ?: [];
  return ['allocations' => $alloc, 'attempts' => $attempts];
}
