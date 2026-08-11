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

function property_allocation_json(array $payload): ?string {
  $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  return $json === false ? null : $json;
}

function property_allocation_purchase_select(PDO $pdo, string $alias = 'p'): string {
  $locationColumn = $alias === 'p' ? 'p.location_id' : "{$alias}.location_id";
  $cols = [
    "{$alias}.id",
    "{$alias}.status",
    owner_schema_column_exists($pdo, 'purchases', 'msisdn') ? "{$alias}.msisdn" : "NULL AS msisdn",
    owner_schema_column_exists($pdo, 'purchases', 'location_id') ? $locationColumn : "NULL AS location_id",
    owner_schema_column_exists($pdo, 'purchases', 'plan_code') ? "{$alias}.plan_code" : "NULL AS plan_code",
    owner_schema_column_exists($pdo, 'purchases', 'price_cents') ? "{$alias}.price_cents" : "NULL AS price_cents",
    owner_schema_column_exists($pdo, 'purchases', 'price') ? "{$alias}.price" : "NULL AS price",
    owner_schema_column_exists($pdo, 'purchases', 'activated_at') ? "{$alias}.activated_at" : "NULL AS activated_at",
    owner_schema_column_exists($pdo, 'purchases', 'created_at') ? "{$alias}.created_at" : "NULL AS created_at",
  ];
  return implode(', ', $cols);
}

function property_allocation_purchase_time(array $purchase): string {
  foreach (['activated_at', 'created_at'] as $field) {
    $raw = trim((string)($purchase[$field] ?? ''));
    if ($raw === '' || $raw === '0000-00-00 00:00:00') continue;
    try {
      return (new DateTimeImmutable($raw, new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
      continue;
    }
  }
  return gmdate('Y-m-d H:i:s');
}

function property_allocation_gross_cents(array $purchase, ?string &$source = null): ?int {
  $source = null;
  if (array_key_exists('price_cents', $purchase) && $purchase['price_cents'] !== null && $purchase['price_cents'] !== '') {
    if (!is_numeric($purchase['price_cents'])) return null;
    $source = 'price_cents';
    return (int)$purchase['price_cents'];
  }
  if (array_key_exists('price', $purchase) && $purchase['price'] !== null && $purchase['price'] !== '') {
    if (!is_numeric($purchase['price'])) return null;
    $source = 'legacy_price';
    return (int)round(((float)$purchase['price']) * 100, 0, PHP_ROUND_HALF_UP);
  }
  return null;
}

function property_allocation_mask_msisdn(string $msisdn): ?string {
  $digits = preg_replace('/\D+/', '', $msisdn);
  if ($digits === '') return null;
  if (preg_match('/^233(\d{9})$/', $digits, $m)) {
    $digits = '0' . $m[1];
  }
  if (strlen($digits) <= 7) {
    return substr($digits, 0, 2) . '***' . substr($digits, -2);
  }
  return substr($digits, 0, 3) . '***' . substr($digits, -4);
}

function property_allocation_record_attempt(PDO $pdo, int $purchaseId, ?int $locationId, ?int $propertyId, string $status, string $reason, string $detail = '', ?int $allocationId = null): void {
  if ($purchaseId <= 0) return;
  if (!in_array($status, ['failed', 'skipped', 'resolved'], true)) {
    throw new InvalidArgumentException('invalid_allocation_attempt_status');
  }
  $resolvedAt = $status === 'resolved' ? gmdate('Y-m-d H:i:s') : null;
  $st = $pdo->prepare(
    "INSERT INTO property_allocation_attempts
       (purchase_id, location_id, property_id, status, reason, detail, resolved_at, resolved_allocation_id)
     VALUES
       (:purchase_id, :location_id, :property_id, :status, :reason, :detail, :resolved_at, :resolved_allocation_id)
     ON DUPLICATE KEY UPDATE
       location_id = VALUES(location_id),
       property_id = VALUES(property_id),
       status = VALUES(status),
       reason = VALUES(reason),
       detail = VALUES(detail),
       attempt_count = attempt_count + 1,
       last_attempt_at = UTC_TIMESTAMP(),
       resolved_at = VALUES(resolved_at),
       resolved_allocation_id = VALUES(resolved_allocation_id)"
  );
  $st->execute([
    ':purchase_id' => $purchaseId,
    ':location_id' => $locationId,
    ':property_id' => $propertyId,
    ':status' => $status,
    ':reason' => $reason,
    ':detail' => $detail !== '' ? $detail : null,
    ':resolved_at' => $resolvedAt,
    ':resolved_allocation_id' => $allocationId,
  ]);
}

function property_allocation_fetch_purchase(PDO $pdo, int $purchaseId, bool $forUpdate = false): ?array {
  $columns = property_allocation_purchase_select($pdo, 'p');
  $sql = "SELECT {$columns} FROM purchases p WHERE p.id = :id LIMIT 1";
  if ($forUpdate) $sql .= ' FOR UPDATE';
  $st = $pdo->prepare($sql);
  $st->execute([':id' => $purchaseId]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_allocation_effective_location_links(PDO $pdo, int $locationId, string $purchasedAt): array {
  $st = $pdo->prepare(
    "SELECT *
     FROM property_location_links
     WHERE location_id = :location_id
       AND status IN ('active','retired')
       AND effective_from <= :purchased_at
       AND (effective_to IS NULL OR effective_to > :purchased_at_to)
     ORDER BY effective_from DESC, id DESC
     FOR UPDATE"
  );
  $st->execute([
    ':location_id' => $locationId,
    ':purchased_at' => $purchasedAt,
    ':purchased_at_to' => $purchasedAt,
  ]);
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_allocation_effective_terms(PDO $pdo, int $propertyId, string $purchasedAt): array {
  $st = $pdo->prepare(
    "SELECT *
     FROM property_financial_terms
     WHERE property_id = :property_id
       AND status IN ('active','retired')
       AND effective_from <= :purchased_at
       AND (effective_to IS NULL OR effective_to > :purchased_at_to)
     ORDER BY effective_from DESC, id DESC
     FOR UPDATE"
  );
  $st->execute([
    ':property_id' => $propertyId,
    ':purchased_at' => $purchasedAt,
    ':purchased_at_to' => $purchasedAt,
  ]);
  return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function property_allocation_allocate_purchase(PDO $pdo, array $purchase): array {
  owner_schema_bootstrap($pdo);
  $purchaseId = (int)($purchase['id'] ?? 0);
  if ($purchaseId <= 0) throw new InvalidArgumentException('purchase_id_required');
  if ($pdo->inTransaction()) throw new RuntimeException('purchase allocation must own its transaction');

  $pdo->beginTransaction();
  try {
    $purchase = property_allocation_fetch_purchase($pdo, $purchaseId, true);
    if (!is_array($purchase)) throw new RuntimeException('purchase_not_found');

    $status = (string)($purchase['status'] ?? '');
    $locationId = (int)($purchase['location_id'] ?? 0);
    if ($status !== 'applied') {
      $void = $pdo->prepare(
        "UPDATE property_transaction_allocations
         SET status = 'void'
         WHERE purchase_id = :purchase_id AND status = 'allocated'"
      );
      $void->execute([':purchase_id' => $purchaseId]);
      property_allocation_record_attempt($pdo, $purchaseId, $locationId > 0 ? $locationId : null, null, 'skipped', 'purchase_not_applied', 'Purchase status is ' . $status);
      $pdo->commit();
      return ['ok' => true, 'status' => 'skipped', 'reason' => 'purchase_not_applied', 'purchase_id' => $purchaseId];
    }

    $existing = $pdo->prepare(
      "SELECT * FROM property_transaction_allocations
       WHERE purchase_id = :purchase_id AND status = 'allocated'
       LIMIT 1 FOR UPDATE"
    );
    $existing->execute([':purchase_id' => $purchaseId]);
    $existingAllocation = $existing->fetch(PDO::FETCH_ASSOC);
    if (is_array($existingAllocation)) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId > 0 ? $locationId : null, (int)($existingAllocation['property_id'] ?? 0), 'skipped', 'existing_allocation', 'Allocated row already exists.', (int)($existingAllocation['id'] ?? 0));
      $pdo->commit();
      return ['ok' => true, 'status' => 'skipped', 'reason' => 'existing_allocation', 'purchase_id' => $purchaseId, 'allocation_id' => (int)$existingAllocation['id']];
    }

    if ($locationId <= 0) {
      property_allocation_record_attempt($pdo, $purchaseId, null, null, 'failed', 'missing_purchase_location', 'Purchase has no stored location_id.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'missing_purchase_location', 'purchase_id' => $purchaseId];
    }

    $grossSource = null;
    $grossCents = property_allocation_gross_cents($purchase, $grossSource);
    if ($grossCents === null) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, null, 'failed', 'missing_purchase_amount', 'No usable price_cents or legacy price column value.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'missing_purchase_amount', 'purchase_id' => $purchaseId];
    }
    if ($grossCents <= 0) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, null, 'skipped', 'zero_gross_amount', 'Applied purchase has zero gross cents.');
      $pdo->commit();
      return ['ok' => true, 'status' => 'skipped', 'reason' => 'zero_gross_amount', 'purchase_id' => $purchaseId];
    }

    $purchasedAt = property_allocation_purchase_time($purchase);
    $links = property_allocation_effective_location_links($pdo, $locationId, $purchasedAt);
    if (count($links) === 0) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, null, 'failed', 'missing_property_link', 'No non-void property/location link matched the purchase time.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'missing_property_link', 'purchase_id' => $purchaseId];
    }
    if (count($links) > 1) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, null, 'failed', 'ambiguous_property_link', 'Multiple non-void property/location links matched the purchase time.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'ambiguous_property_link', 'purchase_id' => $purchaseId];
    }

    $propertyId = (int)($links[0]['property_id'] ?? 0);
    $terms = property_allocation_effective_terms($pdo, $propertyId, $purchasedAt);
    if (count($terms) === 0) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, $propertyId, 'failed', 'missing_financial_terms', 'No non-void financial terms matched the purchase time.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'missing_financial_terms', 'purchase_id' => $purchaseId];
    }
    if (count($terms) > 1) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, $propertyId, 'failed', 'ambiguous_financial_terms', 'Multiple non-void financial terms matched the purchase time.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'ambiguous_financial_terms', 'purchase_id' => $purchaseId];
    }

    $term = $terms[0];
    $ownerShareBps = (int)($term['owner_share_bps'] ?? 0);
    if ($ownerShareBps < 0 || $ownerShareBps > 10000) {
      property_allocation_record_attempt($pdo, $purchaseId, $locationId, $propertyId, 'failed', 'ambiguous_financial_terms', 'Financial terms owner_share_bps is outside 0..10000.');
      $pdo->commit();
      return ['ok' => false, 'status' => 'failed', 'reason' => 'ambiguous_financial_terms', 'purchase_id' => $purchaseId];
    }

    $ownerAmountCents = intdiv($grossCents * $ownerShareBps, 10000);
    $nisterAmountCents = $grossCents - $ownerAmountCents;
    $msisdn = normalize_msisdn((string)($purchase['msisdn'] ?? ''));
    $masked = property_allocation_mask_msisdn($msisdn);
    $hash = hash('sha256', $msisdn);
    $planCode = trim((string)($purchase['plan_code'] ?? ''));
    if ($planCode === '') $planCode = 'unknown';
    $currency = property_revenue_currency($term['currency'] ?? 'GHS');

    $metadata = property_allocation_json([
      'gross_source' => $grossSource,
      'purchase_status' => $status,
      'location_link_id' => (int)($links[0]['id'] ?? 0),
    ]);

    $ins = $pdo->prepare(
      "INSERT INTO property_transaction_allocations
       (property_id, location_id, purchase_id, msisdn_hash, msisdn_masked, plan_code, gross_cents, currency,
        owner_share_bps, owner_amount_cents, nister_amount_cents, purchased_at, financial_terms_id, status, metadata_json)
       VALUES
       (:property_id, :location_id, :purchase_id, :msisdn_hash, :msisdn_masked, :plan_code, :gross_cents, :currency,
        :owner_share_bps, :owner_amount_cents, :nister_amount_cents, :purchased_at, :financial_terms_id, 'allocated', :metadata_json)"
    );
    $ins->execute([
      ':property_id' => $propertyId,
      ':location_id' => $locationId,
      ':purchase_id' => $purchaseId,
      ':msisdn_hash' => $hash,
      ':msisdn_masked' => $masked,
      ':plan_code' => $planCode,
      ':gross_cents' => $grossCents,
      ':currency' => $currency,
      ':owner_share_bps' => $ownerShareBps,
      ':owner_amount_cents' => $ownerAmountCents,
      ':nister_amount_cents' => $nisterAmountCents,
      ':purchased_at' => $purchasedAt,
      ':financial_terms_id' => (int)$term['id'],
      ':metadata_json' => $metadata,
    ]);
    $allocationId = (int)$pdo->lastInsertId();
    property_allocation_record_attempt($pdo, $purchaseId, $locationId, $propertyId, 'resolved', 'allocated', 'Allocated purchase to property reporting.', $allocationId);
    $pdo->commit();
    return [
      'ok' => true,
      'status' => 'allocated',
      'reason' => 'allocated',
      'purchase_id' => $purchaseId,
      'allocation_id' => $allocationId,
      'property_id' => $propertyId,
      'gross_cents' => $grossCents,
      'owner_amount_cents' => $ownerAmountCents,
      'nister_amount_cents' => $nisterAmountCents,
    ];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    try {
      property_allocation_record_attempt($pdo, $purchaseId, null, null, 'failed', 'unexpected_error', $e->getMessage());
    } catch (Throwable $ignored) {
      // The original exception is more useful if attempt recording also fails.
    }
    return ['ok' => false, 'status' => 'failed', 'reason' => 'unexpected_error', 'purchase_id' => $purchaseId, 'detail' => $e->getMessage()];
  }
}

function property_allocation_void_non_applied(PDO $pdo, int $limit): array {
  $limit = max(1, min(1000, $limit));
  $st = $pdo->query(
    "SELECT a.id AS allocation_id, a.purchase_id, a.location_id, a.property_id, p.status AS purchase_status
     FROM property_transaction_allocations a
     JOIN purchases p ON p.id = a.purchase_id
     WHERE a.status = 'allocated' AND p.status <> 'applied'
     ORDER BY a.id ASC
     LIMIT {$limit}"
  );
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  $voided = 0;
  foreach ($rows as $row) {
    $purchaseId = (int)($row['purchase_id'] ?? 0);
    $allocationId = (int)($row['allocation_id'] ?? 0);
    if ($purchaseId <= 0 || $allocationId <= 0) continue;
    $up = $pdo->prepare("UPDATE property_transaction_allocations SET status = 'void' WHERE id = :id AND status = 'allocated'");
    $up->execute([':id' => $allocationId]);
    if ($up->rowCount() > 0) $voided++;
    property_allocation_record_attempt(
      $pdo,
      $purchaseId,
      isset($row['location_id']) ? (int)$row['location_id'] : null,
      isset($row['property_id']) ? (int)$row['property_id'] : null,
      'skipped',
      'purchase_not_applied',
      'Purchase status is now ' . (string)($row['purchase_status'] ?? ''),
      $allocationId
    );
  }
  return ['voided' => $voided, 'rows' => count($rows)];
}

function property_allocation_reconcile(PDO $pdo, int $limit = 100): array {
  $limit = max(1, min(1000, $limit));
  try {
    owner_schema_bootstrap($pdo);
  } catch (Throwable $e) {
    return [
      'ok' => false,
      'error' => 'setup_error',
      'detail' => $e->getMessage(),
      'scanned' => 0,
      'allocated' => 0,
      'failed' => 0,
      'skipped' => 0,
      'voided' => 0,
    ];
  }

  $purchaseLocation = owner_schema_require_purchase_location($pdo);
  if (($purchaseLocation['ok'] ?? false) !== true) {
    return [
      'ok' => false,
      'error' => 'setup_error',
      'detail' => (string)($purchaseLocation['message'] ?? 'purchases.location_id is required.'),
      'scanned' => 0,
      'allocated' => 0,
      'failed' => 0,
      'skipped' => 0,
      'voided' => 0,
    ];
  }

  $summary = [
    'ok' => true,
    'scanned' => 0,
    'allocated' => 0,
    'failed' => 0,
    'skipped' => 0,
    'voided' => 0,
    'results' => [],
  ];

  $voided = property_allocation_void_non_applied($pdo, $limit);
  $summary['voided'] = (int)($voided['voided'] ?? 0);
  if ($summary['voided'] > 0) $summary['skipped'] += $summary['voided'];

  $columns = property_allocation_purchase_select($pdo, 'p');
  $timeExprs = [];
  if (owner_schema_column_exists($pdo, 'purchases', 'activated_at')) $timeExprs[] = 'p.activated_at';
  if (owner_schema_column_exists($pdo, 'purchases', 'created_at')) $timeExprs[] = 'p.created_at';
  $timeExprs[] = 'UTC_TIMESTAMP()';
  $orderTime = 'COALESCE(' . implode(', ', $timeExprs) . ')';

  $sql = "SELECT {$columns}
          FROM purchases p
          LEFT JOIN property_transaction_allocations a
            ON a.purchase_id = p.id AND a.status = 'allocated'
          LEFT JOIN property_allocation_attempts aa
            ON aa.purchase_id = p.id
          WHERE p.status = 'applied'
            AND a.id IS NULL
            AND (aa.id IS NULL OR aa.status = 'failed')
          ORDER BY {$orderTime} ASC, p.id ASC
          LIMIT {$limit}";
  $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
  foreach ($rows as $purchase) {
    $summary['scanned']++;
    $result = property_allocation_allocate_purchase($pdo, $purchase);
    $summary['results'][] = $result;
    $status = (string)($result['status'] ?? '');
    if ($status === 'allocated') {
      $summary['allocated']++;
      continue;
    }
    if ($status === 'failed') {
      $summary['failed']++;
      continue;
    }
    if ($status === 'skipped') {
      $summary['skipped']++;
    }
  }

  return $summary;
}

function property_revenue_summary_for_owner(PDO $pdo, int $ownerId): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) return ['ok' => false, 'error' => 'owner_id_required'];
  $start = gmdate('Y-m-01 00:00:00');
  $end = gmdate('Y-m-01 00:00:00', strtotime('+1 month'));
  $st = $pdo->prepare(
    "SELECT COUNT(DISTINCT p.id) AS property_count,
            COUNT(a.id) AS transaction_count,
            COALESCE(SUM(a.gross_cents), 0) AS gross_cents,
            COALESCE(SUM(a.owner_amount_cents), 0) AS owner_amount_cents,
            COALESCE(SUM(a.nister_amount_cents), 0) AS nister_amount_cents
     FROM (
       SELECT DISTINCT property_id
       FROM property_memberships
       WHERE owner_id = :owner_id AND status = 'active'
     ) m
     JOIN properties p ON p.id = m.property_id
     LEFT JOIN property_transaction_allocations a
       ON a.property_id = p.id
      AND a.status = 'allocated'
      AND a.purchased_at >= :start_at
      AND a.purchased_at < :end_at"
  );
  $st->execute([':owner_id' => $ownerId, ':start_at' => $start, ':end_at' => $end]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];

  $byProperty = $pdo->prepare(
    "SELECT p.id, p.name, p.status,
            COUNT(a.id) AS transaction_count,
            COALESCE(SUM(a.gross_cents), 0) AS gross_cents,
            COALESCE(SUM(a.owner_amount_cents), 0) AS owner_amount_cents,
            COALESCE(SUM(a.nister_amount_cents), 0) AS nister_amount_cents
     FROM (
       SELECT DISTINCT property_id
       FROM property_memberships
       WHERE owner_id = :owner_id AND status = 'active'
     ) m
     JOIN properties p ON p.id = m.property_id
     LEFT JOIN property_transaction_allocations a
       ON a.property_id = p.id
      AND a.status = 'allocated'
      AND a.purchased_at >= :start_at
      AND a.purchased_at < :end_at
     GROUP BY p.id, p.name, p.status
     ORDER BY p.name ASC, p.id ASC"
  );
  $byProperty->execute([':owner_id' => $ownerId, ':start_at' => $start, ':end_at' => $end]);
  return [
    'ok' => true,
    'currency' => 'GHS',
    'period_start' => $start,
    'period_end' => $end,
    'property_count' => (int)($row['property_count'] ?? 0),
    'transaction_count' => (int)($row['transaction_count'] ?? 0),
    'gross_cents' => (int)($row['gross_cents'] ?? 0),
    'owner_amount_cents' => (int)($row['owner_amount_cents'] ?? 0),
    'nister_amount_cents' => (int)($row['nister_amount_cents'] ?? 0),
    'properties' => $byProperty->fetchAll(PDO::FETCH_ASSOC) ?: [],
  ];
}

function property_transactions_for_owner(PDO $pdo, int $ownerId, array $filters = []): array {
  owner_schema_bootstrap($pdo);
  if ($ownerId <= 0) return [];
  $limit = max(1, min(500, (int)($filters['limit'] ?? 100)));
  $where = ["a.status = 'allocated'"];
  $bind = [':owner_id' => $ownerId];
  $propertyId = (int)($filters['property_id'] ?? 0);
  if ($propertyId > 0) {
    $where[] = 'a.property_id = :property_id';
    $bind[':property_id'] = $propertyId;
  }
  $start = trim((string)($filters['period_start'] ?? $filters['from'] ?? ''));
  if ($start !== '') {
    $where[] = 'a.purchased_at >= :start_at';
    $bind[':start_at'] = property_revenue_datetime($start, true);
  }
  $end = trim((string)($filters['period_end'] ?? $filters['to'] ?? ''));
  if ($end !== '') {
    $where[] = 'a.purchased_at < :end_at';
    $bind[':end_at'] = property_revenue_datetime($end, true);
  }
  $sql = "SELECT a.id, a.property_id, p.name AS property_name, a.location_id, a.purchase_id,
                 a.msisdn_masked, a.plan_code, a.gross_cents, a.currency, a.owner_share_bps,
                 a.owner_amount_cents, a.nister_amount_cents, a.purchased_at, a.allocated_at, a.status
          FROM property_transaction_allocations a
          JOIN (
            SELECT DISTINCT property_id
            FROM property_memberships
            WHERE owner_id = :owner_id AND status = 'active'
          ) m ON m.property_id = a.property_id
          JOIN properties p ON p.id = a.property_id
          WHERE " . implode(' AND ', $where) . "
          ORDER BY a.purchased_at DESC, a.id DESC
          LIMIT {$limit}";
  $st = $pdo->prepare($sql);
  $st->execute($bind);
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
