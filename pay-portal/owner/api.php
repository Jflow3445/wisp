<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/owner_auth.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/property_requests.php';

$ENV = owner_boot();
$GLOBALS['ENV'] = $ENV;
owner_noindex_headers();
owner_require_login(true);

function owner_api_require_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') return;
  json_out(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

function owner_api_input(): array {
  $input = $_POST;
  $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
  if (str_contains($contentType, 'application/json')) {
    $json = body_json();
    if ($json !== []) {
      $input = array_merge($input, $json);
    }
  }
  return $input;
}

function owner_api_error(Throwable $e): array {
  $message = $e->getMessage();
  if (str_starts_with($message, 'owner_field_not_allowed:')) {
    return ['status' => 422, 'body' => ['ok' => false, 'error' => 'field_not_allowed']];
  }
  if (str_starts_with($message, 'invalid_property_request:')) {
    return ['status' => 422, 'body' => ['ok' => false, 'error' => 'invalid_property_request']];
  }
  if ($message === 'property_request_not_editable') {
    return ['status' => 409, 'body' => ['ok' => false, 'error' => 'request_not_editable']];
  }
  if ($message === 'property_request_not_found') {
    return ['status' => 404, 'body' => ['ok' => false, 'error' => 'request_not_found']];
  }
  if ($message === 'owner_suspended') {
    return ['status' => 403, 'body' => ['ok' => false, 'error' => 'owner_suspended']];
  }
  if ($message === 'display_name_invalid') {
    return ['status' => 422, 'body' => ['ok' => false, 'error' => 'display_name_invalid']];
  }
  return ['status' => 500, 'body' => ['ok' => false, 'error' => 'owner_api_error']];
}

owner_api_require_post();
owner_require_same_origin_post();
owner_require_csrf_post();

$owner = owner_current();
if (!is_array($owner)) {
  json_out(['ok' => false, 'error' => 'unauthorized'], 401);
}

$ownerId = (int)($owner['id'] ?? 0);
$fn = (string)($_GET['fn'] ?? ($_POST['fn'] ?? ''));
$input = owner_api_input();

try {
  if ($fn === 'profile_update') {
    $updated = property_owner_update_profile($PDO, $ownerId, $input);
    json_out([
      'ok' => true,
      'owner' => owner_session_snapshot($updated),
    ]);
  }

  if ($fn === 'request_create') {
    $request = property_request_create_for_owner($PDO, $ownerId, $input);
    json_out([
      'ok' => true,
      'request' => $request,
    ]);
  }

  if ($fn === 'request_update') {
    $requestId = (int)($input['request_id'] ?? 0);
    $request = property_request_update_by_owner($PDO, $ownerId, $requestId, $input);
    json_out([
      'ok' => true,
      'request' => $request,
    ]);
  }

  json_out(['ok' => false, 'error' => 'unknown_fn'], 404);
} catch (Throwable $e) {
  $err = owner_api_error($e);
  json_out($err['body'], (int)$err['status']);
}
