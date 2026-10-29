<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require_once __DIR__.'/../lib/settings.php';
settings_bootstrap();
try {
  foreach (preg_split('/;\s*(?:\r?\n|$)/',file_get_contents(__DIR__.'/../migrations/005_wallet_withdrawals.sql')) as $sql) if (trim($sql)!=='') $PDO->exec($sql);
  echo "Wallet withdrawal tables ready. Existing minimum setting preserved; initial minimum GHS 100.00.\n";
}catch(Throwable $e){fwrite(STDERR,"Withdrawal migration failed; inspect the database before retrying.\n");exit(1);}
