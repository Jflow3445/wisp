<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/db.php';
require_once __DIR__.'/../lib/common.php';
require_bearer($ENV['APP_SECRET']??'');
$st=$PDO->query("SELECT ref,msisdn,amount,method,payer_name,notes,created_at FROM payments WHERE status='pending' ORDER BY id DESC LIMIT 100");
json_out(['ok'=>true,'pending'=>$st->fetchAll()]);
