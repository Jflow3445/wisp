<?php
declare(strict_types=1);
// Quota/expiry jobs share the same pause, health and failover policy as OTP and admin sends.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__.'/../lib/sms.php';
$input=json_decode((string)stream_get_contents(STDIN),true);
if (!is_array($input)) exit(2);
$result=sms_send_result((string)($input['to'] ?? ''),(string)($input['message'] ?? ''));
echo json_encode($result,JSON_UNESCAPED_SLASHES).PHP_EOL;
exit($result['sent'] || !$result['attempted'] ? 0 : 1);
