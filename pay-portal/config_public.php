<?php
declare(strict_types=1);
require_once __DIR__.'/lib/settings.php';
require_once __DIR__.'/lib/common.php';

$ENV = app_boot();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');

$s = settings_get_all();
$get = static function(string $k, $def=null) use ($s, $ENV) {
  if (isset($s[$k]) && $s[$k] !== '') return $s[$k];
  if (isset($ENV[$k]) && $ENV[$k] !== '') return $ENV[$k];
  $v = getenv($k);
  if ($v !== false && $v !== '') return $v;
  return $def;
};

echo json_encode([
  'ok' => true,
  'api_base' => rtrim((string)$get('HOTSPOT_API_BASE','https://api.nister.org'), '/'),
  'pay_base' => rtrim((string)$get('PAY_BASE','https://pay.nister.org'), '/'),
  'whatsapp_support' => (string)$get('WHATSAPP_SUPPORT','233598544768'),
  'topup_network' => (string)$get('TOPUP_NETWORK','MTN Ghana'),
  'topup_name' => (string)$get('TOPUP_NAME','GRASAG-UHAS'),
  'topup_number' => (string)$get('TOPUP_NUMBER','0530488905'),
  'topup_wa_text' => (string)$get('TOPUP_WA_TEXT','Hi, I need assistance with Nister Wifi'),
]);
