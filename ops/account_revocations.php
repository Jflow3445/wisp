<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once '/var/www/pay/lib/radius.php';
require_once '/var/www/pay/lib/account_access.php';
$pdo = rdb_pdo();
$rows = $pdo->query("SELECT msisdn FROM account_access_revocations
  WHERE pending=1 AND (last_error IS NULL OR last_error<>'router_auth_failed')
    AND (last_attempt_at IS NULL OR last_attempt_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 25 SECOND))
  ORDER BY updated_at,msisdn LIMIT 10")->fetchAll(PDO::FETCH_COLUMN);
$pending = 0;
foreach ($rows as $user) {
  $result = account_access_dispatch($pdo, (string)$user, app_boot());
  if ($result['pending']) $pending++;
}
$remaining = (int)$pdo->query('SELECT COUNT(*) FROM account_access_revocations WHERE pending=1')->fetchColumn();
echo 'attempted='.count($rows).' pending='.$remaining.PHP_EOL;
