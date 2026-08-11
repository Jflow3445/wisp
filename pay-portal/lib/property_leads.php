<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/owner_schema.php';

function property_lead_public_fields(): array {
  return [
    'contact_name',
    'contact_phone',
    'contact_whatsapp',
    'contact_email',
    'property_name',
    'country',
    'region',
    'town',
    'address',
    'digital_address',
    'google_maps_url',
    'nearby_campus',
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
  ];
}

function property_lead_deployment_preferences(): array {
  return [
    'owner_funded',
    'request_nister_funding',
    'property_paid_wifi',
    'recommend_for_me',
  ];
}

function property_lead_bool_value($value) {
  if ($value === null) return 0;
  if (is_bool($value)) return $value ? 1 : 0;
  if (is_int($value)) {
    if ($value === 0 || $value === 1) return $value;
    return 'invalid_boolean';
  }
  $raw = strtolower(trim((string)$value));
  if ($raw === '') return 0;
  if (in_array($raw, ['1', 'true', 'yes', 'y', 'on'], true)) return 1;
  if (in_array($raw, ['0', 'false', 'no', 'n', 'off'], true)) return 0;
  return 'invalid_boolean';
}

function property_lead_trimmed($value) {
  $value = trim((string)$value);
  return $value === '' ? null : $value;
}

function property_lead_required_text(array $in, string $field): string {
  return trim((string)($in[$field] ?? ''));
}

function property_lead_integer_bounds(): array {
  return [
    'number_of_buildings' => 200,
    'number_of_floors' => 100,
    'number_of_rooms' => 20000,
    'estimated_residents' => 50000,
    'current_occupancy' => 50000,
  ];
}

function property_lead_digits_fit_php_int(string $digits): bool {
  $digits = ltrim($digits, '0');
  if ($digits === '') return true;
  $max = (string)PHP_INT_MAX;
  if (strlen($digits) !== strlen($max)) return strlen($digits) < strlen($max);
  return strcmp($digits, $max) <= 0;
}

function property_lead_optional_int(array $in, string $field) {
  if (!array_key_exists($field, $in)) return null;
  $raw = trim((string)$in[$field]);
  if ($raw === '') return null;
  if (preg_match('/^\d+$/', $raw) && property_lead_digits_fit_php_int($raw)) return (int)$raw;
  return $raw;
}

function property_lead_cost_cents(array $in) {
  if (!array_key_exists('current_monthly_cost', $in)) return null;
  $raw = str_replace(',', '', trim((string)$in['current_monthly_cost']));
  if ($raw === '') return null;
  if (!is_numeric($raw)) return $raw;
  $amount = (float)$raw;
  return (int)round($amount * 100, 0, PHP_ROUND_HALF_UP);
}

function property_lead_normalize(array $in): array {
  $contactPhoneRaw = trim((string)($in['contact_phone'] ?? ''));
  $whatsappRaw = trim((string)($in['contact_whatsapp'] ?? ''));
  $deploymentPreference = trim((string)($in['deployment_preference'] ?? ''));
  if ($deploymentPreference === '') $deploymentPreference = 'recommend_for_me';

  return [
    'contact_name' => property_lead_required_text($in, 'contact_name'),
    'contact_phone' => $contactPhoneRaw === '' ? '' : normalize_msisdn($contactPhoneRaw),
    'contact_whatsapp' => $whatsappRaw === '' ? null : normalize_msisdn($whatsappRaw),
    'contact_email' => (($email = property_lead_trimmed($in['contact_email'] ?? null)) === null) ? null : strtolower((string)$email),
    'property_name' => property_lead_required_text($in, 'property_name'),
    'country' => property_lead_required_text($in, 'country'),
    'region' => property_lead_required_text($in, 'region'),
    'town' => property_lead_required_text($in, 'town'),
    'address' => property_lead_trimmed($in['address'] ?? null),
    'digital_address' => property_lead_trimmed($in['digital_address'] ?? null),
    'google_maps_url' => property_lead_trimmed($in['google_maps_url'] ?? null),
    'nearby_campus' => property_lead_trimmed($in['nearby_campus'] ?? null),
    'number_of_buildings' => property_lead_optional_int($in, 'number_of_buildings'),
    'number_of_floors' => property_lead_optional_int($in, 'number_of_floors'),
    'number_of_rooms' => property_lead_optional_int($in, 'number_of_rooms'),
    'estimated_residents' => property_lead_optional_int($in, 'estimated_residents'),
    'current_occupancy' => property_lead_optional_int($in, 'current_occupancy'),
    'has_wifi' => property_lead_bool_value($in['has_wifi'] ?? 0),
    'current_provider' => property_lead_trimmed($in['current_provider'] ?? null),
    'connection_type' => property_lead_trimmed($in['connection_type'] ?? null),
    'current_monthly_cost_cents' => property_lead_cost_cents($in),
    'current_monthly_cost_currency' => 'GHS',
    'current_speed' => property_lead_trimmed($in['current_speed'] ?? null),
    'poor_coverage' => property_lead_bool_value($in['poor_coverage'] ?? 0),
    'slow_internet' => property_lead_bool_value($in['slow_internet'] ?? 0),
    'downtime' => property_lead_bool_value($in['downtime'] ?? 0),
    'payment_problem' => property_lead_bool_value($in['payment_problem'] ?? 0),
    'user_management_problem' => property_lead_bool_value($in['user_management_problem'] ?? 0),
    'shared_password_problem' => property_lead_bool_value($in['shared_password_problem'] ?? 0),
    'starting_from_scratch' => property_lead_bool_value($in['starting_from_scratch'] ?? 0),
    'deployment_preference' => $deploymentPreference,
    'source' => property_lead_trimmed($in['source'] ?? null) ?: 'request-installation',
    'utm_source' => property_lead_trimmed($in['utm_source'] ?? null),
    'utm_medium' => property_lead_trimmed($in['utm_medium'] ?? null),
    'utm_campaign' => property_lead_trimmed($in['utm_campaign'] ?? null),
    'referrer' => null,
    'ip' => null,
    'user_agent' => null,
  ];
}

function property_lead_validate(array $lead): array {
  $errors = [];
  foreach (['contact_name', 'contact_phone', 'property_name', 'country', 'region', 'town'] as $field) {
    if (trim((string)($lead[$field] ?? '')) === '') {
      $errors[$field] = 'required';
    }
  }

  $phone = (string)($lead['contact_phone'] ?? '');
  if ($phone !== '' && !preg_match('/^233\d{9}$/', $phone)) {
    $errors['contact_phone'] = 'invalid_ghana_msisdn';
  }
  $whatsapp = $lead['contact_whatsapp'] ?? null;
  if ($whatsapp !== null && !preg_match('/^233\d{9}$/', (string)$whatsapp)) {
    $errors['contact_whatsapp'] = 'invalid_ghana_msisdn';
  }

  $email = $lead['contact_email'] ?? null;
  if ($email !== null && filter_var((string)$email, FILTER_VALIDATE_EMAIL) === false) {
    $errors['contact_email'] = 'invalid_email';
  }

  $url = $lead['google_maps_url'] ?? null;
  if ($url !== null && filter_var((string)$url, FILTER_VALIDATE_URL) === false) {
    $errors['google_maps_url'] = 'invalid_url';
  }

  $limits = [
    'contact_name' => 120,
    'contact_phone' => 16,
    'contact_whatsapp' => 16,
    'contact_email' => 160,
    'property_name' => 160,
    'country' => 80,
    'region' => 120,
    'town' => 120,
    'digital_address' => 80,
    'google_maps_url' => 500,
    'nearby_campus' => 160,
    'current_provider' => 160,
    'connection_type' => 120,
    'current_monthly_cost_currency' => 3,
    'current_speed' => 120,
    'deployment_preference' => 64,
    'source' => 80,
    'utm_source' => 120,
    'utm_medium' => 120,
    'utm_campaign' => 120,
    'referrer' => 500,
    'ip' => 64,
    'user_agent' => 255,
  ];
  foreach ($limits as $field => $limit) {
    $value = $lead[$field] ?? null;
    if ($value !== null && strlen((string)$value) > $limit) {
      $errors[$field] = 'too_long';
    }
  }

  foreach (property_lead_integer_bounds() as $field => $max) {
    $value = $lead[$field] ?? null;
    if ($value === null) continue;
    if (!is_int($value) || $value < 0) {
      $errors[$field] = 'invalid_integer';
    } elseif ($value > $max) {
      $errors[$field] = 'out_of_range';
    }
  }

  $cost = $lead['current_monthly_cost_cents'] ?? null;
  if ($cost !== null && (!is_int($cost) || $cost < 0 || $cost > 2147483647)) {
    $errors['current_monthly_cost'] = 'invalid_nonnegative_amount';
  }

  foreach (['has_wifi', 'poor_coverage', 'slow_internet', 'downtime', 'payment_problem', 'user_management_problem', 'shared_password_problem', 'starting_from_scratch'] as $field) {
    if (!in_array($lead[$field] ?? null, [0, 1], true)) {
      $errors[$field] = 'invalid_boolean';
    }
  }

  if (!in_array((string)($lead['deployment_preference'] ?? ''), property_lead_deployment_preferences(), true)) {
    $errors['deployment_preference'] = 'invalid_deployment_preference';
  }
  if (!preg_match('/^[A-Z]{3}$/', (string)($lead['current_monthly_cost_currency'] ?? ''))) {
    $errors['current_monthly_cost_currency'] = 'invalid_currency';
  }

  return $errors;
}

function property_lead_client_ip(array $server = []): ?string {
  if ($server === []) {
    $ip = nister_client_ip();
    return $ip === '' ? null : $ip;
  }

  $remote = trim((string)($server['REMOTE_ADDR'] ?? ''));
  if (!filter_var($remote, FILTER_VALIDATE_IP)) return null;
  if (!nister_ip_in_cidrs($remote, nister_trusted_proxy_cidrs())) return $remote;

  $xff = (string)($server['HTTP_X_FORWARDED_FOR'] ?? '');
  if ($xff !== '') {
    foreach (explode(',', $xff) as $part) {
      $part = trim((string)$part);
      if (filter_var($part, FILTER_VALIDATE_IP)) return $part;
    }
  }
  $realIp = trim((string)($server['HTTP_X_REAL_IP'] ?? ''));
  if (filter_var($realIp, FILTER_VALIDATE_IP)) return $realIp;
  return $remote;
}

function property_lead_server_value(array $server, array $keys, int $limit): ?string {
  foreach ($keys as $key) {
    $value = trim((string)($server[$key] ?? ''));
    if ($value !== '') return substr($value, 0, $limit);
  }
  return null;
}

function property_lead_generate_public_ref(): string {
  return 'PL' . strtoupper(bin2hex(random_bytes(8)));
}

function property_lead_insert_columns(): array {
  return [
    'public_ref',
    'contact_name',
    'contact_phone',
    'contact_whatsapp',
    'contact_email',
    'property_name',
    'country',
    'region',
    'town',
    'address',
    'digital_address',
    'google_maps_url',
    'nearby_campus',
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
    'source',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'referrer',
    'ip',
    'user_agent',
  ];
}

function property_lead_create(PDO $pdo, array $in, array $server = []): array {
  owner_schema_bootstrap($pdo);

  $lead = property_lead_normalize($in);
  $requestServer = $server === [] ? $_SERVER : $server;
  $lead['referrer'] = property_lead_server_value($requestServer, ['HTTP_REFERER', 'HTTP_REFERRER'], 500);
  $lead['ip'] = property_lead_client_ip($requestServer);
  $lead['user_agent'] = property_lead_server_value($requestServer, ['HTTP_USER_AGENT'], 255);

  $errors = property_lead_validate($lead);
  if ($errors !== []) {
    throw new InvalidArgumentException('invalid_property_lead: ' . json_encode($errors));
  }

  $columns = property_lead_insert_columns();
  $quoted = implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columns));
  $placeholders = implode(', ', array_map(static fn(string $c): string => ':' . $c, $columns));
  $sql = "INSERT INTO property_leads ({$quoted}) VALUES ({$placeholders})";
  $st = $pdo->prepare($sql);

  for ($attempt = 0; $attempt < 5; $attempt++) {
    $lead['public_ref'] = property_lead_generate_public_ref();
    try {
      $values = [];
      foreach ($columns as $column) {
        $values[':' . $column] = $lead[$column] ?? null;
      }
      $st->execute($values);
      $id = (int)$pdo->lastInsertId();
      $row = property_lead_find($pdo, $id);
      if ($row === null) {
        throw new RuntimeException('property lead insert succeeded but row was not found');
      }
      return $row;
    } catch (PDOException $e) {
      if ($attempt < 4 && $e->getCode() === '23000') continue;
      throw $e;
    }
  }

  throw new RuntimeException('property lead public reference collision');
}

function property_lead_find(PDO $pdo, int $id): ?array {
  if ($id <= 0) return null;
  $st = $pdo->prepare("SELECT * FROM property_leads WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return is_array($row) ? $row : null;
}

function property_lead_mark_otp_pending(PDO $pdo, int $leadId): void {
  if ($leadId <= 0) return;
  $st = $pdo->prepare(
    "UPDATE property_leads
     SET status = 'otp_pending', updated_at = UTC_TIMESTAMP()
     WHERE id = :id AND status IN ('new','otp_pending')"
  );
  $st->execute([':id' => $leadId]);
}
