<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require_once __DIR__.'/../lib/sms.php';
if (!sms_flag(sms_setting('SMS_ENABLED','1'))) { echo "SMS paused; checks skipped.\n"; exit; }
foreach (sms_gateway_configs(settings_get_all()) as $id=>$g) {
  if (!$g['enabled'] || !$g['configured']) continue;
  $health=sms_health_load($id);
  if ((int)($health['retry_after'] ?? 0)>time() && ($health['config_hash'] ?? '')===$g['config_hash']) continue;
  // Never let a balance endpoint erase an unresolved delivery/sender error.
  if (in_array($health['last_error'] ?? '',['gateway_rejected','delivery_uncertain','recipient_rejected'],true)) continue;
  $result=sms_probe_gateway($id);
  echo $id.': '.($result['ok'] ? 'balance_check_ok' : $result['error']).PHP_EOL;
}
